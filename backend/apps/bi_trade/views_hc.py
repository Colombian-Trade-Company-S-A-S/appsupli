"""
Homecenter: el mismo BI de Claro sobre sus propias tablas.

Aquí no hay cálculo propio. Los CRUD heredan los de Claro y cambian solo lo que
es de Homecenter —las tablas, los serializers y los encabezados `_hc` de las
plantillas—; el tablero llama al mismo cálculo con el canal HC. Lo que se
arregle en Claro queda arreglado aquí.

No existe el «Importar» general del informe del ERP: ese informe es de Claro.
Cada módulo sí tiene su plantilla y su importación. Además, el botón
«Importar» del tablero carga los reportes del portal de Homecenter —ventas, con
filtro por canal, e inventario— y ofrece crear los productos y las tiendas que
falten, con vista previa (`importar-reporte`).
"""
from django.db import connection, transaction
from django.db.models import Count, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response

from apps.core.excel import Columna, ColumnaExport, construir_plantilla

from .api_permissions import CanManageData, HasBiTradeApp, informe_de_la_ruta, puede_editar
from .canales import HC
from .catalogo_reporte import CREAR, OMITIR, MarcasDelReporte, capitalizada, decision_de
from .filters import InventarioHcFilter, MetaHcFilter, VentaHcFilter
from .models import (
    PRECIO_MAXIMO,
    CategoriaHc,
    InventarioHc,
    Materiales,
    MetaComercialHc,
    ProductoHc,
    PuntoVentaHc,
    RegionalHc,
    VentaHc,
)
from .query_hc import (
    ErrorDeQuery,
    ProductoHcDelReporte,
    canales_del_reporte,
    leer_query,
    leer_query_ventas,
    leer_reporte_inventario,
    leer_reporte_ventas,
    seleccionar_ventas,
    venta_distancia_del_reporte,
)
from .serializers import (
    InventarioHcSerializer,
    MetaHcSerializer,
    ProductoHcSerializer,
    PuntoVentaHcSerializer,
    VentaHcSerializer,
)
from .views import (
    InventarioViewSet,
    MetaViewSet,
    ProductoViewSet,
    PuntoVentaViewSet,
    VentaViewSet,
    _calcular_avance,
    _calcular_dia,
    exportar_avance,
    exportar_dia,
    opciones_de,
)


class _PlantillaHc:
    """
    Las plantillas de HC hablan con encabezados `_hc`; el serializer, no.

    El archivo que se descarga y se sube dice `id_producto_hc`, como la columna
    en la base. El serializer sigue usando los nombres de Claro, que son los de
    las pantallas; aquí se traduce de uno a otro al importar.
    """

    ENCABEZADOS = {
        'id_punto_venta_hc': 'id_punto_venta',
        'id_producto_hc': 'id_producto',
        'precio_venta_hc': 'precio_venta_claro',
    }

    def fila_a_payload(self, fila: dict) -> dict:
        return {
            self.ENCABEZADOS.get(clave, clave): valor
            for clave, valor in fila.items()
            if clave != '_fila'
        }


def _dependencias_hc() -> list[tuple[str, int]]:
    """Lo que impide vaciar los catálogos de HC: sus ventas, inventario y metas."""
    return [
        ('ventas', VentaHc.objects.count()),
        ('registros de inventario', InventarioHc.objects.count()),
        ('metas', MetaComercialHc.objects.count()),
    ]


_PRODUCTO_HC = Columna(
    'id_producto_hc', ayuda='Código de un producto Homecenter que ya exista.', ejemplo='HCP-001'
)
_PUNTO_HC = Columna(
    'id_punto_venta_hc', ayuda='Código de una tienda Homecenter que ya exista.', ejemplo='HC-101'
)


# ── Exportación ────────────────────────────────────────────────────────────
# Cada módulo de HC se descarga con todos los campos de su modelo. Las ventas,
# el inventario y las metas traen además los datos de su producto y su tienda,
# para no tener que cruzar el archivo con los catálogos a mano. Las fechas de
# creación y edición no van: son de auditoría, no del negocio.

_EXPORT_PRODUCTO = [
    ColumnaExport('Código producto (SKU)', 'id_producto'),
    ColumnaExport('EAN', 'id_producto__ean'),
    ColumnaExport('SKU Coltrade', 'id_producto__sku_coltrade'),
    ColumnaExport('Producto', 'id_producto__nombre_producto'),
    ColumnaExport('Marca', 'id_producto__marca'),
]
_EXPORT_PUNTO = [
    ColumnaExport('Código punto de venta', 'id_punto_venta'),
    ColumnaExport('Punto de venta', 'id_punto_venta__nombre_pdv'),
    ColumnaExport('Regional', 'id_punto_venta__regional'),
    ColumnaExport('Materiales', 'id_punto_venta__materiales'),
    ColumnaExport('Categoría', 'id_punto_venta__categoria'),
]
# El precio de cada fila es el de su fecha: el día de la venta, hoy para el
# inventario. Las metas de HC no tienen precio: van en pesos, por tienda.
_EXPORT_PRECIO_DIA = ColumnaExport('Precio Coltrade', 'precio_dia', 'dinero')
_EXPORT_PRECIO_HOY = ColumnaExport('Precio Coltrade', 'precio_hoy', 'dinero')


def _error(mensaje: str, **extra) -> Response:
    return Response(
        {'code': 'invalid', 'message': mensaje, **extra}, status=status.HTTP_400_BAD_REQUEST
    )


def _archivo_query(request):
    """El .xlsx subido, o la respuesta de error si no llegó o no es un .xlsx."""
    archivo = request.FILES.get('archivo')
    if archivo is None:
        return None, _error('No llegó ningún archivo.')
    if not archivo.name.lower().endswith('.xlsx'):
        return None, _error('El archivo debe ser un Excel .xlsx.')
    return archivo, None


class _Cruce:
    """
    Qué SKU y tiendas del archivo existen en el canal, en dos consultas.

    Lo que no existe no entra: se cuenta por fila y se guarda el código, para
    decir cuáles hay que crear antes de volver a subir el archivo. Por defecto
    cruza con HC; Falabella le pasa sus modelos.
    """

    def __init__(self, pares, modelo_producto=ProductoHc, modelo_punto=PuntoVentaHc):
        pares = list(pares)
        self.productos = set(
            modelo_producto.objects.filter(pk__in={sku for sku, _ in pares}).values_list(
                'id_producto', flat=True
            )
        )
        self.puntos = set(
            modelo_punto.objects.filter(pk__in={tienda for _, tienda in pares}).values_list(
                'id_punto_venta', flat=True
            )
        )
        self.sin_producto: set[str] = set()
        self.sin_punto: set[str] = set()
        self.filas_sin_producto = self.filas_sin_punto = 0

    def entra(self, sku: str, tienda: str) -> bool:
        if sku not in self.productos:
            self.sin_producto.add(sku)
            self.filas_sin_producto += 1
            return False
        if tienda not in self.puntos:
            self.sin_punto.add(tienda)
            self.filas_sin_punto += 1
            return False
        return True

    @property
    def omitidas(self) -> int:
        return self.filas_sin_producto + self.filas_sin_punto

    def resumen(self) -> dict:
        return {
            'sin_producto': self.filas_sin_producto,
            'sin_punto_venta': self.filas_sin_punto,
            # Los códigos, no solo cuántos: son los que hay que crear en el canal.
            'productos_faltantes': sorted(self.sin_producto),
            'puntos_faltantes': sorted(self.sin_punto),
        }


_SIN_CRUCE = (
    'Ninguna fila del archivo cruza con los productos y tiendas de HC, así que no se '
    'cambió nada. Revisa que existan los SKU y los EAN de tienda.'
)

#: Modo de la carga de ventas que borra los días que ya tenían ventas.
SOBRESCRIBIR = 'sobrescribir'

#: Número cualquiera, fijo, que identifica el bloqueo de las cargas de ventas HC.
_LLAVE_BLOQUEO_VENTAS = 710_001


def _bloquear_ventas_hc() -> None:
    """
    Una sola carga de ventas HC a la vez, hasta que termine su transacción.

    Sin esto, dos cargas del mismo archivo al mismo tiempo (un doble clic)
    verían los días vacíos y las dos guardarían: ventas duplicadas. El bloqueo
    es de Postgres; en SQLite (las pruebas) la base ya escribe de a una.
    """
    if connection.vendor == 'postgresql':
        with connection.cursor() as cursor:
            cursor.execute('SELECT pg_advisory_xact_lock(%s)', [_LLAVE_BLOQUEO_VENTAS])


def cargar_ventas_por_dia(
    modelo, nuevas: list, *, sobrescribir: bool, bloquear, resumen: dict, antes=None
):
    """
    Guarda ventas que no tienen código propio, día por día. Lo usan las cargas
    de ventas de HC y de Falabella.

    Subir dos veces el mismo archivo duplicaría todo, así que el corte es por
    día: si alguno de los días ya tiene ventas no se guarda nada y vuelve el
    409 `dias_con_ventas` con esos días. Con `sobrescribir` se borran las
    ventas de esos días y quedan las nuevas. `antes` corre justo antes de
    guardar, en la misma transacción —ya sin preguntas pendientes—: ahí se crea
    el catálogo que falte.

    Devuelve `(respuesta, eliminadas, lo que devolvió antes)`; `respuesta` es
    el 409, o `None` si se guardó.
    """
    dias = sorted({venta.fecha_venta for venta in nuevas})
    with transaction.atomic():
        bloquear()
        # Se mira ya con el bloqueo: lo que se ve aquí es lo que hay al guardar.
        ocupados = list(
            modelo.objects.filter(fecha_venta__in=dias)
            .values('fecha_venta')
            .annotate(registros=Count('id_venta'))
            .order_by('fecha_venta')
        )
        if ocupados and not sobrescribir:
            respuesta = Response(
                {
                    'code': 'dias_con_ventas',
                    'message': (
                        f'{len(ocupados)} día(s) del archivo ya tienen ventas cargadas. '
                        'Sobrescribe para reemplazarlas, o cancela.'
                    ),
                    'dias_con_ventas': [
                        {'fecha': fila['fecha_venta'].isoformat(), 'registros': fila['registros']}
                        for fila in ocupados
                    ],
                    **resumen,
                },
                status=status.HTTP_409_CONFLICT,
            )
            return respuesta, 0, None
        hecho = antes() if antes else None
        eliminadas, _ = modelo.objects.filter(fecha_venta__in=dias).delete()
        modelo.objects.bulk_create(nuevas, batch_size=500)
    return None, eliminadas, hecho


# ── Crear desde el reporte lo que falte: productos y tiendas ───────────────


class CatalogoPorCrearHc:
    """
    Los productos y las tiendas del reporte que no existen en HC, listos para
    crear con los datos del mismo archivo (ver `query_hc`).

    · Producto: código, EAN, SKU Coltrade, nombre y marca del reporte; el valor
      de una unidad va como precio Coltrade y precio HC (el inventario no trae
      valor: ahí quedan en 0, y se completan con `plantilla-sin-precio` de
      productos). La marca se busca en el catálogo sin
      importar mayúsculas ni tildes; si no está, se crea con la primera letra
      de cada palabra en mayúscula y el resto en minúscula («DIGITAL POS» →
      «Digital Pos»).
    · Tienda: EAN y nombre del reporte, regional Nacional, todos los
      materiales y categoría A.

    Tres consultas, sin importar cuánto traiga el archivo.
    """

    def __init__(self, productos: dict[str, ProductoHcDelReporte], tiendas: dict[str, str]):
        hay_productos = set(
            ProductoHc.objects.filter(pk__in=list(productos)).values_list('pk', flat=True)
        )
        hay_tiendas = set(
            PuntoVentaHc.objects.filter(pk__in=list(tiendas)).values_list('pk', flat=True)
        )
        self.marcas = MarcasDelReporte(capitalizada)
        self.productos: list[ProductoHc] = []
        for sku, producto in sorted(productos.items()):
            precio = producto.precio
            if sku in hay_productos or len(sku) > 60 or (precio or 0) > PRECIO_MAXIMO:
                continue
            self.productos.append(
                ProductoHc(
                    id_producto=sku,
                    ean=producto.ean,
                    sku_coltrade=producto.sku_coltrade,
                    nombre_producto=producto.nombre,
                    marca_id=self.marcas.resolver(producto.marca),
                    precio_venta_coltrade=precio,
                    precio_venta_hc=precio,
                )
            )
        self.tiendas = [
            PuntoVentaHc(
                id_punto_venta=ean,
                nombre_pdv=nombre,
                regional=RegionalHc.NACIONAL,
                materiales=Materiales.TODOS,
                categoria=CategoriaHc.A,
            )
            for ean, nombre in sorted(tiendas.items(), key=lambda t: t[1])
            if ean not in hay_tiendas and len(ean) <= 60
        ]

    def __bool__(self) -> bool:
        return bool(self.productos or self.tiendas)

    @property
    def skus(self) -> set[str]:
        return {p.id_producto for p in self.productos}

    @property
    def eans(self) -> set[str]:
        return {t.id_punto_venta for t in self.tiendas}

    def pregunta(self) -> Response:
        """409 `productos_por_crear`: la pregunta de si crearlos, con la vista previa."""
        partes = []
        if self.productos:
            partes.append(f'{len(self.productos)} producto(s)')
        if self.tiendas:
            partes.append(f'{len(self.tiendas)} punto(s) de venta')
        return Response(
            {
                'code': 'productos_por_crear',
                'message': f'{" y ".join(partes)} del archivo no existen en HC. '
                '¿Deseas crearlos antes de importar?',
                'productos_por_crear': [
                    {
                        'id_producto': p.id_producto,
                        'nombre_producto': p.nombre_producto,
                        'ean': p.ean,
                        'sku_coltrade': p.sku_coltrade,
                        'marca': p.marca_id,
                        'marca_nueva': self.marcas.es_nueva(p.marca_id),
                        'precio': p.precio_venta_coltrade,
                    }
                    for p in self.productos
                ],
                'puntos_por_crear': [
                    {
                        'id_punto_venta': t.id_punto_venta,
                        'nombre_pdv': t.nombre_pdv,
                        'regional': t.regional,
                        'materiales': t.materiales,
                        'categoria': t.categoria,
                    }
                    for t in self.tiendas
                ],
                'marcas_nuevas': sorted(self.marcas.nuevas.values()),
                # Aquí las tiendas sí se crean: no queda ninguna faltante.
                'puntos_faltantes': [],
            },
            status=status.HTTP_409_CONFLICT,
        )

    def crear(self) -> dict:
        self.marcas.crear()
        # Si otra carga creó lo mismo un instante antes, no es un error: ya existe.
        PuntoVentaHc.objects.bulk_create(self.tiendas, ignore_conflicts=True)
        ProductoHc.objects.bulk_create(self.productos, ignore_conflicts=True)
        return {
            'productos_creados': len(self.productos),
            # Los que quedaron en 0: hay que ponerles precio con la plantilla.
            'productos_sin_precio': sum(1 for p in self.productos if not p.precio_venta_coltrade),
            'puntos_creados': len(self.tiendas),
            'marcas_creadas': sorted(self.marcas.nuevas.values()),
        }


_SIN_CREAR = {
    'productos_creados': 0,
    'productos_sin_precio': 0,
    'puntos_creados': 0,
    'marcas_creadas': [],
}


def con_lo_creado(mensaje: str, creado: dict) -> str:
    """«Se crearon 3 producto(s), 2 punto(s) de venta y 1 marca(s). …»"""
    partes = [
        f'{creado[clave]} {nombre}'
        for clave, nombre in (
            ('productos_creados', 'producto(s)'),
            ('puntos_creados', 'punto(s) de venta'),
        )
        if creado.get(clave)
    ]
    if creado.get('marcas_creadas'):
        partes.append(f'{len(creado["marcas_creadas"])} marca(s)')
    if not partes:
        return mensaje
    lista = ', '.join(partes[:-1]) + (' y ' if len(partes) > 1 else '') + partes[-1]
    return f'Se crearon {lista}. {mensaje}'


def sin_permiso_para_crear(request, por_crear, decision: str) -> Response | None:
    """
    Crear lo que falta al importar pide poder editar eso en el informe de la
    ruta: productos para los productos y puntos de venta para las tiendas. Sin
    el permiso, el 403 dice cuál falta; importar sin crearlos sigue disponible.
    """
    if decision != CREAR:
        return None
    user, informe = request.user, informe_de_la_ruta(request.path)
    faltan = []
    if por_crear.productos and not puede_editar(user, 'productos', informe):
        faltan.append('productos')
    if por_crear.tiendas and not puede_editar(user, 'puntos-venta', informe):
        faltan.append('puntos de venta')
    if not faltan:
        return None
    return Response(
        {
            'code': 'permission_denied',
            'message': f'No tienes permiso para crear {" ni ".join(faltan)}. Importa sin '
            'crearlos, o pide el permiso.',
        },
        status=status.HTTP_403_FORBIDDEN,
    )


def _canales_elegidos(request) -> set[str]:
    """Los canales que se eligieron; vacío es todos."""
    obtener = getattr(request.data, 'getlist', None)
    valores = obtener('canales') if obtener else request.data.get('canales') or []
    return {str(v).strip() for v in valores if str(v).strip()}


class PuntoVentaHcViewSet(_PlantillaHc, PuntoVentaViewSet):
    queryset = PuntoVentaHc.objects.annotate(conteo_ventas=Count('ventas')).order_by('nombre_pdv')
    serializer_class = PuntoVentaHcSerializer
    nombre_plural = 'los puntos de venta Homecenter'
    archivo_plantilla = 'plantilla-puntos-venta-hc'
    archivo_exportacion = 'puntos-venta-hc'
    columnas_exportacion = [
        ColumnaExport('Código punto de venta', 'id_punto_venta'),
        ColumnaExport('Punto de venta', 'nombre_pdv'),
        ColumnaExport('Regional', 'regional'),
        ColumnaExport('Materiales', 'materiales'),
        ColumnaExport('Categoría', 'categoria'),
        ColumnaExport('Ventas registradas', 'conteo_ventas', 'entero'),
    ]
    columnas_excel = [
        Columna('id_punto_venta_hc', ayuda='Código de la tienda. Máximo 60 caracteres.',
                ejemplo='HC-101'),
        Columna('nombre_pdv', ayuda='Máximo 100 caracteres.', ejemplo='Homecenter Calle 80'),
        Columna('regional', tipo='opcion', obligatoria=False, opciones=list(RegionalHc.values),
                ejemplo=RegionalHc.ZONA_CENTRO.value),
        Columna('materiales', tipo='opcion', obligatoria=False, opciones=list(Materiales.values),
                ejemplo=Materiales.TODOS.value),
        Columna('categoria', tipo='opcion', obligatoria=False,
                opciones=list(CategoriaHc.values), ayuda='Opcional.',
                ejemplo=CategoriaHc.A.value),
    ]

    def dependencias(self):
        return _dependencias_hc()


class ProductoHcViewSet(_PlantillaHc, ProductoViewSet):
    canal = HC
    queryset = ProductoHc.objects.annotate(conteo_ventas=Count('ventas')).order_by(
        'nombre_producto'
    )
    serializer_class = ProductoHcSerializer
    nombre_plural = 'los productos Homecenter'
    archivo_plantilla = 'plantilla-productos-hc'
    archivo_exportacion = 'productos-hc'
    columnas_exportacion = [
        ColumnaExport('Código producto (SKU)', 'id_producto'),
        ColumnaExport('EAN', 'ean'),
        ColumnaExport('SKU Coltrade', 'sku_coltrade'),
        ColumnaExport('Producto', 'nombre_producto'),
        ColumnaExport('Marca', 'marca'),
        ColumnaExport('Precio Coltrade base', 'precio_venta_coltrade', 'dinero'),
        ColumnaExport('Precio Coltrade hoy', 'precio_hoy', 'dinero'),
        ColumnaExport('Precio Homecenter', 'precio_venta_hc', 'dinero'),
        ColumnaExport('Ventas registradas', 'conteo_ventas', 'entero'),
    ]
    search_fields = ('id_producto', 'ean', 'sku_coltrade', 'nombre_producto', 'marca__nombre')
    nota_plantilla = (
        'Si el código ya existe, la fila actualiza ese producto en vez de duplicarlo. '
        'Solo el código y el nombre son obligatorios. Los precios van en pesos, sin '
        'decimales ni puntos de miles; un producto sin precio Coltrade no suma dinero.'
    )
    columnas_excel = [
        Columna('id_producto_hc', ayuda='Código del producto. Máximo 60 caracteres.',
                ejemplo='HCP-001'),
        Columna('ean', obligatoria=False, ayuda='Opcional. Código de barras.',
                ejemplo='7701234567890'),
        Columna('sku_coltrade', obligatoria=False, ayuda='Opcional. Máximo 60 caracteres.',
                ejemplo='CT-AIW-001'),
        Columna('nombre_producto', ayuda='Máximo 60 caracteres.', ejemplo='Torre de sonido Aiwa'),
        Columna('marca', obligatoria=False,
                ayuda='Opcional. Una marca de la lista de marcas. Da igual mayúsculas o tildes.',
                ejemplo='Aiwa'),
        Columna('precio_venta_coltrade', tipo='entero', obligatoria=False,
                ayuda='Opcional. Hasta 100.000.000. Con este precio se calculan los ingresos.',
                ejemplo='1094413'),
        Columna('precio_venta_hc', tipo='entero', obligatoria=False,
                ayuda='Opcional. Precio en Homecenter. Hasta 100.000.000.', ejemplo='1199900'),
    ]

    def dependencias(self):
        return _dependencias_hc()

    @action(
        detail=False,
        methods=['get'],
        url_path='plantilla-sin-precio',
        permission_classes=[HasBiTradeApp, CanManageData],
    )
    def plantilla_sin_precio(self, request):
        """
        La plantilla de productos ya llena con los que no tienen precio.

        Son, sobre todo, los que se crearon desde el reporte de inventario, que
        no trae valor y los deja en 0. Trae todos sus datos y los precios en
        blanco: se completan y se sube por el «Importar Excel» de productos,
        que actualiza cada producto por su código en vez de duplicarlo.
        """
        sin_precio = (
            ProductoHc.objects.filter(
                Q(precio_venta_coltrade__isnull=True)
                | Q(precio_venta_coltrade=0)
                | Q(precio_venta_hc__isnull=True)
                | Q(precio_venta_hc=0)
            )
            .order_by('marca', 'nombre_producto')
            .values('id_producto', 'ean', 'sku_coltrade', 'nombre_producto', 'marca')
        )
        filas = [
            {
                'id_producto_hc': p['id_producto'],
                'ean': p['ean'],
                'sku_coltrade': p['sku_coltrade'],
                'nombre_producto': p['nombre_producto'],
                'marca': p['marca'],
                # Los precios van en blanco: es lo que hay que llenar.
            }
            for p in sin_precio
        ]
        contenido = construir_plantilla(
            'Productos Homecenter sin precio',
            self.columnas_excel,
            'Pon el precio Coltrade y el precio Homecenter de cada producto, en pesos, sin '
            'decimales ni puntos de miles, y súbela en Productos con «Importar Excel»: cada '
            'fila actualiza su producto por el código. Un precio que dejes en blanco no se toca.',
            filas,
        )
        respuesta = HttpResponse(
            contenido,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        marca = timezone.localtime().strftime('%Y%m%d')
        respuesta['Content-Disposition'] = (
            f'attachment; filename="productos-hc-sin-precio-{marca}.xlsx"'
        )
        return respuesta


class VentaHcViewSet(_PlantillaHc, VentaViewSet):
    canal = HC
    queryset = VentaHc.objects.select_related('id_producto', 'id_punto_venta').order_by(
        '-fecha_venta', '-id_venta'
    )
    serializer_class = VentaHcSerializer
    filterset_class = VentaHcFilter
    nombre_plural = 'las ventas Homecenter'
    archivo_plantilla = 'plantilla-ventas-hc'
    archivo_exportacion = 'ventas-hc'
    columnas_exportacion = [
        ColumnaExport('ID venta', 'id_venta', 'entero'),
        ColumnaExport('Fecha', 'fecha_venta', 'fecha'),
        *_EXPORT_PRODUCTO,
        *_EXPORT_PUNTO,
        ColumnaExport('Cantidad vendida', 'cantidad_vendida', 'entero'),
        _EXPORT_PRECIO_DIA,
        ColumnaExport('Total', 'total', 'dinero'),
    ]
    con_puntos = False
    columnas_excel = [
        _PRODUCTO_HC,
        _PUNTO_HC,
        Columna('fecha_venta', tipo='fecha', ayuda='Formato AAAA-MM-DD.', ejemplo='2026-03-15'),
        Columna('cantidad_vendida', tipo='entero', ayuda='Unidades vendidas. Mínimo 1.',
                ejemplo='3'),
    ]

    @action(
        detail=False,
        methods=['post'],
        url_path='importar-query',
        permission_classes=[HasBiTradeApp, CanManageData],
    )
    def importar_query(self, request):
        """
        Carga las ventas del querie del portal de Homecenter.

        Entran todas las fechas del archivo, solo las filas con 1 unidad o más.
        Una venta no tiene código propio, así que subir dos veces el mismo
        archivo duplicaría todo; por eso el corte es por día: si alguno de los
        días del archivo ya tiene ventas, no se guarda nada y se responde 409
        con esos días. Con `modo=sobrescribir` se borran las ventas de los días
        del archivo y quedan las del archivo.
        """
        archivo, error = _archivo_query(request)
        if error:
            return error
        try:
            lectura = leer_query_ventas(archivo)
        except ErrorDeQuery as exc:
            return _error(str(exc))

        cruce = _Cruce((fila.sku, fila.tienda) for fila in lectura.ventas)
        nuevas = [
            VentaHc(
                id_producto_id=fila.sku,
                id_punto_venta_id=fila.tienda,
                fecha_venta=fila.fecha,
                cantidad_vendida=fila.unidades,
            )
            for fila in lectura.ventas
            if cruce.entra(fila.sku, fila.tienda)
        ]
        dias = sorted({venta.fecha_venta for venta in nuevas})
        resumen = {
            'dias': [dia.isoformat() for dia in dias],
            'filas_leidas': lectura.filas_leidas,
            'sin_unidades': lectura.sin_unidades,
            'sin_tienda': lectura.sin_tienda,
            **cruce.resumen(),
        }
        if not nuevas:
            return _error(_SIN_CRUCE, **resumen)

        respuesta, eliminadas, _ = cargar_ventas_por_dia(
            VentaHc,
            nuevas,
            sobrescribir=(request.data.get('modo') or '').strip() == SOBRESCRIBIR,
            bloquear=_bloquear_ventas_hc,
            resumen=resumen,
        )
        if respuesta:
            return respuesta

        mensaje = f'Ventas cargadas: {len(nuevas)} registro(s) de {len(dias)} día(s)' + (
            f', reemplazando {eliminadas} que ya estaban.' if eliminadas else '.'
        )
        if cruce.omitidas:
            mensaje += f' {cruce.omitidas} quedaron fuera porque su SKU o tienda no existe en HC.'
        return Response(
            {
                **resumen,
                'creadas': len(nuevas),
                'unidades': sum(venta.cantidad_vendida for venta in nuevas),
                'eliminadas': eliminadas,
                'message': mensaje,
            }
        )

    @action(
        detail=False,
        methods=['post'],
        url_path='importar-reporte',
        permission_classes=[HasBiTradeApp, CanManageData],
    )
    def importar_reporte(self, request):
        """
        Carga las ventas del reporte del portal de Homecenter, con filtro por canal.

        Es el botón «Importar» del tablero. Entran las filas con 1 unidad o más
        de los canales elegidos (`canales`, repetido; sin él, todos), sin las de
        Venta Distancia salvo que se pida (`incluir_venta_distancia=1`). Los
        pasos, sin guardar nada hasta el último:

        1. `previsualizar=1`: no carga; devuelve los canales que trae el
           archivo, con cuántas ventas y unidades, y cuánto es de Venta
           Distancia, para elegir.
        2. Si faltan productos o tiendas, 409 `productos_por_crear` con la vista
           previa. `productos=crear` los crea antes de cargar; `productos=omitir`
           carga sin ellos.
        3. Si alguno de los días ya tiene ventas, 409 `dias_con_ventas`;
           `modo=sobrescribir` reemplaza las ventas de esos días (de todos los
           canales: la venta no guarda su canal).
        """
        archivo, error = _archivo_query(request)
        if error:
            return error
        try:
            filas = leer_reporte_ventas(archivo)
        except ErrorDeQuery as exc:
            return _error(str(exc))

        if (request.data.get('previsualizar') or '').strip():
            return Response(
                {
                    'canales': canales_del_reporte(filas),
                    'venta_distancia': venta_distancia_del_reporte(filas),
                    'dias': sorted({f.fecha.isoformat() for f in filas if f.unidades >= 1}),
                    'filas_leidas': len(filas),
                }
            )

        canales = _canales_elegidos(request)
        # Venta Distancia no entra salvo que se pida (`incluir_venta_distancia=1`).
        incluir_vd = (request.data.get('incluir_venta_distancia') or '').strip() in ('1', 'true')
        seleccion = seleccionar_ventas(filas, canales, incluir_vd)
        if not seleccion.ventas:
            return _error(
                'Los canales elegidos no traen ventas de 1 unidad o más, así que no se cambió '
                'nada.'
            )

        por_crear = CatalogoPorCrearHc(seleccion.productos, seleccion.tiendas)
        decision = decision_de(request)
        if por_crear and decision not in (CREAR, OMITIR):
            return por_crear.pregunta()
        sin_permiso = sin_permiso_para_crear(request, por_crear, decision)
        if sin_permiso:
            return sin_permiso

        cruce = _Cruce((fila.sku, fila.tienda) for fila in seleccion.ventas)
        if decision == CREAR:
            # Lo que se va a crear cuenta como existente al cruzar.
            cruce.productos |= por_crear.skus
            cruce.puntos |= por_crear.eans
        nuevas = [
            VentaHc(
                id_producto_id=fila.sku,
                id_punto_venta_id=fila.tienda,
                fecha_venta=fila.fecha,
                cantidad_vendida=fila.unidades,
            )
            for fila in seleccion.ventas
            if cruce.entra(fila.sku, fila.tienda)
        ]
        dias = sorted({venta.fecha_venta for venta in nuevas})
        resumen = {
            'dias': [dia.isoformat() for dia in dias],
            'canales': sorted(canales),
            'filas_leidas': seleccion.filas_leidas,
            'fuera_de_canal': seleccion.fuera_de_canal,
            'incluye_venta_distancia': incluir_vd,
            'de_venta_distancia': seleccion.de_venta_distancia,
            'sin_unidades': seleccion.sin_unidades,
            'sin_tienda': seleccion.sin_tienda,
            **cruce.resumen(),
        }
        if not nuevas:
            return _error(_SIN_CRUCE, **resumen)

        respuesta, eliminadas, creado = cargar_ventas_por_dia(
            VentaHc,
            nuevas,
            sobrescribir=(request.data.get('modo') or '').strip() == SOBRESCRIBIR,
            bloquear=_bloquear_ventas_hc,
            resumen=resumen,
            antes=por_crear.crear if decision == CREAR else None,
        )
        if respuesta:
            return respuesta
        creado = creado or _SIN_CREAR

        mensaje = f'Ventas cargadas: {len(nuevas)} registro(s) de {len(dias)} día(s)' + (
            f', reemplazando {eliminadas} que ya estaban.' if eliminadas else '.'
        )
        if seleccion.de_venta_distancia:
            mensaje += f' {seleccion.de_venta_distancia} fila(s) de Venta Distancia no entran.'
        if cruce.omitidas:
            mensaje += f' {cruce.omitidas} quedaron fuera porque su SKU o tienda no existe en HC.'
        return Response(
            {
                **resumen,
                **creado,
                'creadas': len(nuevas),
                'unidades': sum(venta.cantidad_vendida for venta in nuevas),
                'eliminadas': eliminadas,
                'message': con_lo_creado(mensaje, creado),
            }
        )


class InventarioHcViewSet(_PlantillaHc, InventarioViewSet):
    canal = HC
    queryset = InventarioHc.objects.select_related('id_producto', 'id_punto_venta').order_by(
        'id_punto_venta__nombre_pdv', 'id_producto__nombre_producto'
    )
    serializer_class = InventarioHcSerializer
    filterset_class = InventarioHcFilter
    nombre_plural = 'los registros de inventario Homecenter'
    archivo_plantilla = 'plantilla-inventario-hc'
    archivo_exportacion = 'inventario-hc'
    columnas_exportacion = [
        ColumnaExport('ID inventario', 'id_inventario', 'entero'),
        *_EXPORT_PRODUCTO,
        *_EXPORT_PUNTO,
        ColumnaExport('Cantidad en inventario', 'cantidad_inventario', 'entero'),
        _EXPORT_PRECIO_HOY,
        ColumnaExport('Valorizado', 'valorizado', 'dinero'),
    ]
    columnas_excel = [
        _PRODUCTO_HC,
        _PUNTO_HC,
        Columna('cantidad_inventario', tipo='entero', ayuda='Existencias actuales. Cero = agotado.',
                ejemplo='24'),
    ]

    @action(
        detail=False,
        methods=['post'],
        url_path='importar-query',
        permission_classes=[HasBiTradeApp, CanManageData],
    )
    def importar_query(self, request):
        """
        Reemplaza el inventario de HC con el querie del portal de Homecenter.

        Es la foto del stock: se borra lo que había y queda lo del archivo. Una
        fila cuyo SKU o tienda no existe en HC no entra; se cuenta y se dice
        cuáles fueron, para poder crearlos y volver a subir. Si ninguna fila
        cruza, no se borra nada: vaciar el inventario sin con qué reemplazarlo
        sería perder el dato.
        """
        archivo, error = _archivo_query(request)
        if error:
            return error
        try:
            lectura = leer_query(archivo)
        except ErrorDeQuery as exc:
            return _error(str(exc))

        cruce = _Cruce(lectura.inventario)
        nuevos = [
            InventarioHc(
                id_producto_id=sku, id_punto_venta_id=tienda, cantidad_inventario=unidades
            )
            for (sku, tienda), unidades in sorted(lectura.inventario.items())
            if cruce.entra(sku, tienda)
        ]

        resumen = {
            'fecha': lectura.fecha.isoformat(),
            'fechas_en_archivo': [f.isoformat() for f in lectura.fechas],
            'filas_del_dia': lectura.filas_del_dia,
            'de_otros_dias': lectura.de_otros_dias,
            'sin_unidades': lectura.sin_unidades,
            'sin_tienda': lectura.sin_tienda,
            **cruce.resumen(),
        }
        if not nuevos:
            return _error(_SIN_CRUCE, **resumen)

        with transaction.atomic():
            eliminados, _ = InventarioHc.objects.all().delete()
            InventarioHc.objects.bulk_create(nuevos, batch_size=500)

        mensaje = f'Inventario del {lectura.fecha:%d/%m/%Y} cargado: {len(nuevos)} registro(s).'
        if cruce.omitidas:
            mensaje += f' {cruce.omitidas} quedaron fuera porque su SKU o tienda no existe en HC.'
        return Response(
            {
                **resumen,
                'creados': len(nuevos),
                'unidades': sum(fila.cantidad_inventario for fila in nuevos),
                'eliminados': eliminados,
                'message': mensaje,
            }
        )

    @action(
        detail=False,
        methods=['post'],
        url_path='importar-reporte',
        permission_classes=[HasBiTradeApp, CanManageData],
    )
    def importar_reporte(self, request):
        """
        Reemplaza el inventario de HC con el reporte «Inventario» del portal.

        Es el botón «Importar» del tablero. Es la foto del stock del día más
        reciente del archivo: `Inventario Unidades Tienda` de 1 o más, por
        `Código SKU` y `EAN Ubicación` (vacío va a `TIENDA_SIN_EAN`). Como en
        las ventas, si faltan productos o tiendas se pregunta primero (409
        `productos_por_crear`, luego `productos=crear` u `omitir`); los
        productos creados desde aquí quedan con precio 0, porque el reporte no
        lo trae, y se les pone precio con `plantilla-sin-precio` de productos.
        Si ninguna fila cruza no se borra nada.
        """
        archivo, error = _archivo_query(request)
        if error:
            return error
        try:
            lectura = leer_reporte_inventario(archivo)
        except ErrorDeQuery as exc:
            return _error(str(exc))

        por_crear = CatalogoPorCrearHc(lectura.productos, lectura.tiendas)
        decision = decision_de(request)
        if por_crear and decision not in (CREAR, OMITIR):
            return por_crear.pregunta()
        sin_permiso = sin_permiso_para_crear(request, por_crear, decision)
        if sin_permiso:
            return sin_permiso

        cruce = _Cruce(lectura.inventario)
        if decision == CREAR:
            cruce.productos |= por_crear.skus
            cruce.puntos |= por_crear.eans
        nuevos = [
            InventarioHc(
                id_producto_id=sku, id_punto_venta_id=tienda, cantidad_inventario=unidades
            )
            for (sku, tienda), unidades in sorted(lectura.inventario.items())
            if cruce.entra(sku, tienda)
        ]
        resumen = {
            'fecha': lectura.fecha.isoformat(),
            'fechas_en_archivo': [f.isoformat() for f in lectura.fechas],
            'filas_del_dia': lectura.filas_del_dia,
            'de_otros_dias': lectura.de_otros_dias,
            'sin_unidades': lectura.sin_unidades,
            'sin_tienda': lectura.sin_tienda,
            **cruce.resumen(),
        }
        if not nuevos:
            return _error(_SIN_CRUCE, **resumen)

        with transaction.atomic():
            creado = por_crear.crear() if decision == CREAR else _SIN_CREAR
            eliminados, _ = InventarioHc.objects.all().delete()
            InventarioHc.objects.bulk_create(nuevos, batch_size=500)

        mensaje = f'Inventario del {lectura.fecha:%d/%m/%Y} cargado: {len(nuevos)} registro(s).'
        if cruce.omitidas:
            mensaje += f' {cruce.omitidas} quedaron fuera porque su SKU o tienda no existe en HC.'
        return Response(
            {
                **resumen,
                **creado,
                'creados': len(nuevos),
                'unidades': sum(fila.cantidad_inventario for fila in nuevos),
                'eliminados': eliminados,
                'message': con_lo_creado(mensaje, creado),
            }
        )


class MetaHcViewSet(_PlantillaHc, MetaViewSet):
    """
    Las metas de HC: una por tienda y mes, en pesos (ver `MetaComercialHc`).

    El resto de canales fija la meta de cada producto en unidades; en HC llega
    el total de la tienda, así que la plantilla pide solo el punto, el mes y
    el valor.
    """

    canal = HC
    queryset = MetaComercialHc.objects.select_related('id_punto_venta').order_by(
        '-fecha_meta', 'id_punto_venta__nombre_pdv'
    )
    serializer_class = MetaHcSerializer
    filterset_class = MetaHcFilter
    nombre_plural = 'las metas Homecenter'
    archivo_plantilla = 'plantilla-metas-hc'
    archivo_exportacion = 'metas-hc'
    # Este canal no mide en puntos: ni los suma, ni los ordena, ni los exporta.
    con_puntos = False
    search_fields = ('id_punto_venta__id_punto_venta', 'id_punto_venta__nombre_pdv')
    ordering_fields = ('fecha_meta', 'total_meta')
    columnas_exportacion = [
        ColumnaExport('ID meta', 'id_meta', 'entero'),
        ColumnaExport('Periodo', 'fecha_meta', 'fecha'),
        *_EXPORT_PUNTO,
        ColumnaExport('Meta dinero', 'total_meta', 'dinero'),
    ]
    nota_plantilla = (
        'Una fila por punto de venta y mes. La meta se identifica por el punto y el mes: si '
        'ya existe la fila la actualiza, y otro mes se carga sin pisar el anterior. La fecha '
        'solo dice de qué mes es (cualquier día del mes vale). total_meta es lo que debe '
        'vender la tienda en el mes, en pesos, sin decimales ni puntos de miles.'
    )
    columnas_excel = [
        _PUNTO_HC,
        Columna('fecha_meta', tipo='fecha',
                ayuda='Mes de la meta, formato AAAA-MM-DD (por ejemplo, el día 1).',
                ejemplo='2026-11-01'),
        Columna('total_meta', tipo='entero',
                ayuda='Meta de venta de la tienda en el mes, en pesos.', ejemplo='90800861'),
    ]
    campos_clave = ('id_punto_venta', 'fecha_meta')

    def agregados(self):
        return {
            'meta_dinero': Coalesce(Sum('total_meta'), Value(0)),
            'puntos_venta': Count('id_punto_venta', distinct=True),
        }

    def fila_a_payload(self, fila: dict) -> dict:
        payload = super().fila_a_payload(fila)
        # El mes, no el día: la llave (punto, mes) tiene que cruzar con lo que
        # ya existe aunque el archivo traiga el 15 en vez del 1.
        fecha = payload.get('fecha_meta')
        if hasattr(fecha, 'replace'):
            payload['fecha_meta'] = fecha.replace(day=1)
        return payload


# ── El tablero de HC: el mismo cálculo, con el canal HC ────────────────────

@api_view(['GET'])
@permission_classes([HasBiTradeApp])
def opciones_hc(request):
    return Response(opciones_de(HC))


@api_view(['GET'])
@permission_classes([HasBiTradeApp])
def avance_mensual_hc(request):
    return Response(_calcular_avance(request, HC))


@api_view(['GET'])
@permission_classes([HasBiTradeApp])
def avance_mensual_hc_exportar(request):
    return exportar_avance(request, HC)


@api_view(['GET'])
@permission_classes([HasBiTradeApp])
def cumplimiento_diario_hc(request):
    return Response(_calcular_dia(request, HC))


@api_view(['GET'])
@permission_classes([HasBiTradeApp])
def cumplimiento_diario_hc_exportar(request):
    return exportar_dia(request, HC)
