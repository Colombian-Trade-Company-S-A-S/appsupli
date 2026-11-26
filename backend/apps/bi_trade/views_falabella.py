"""
Falabella: el mismo BI de Claro sobre sus propias tablas, igual que Homecenter.

Aquí no hay cálculo propio. Los CRUD heredan los de Claro y cambian solo lo que
es de Falabella —las tablas, los serializers y los encabezados `_falabella` de
las plantillas—; el tablero llama al mismo cálculo con el canal FALABELLA.

No existe el «Importar» general del informe del ERP: ese informe es de Claro.
Cada módulo sí tiene su plantilla y su importación. Además, las ventas y el
inventario se cargan con los reportes .csv del portal de Falabella
(`importar-reporte`, ver `reporte_falabella`), igual que los queries de HC:
entra todo, tenga meta o no, menos Falabella.com, y los productos y tiendas
que falten se ofrecen para crear con los datos del mismo archivo.
"""
from django.db import connection, transaction
from django.db.models import Count
from rest_framework import status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response

from apps.core.excel import Columna

from .api_permissions import CanManageData, HasBiTradeApp
from .canales import FALABELLA
from .catalogo_reporte import CREAR, OMITIR, MarcasDelReporte, decision_de
from .filters import InventarioFalabellaFilter, MetaFalabellaFilter, VentaFalabellaFilter
from .models import (
    PRECIO_MAXIMO,
    InventarioFalabella,
    Materiales,
    MetaComercialFalabella,
    ProductoFalabella,
    PuntoVentaFalabella,
    RegionalFalabella,
    VentaFalabella,
)
from .reporte_falabella import ErrorDeReporte, ProductoDelReporte, leer_inventario, leer_ventas
from .serializers import (
    InventarioFalabellaSerializer,
    MetaFalabellaSerializer,
    ProductoFalabellaSerializer,
    PuntoVentaFalabellaSerializer,
    VentaFalabellaSerializer,
)
from .views import (
    InventarioViewSet,
    MetaViewSet,
    ProductoViewSet,
    PuntoVentaViewSet,
    VentasConMeta,
    VentaViewSet,
    _calcular_avance,
    _calcular_dia,
    aviso_sin_meta,
    exportar_avance,
    exportar_dia,
    opciones_de,
)
from .views_hc import (
    _SIN_CREAR,
    SOBRESCRIBIR,
    _Cruce,
    _error,
    cargar_ventas_por_dia,
    con_lo_creado,
)


class _PlantillaFalabella:
    """
    Las plantillas de Falabella hablan con encabezados `_falabella`; el
    serializer, no. Aquí se traduce de uno a otro al importar.
    """

    ENCABEZADOS = {
        'id_punto_venta_falabella': 'id_punto_venta',
        'id_producto_falabella': 'id_producto',
        'precio_venta_falabella': 'precio_venta_claro',
    }

    def fila_a_payload(self, fila: dict) -> dict:
        return {
            self.ENCABEZADOS.get(clave, clave): valor
            for clave, valor in fila.items()
            if clave != '_fila'
        }


def _dependencias_falabella() -> list[tuple[str, int]]:
    """Lo que impide vaciar los catálogos de Falabella: sus ventas, inventario y metas."""
    return [
        ('ventas', VentaFalabella.objects.count()),
        ('registros de inventario', InventarioFalabella.objects.count()),
        ('metas', MetaComercialFalabella.objects.count()),
    ]


_PRODUCTO_FALABELLA = Columna(
    'id_producto_falabella',
    ayuda='Código de un producto Falabella que ya exista.',
    ejemplo='FALP-001',
)
_PUNTO_FALABELLA = Columna(
    'id_punto_venta_falabella',
    ayuda='Código de una tienda Falabella que ya exista.',
    ejemplo='FAL-201',
)


# ── Los reportes .csv del portal de Falabella ──────────────────────────────

_SIN_CRUCE = (
    'Ninguna fila del archivo cruza con los productos y tiendas de Falabella, así que no se '
    'cambió nada. Revisa los SKU y los ID Local que faltan.'
)


class _CatalogoPorCrear:
    """
    Los productos y las tiendas del reporte que no existen en Falabella, listos
    para crear con los datos del mismo archivo (ver `reporte_falabella`).

    · Producto: nombre y marca del reporte; el precio —Falabella y Coltrade—
      es la venta neta de una unidad (en el inventario, el costo, que es lo
      que trae). La marca se busca en el catálogo sin importar mayúsculas ni
      tildes —«SONY» es «Sony»—; si no está, se crea en nombre propio. Un
      producto sin valor en el archivo queda en 0.
    · Tienda: `ID Local` y `Local` del reporte, regional Nacional y todos los
      materiales, como las que se crean en HC. Si el archivo no trae el nombre
      del local, no se crea: queda como faltante.

    Tres consultas, sin importar cuánto traiga el archivo.
    """

    def __init__(self, productos: dict[str, ProductoDelReporte], tiendas: dict[str, str]):
        hay_productos = set(
            ProductoFalabella.objects.filter(pk__in=list(productos)).values_list('pk', flat=True)
        )
        hay_tiendas = set(
            PuntoVentaFalabella.objects.filter(pk__in=list(tiendas)).values_list('pk', flat=True)
        )
        self.marcas = MarcasDelReporte()
        self.productos: list[ProductoFalabella] = []
        for sku, producto in sorted(productos.items()):
            precio = producto.precio or 0
            if sku in hay_productos or len(sku) > 60 or precio > PRECIO_MAXIMO:
                continue
            self.productos.append(
                ProductoFalabella(
                    id_producto=sku,
                    nombre_producto=producto.nombre or sku,
                    marca_id=self.marcas.resolver(producto.marca),
                    precio_venta_falabella=precio,
                    precio_venta_coltrade=precio,
                )
            )
        self.tiendas = [
            PuntoVentaFalabella(
                id_punto_venta=local,
                nombre_pdv=nombre,
                regional=RegionalFalabella.NACIONAL,
                materiales=Materiales.TODOS,
            )
            for local, nombre in sorted(tiendas.items(), key=lambda t: t[1])
            if local not in hay_tiendas and len(local) <= 60
        ]

    def __bool__(self) -> bool:
        return bool(self.productos or self.tiendas)

    @property
    def skus(self) -> set[str]:
        return {producto.id_producto for producto in self.productos}

    @property
    def locales(self) -> set[str]:
        return {tienda.id_punto_venta for tienda in self.tiendas}

    def pregunta(self, cruce: _Cruce, locales) -> Response:
        """
        409 `productos_por_crear`: la pregunta de si crearlos (`productos=crear`)
        o importar sin ellos (`productos=omitir`), con la vista previa. No es un
        error, y no se ha tocado nada. Las tiendas que no se pueden crear (sin
        nombre en el archivo) van como faltantes.
        """
        partes = []
        if self.productos:
            partes.append(f'{len(self.productos)} producto(s)')
        if self.tiendas:
            partes.append(f'{len(self.tiendas)} punto(s) de venta')
        return Response(
            {
                'code': 'productos_por_crear',
                'message': f'{" y ".join(partes)} del archivo no existen en Falabella. '
                '¿Deseas crearlos antes de importar?',
                'productos_por_crear': [
                    {
                        'id_producto': p.id_producto,
                        'nombre_producto': p.nombre_producto,
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
                        'categoria': None,
                    }
                    for t in self.tiendas
                ],
                'marcas_nuevas': sorted(self.marcas.nuevas.values()),
                'puntos_faltantes': sorted(set(locales) - cruce.puntos - self.locales),
            },
            status=status.HTTP_409_CONFLICT,
        )

    def crear(self) -> dict:
        self.marcas.crear()
        # Si otra carga creó lo mismo un instante antes, no es un error: ya existe.
        PuntoVentaFalabella.objects.bulk_create(self.tiendas, ignore_conflicts=True)
        ProductoFalabella.objects.bulk_create(self.productos, ignore_conflicts=True)
        return {
            'productos_creados': len(self.productos),
            'productos_sin_precio': sum(1 for p in self.productos if not p.precio_venta_coltrade),
            'puntos_creados': len(self.tiendas),
            'marcas_creadas': sorted(self.marcas.nuevas.values()),
        }


_SIN_META = (
    'Ninguna venta del archivo es de un producto con meta ese mes en su punto de venta, así '
    'que no se cambió nada. Sube primero las metas del mes.'
)

#: Número cualquiera, fijo, que identifica el bloqueo de las cargas de ventas
#: Falabella. Distinto del de HC: son tablas distintas.
_LLAVE_BLOQUEO_VENTAS = 710_002


def _bloquear_ventas_falabella() -> None:
    """Una sola carga de ventas Falabella a la vez: un doble clic no duplica."""
    if connection.vendor == 'postgresql':
        with connection.cursor() as cursor:
            cursor.execute('SELECT pg_advisory_xact_lock(%s)', [_LLAVE_BLOQUEO_VENTAS])


def _archivo_reporte(request):
    """El .csv subido, o la respuesta de error si no llegó o no es un .csv."""
    archivo = request.FILES.get('archivo')
    if archivo is None:
        return None, _error('No llegó ningún archivo.')
    if not archivo.name.lower().endswith('.csv'):
        return None, _error('El archivo debe ser el .csv tal como sale del portal de Falabella.')
    return archivo, None


def _cruce_falabella(pares) -> _Cruce:
    return _Cruce(pares, ProductoFalabella, PuntoVentaFalabella)


def _fuera(cruce: _Cruce) -> str:
    if not cruce.omitidas:
        return ''
    return (
        f' {cruce.omitidas} quedaron fuera porque su SKU o su ID Local no existe en Falabella.'
    )


class PuntoVentaFalabellaViewSet(_PlantillaFalabella, PuntoVentaViewSet):
    queryset = PuntoVentaFalabella.objects.annotate(conteo_ventas=Count('ventas')).order_by(
        'nombre_pdv'
    )
    serializer_class = PuntoVentaFalabellaSerializer
    nombre_plural = 'los puntos de venta Falabella'
    archivo_plantilla = 'plantilla-puntos-venta-falabella'
    columnas_excel = [
        Columna('id_punto_venta_falabella', ayuda='Código de la tienda. Máximo 60 caracteres.',
                ejemplo='FAL-201'),
        Columna('nombre_pdv', ayuda='Máximo 100 caracteres.', ejemplo='Falabella Andino'),
        Columna('regional', tipo='opcion', obligatoria=False,
                opciones=list(RegionalFalabella.values),
                ejemplo=RegionalFalabella.ZONA_NORTE.value),
        Columna('materiales', tipo='opcion', obligatoria=False, opciones=list(Materiales.values),
                ejemplo=Materiales.TODOS.value),
    ]

    def dependencias(self):
        return _dependencias_falabella()


class ProductoFalabellaViewSet(_PlantillaFalabella, ProductoViewSet):
    canal = FALABELLA
    queryset = ProductoFalabella.objects.annotate(conteo_ventas=Count('ventas')).order_by(
        'nombre_producto'
    )
    serializer_class = ProductoFalabellaSerializer
    nombre_plural = 'los productos Falabella'
    archivo_plantilla = 'plantilla-productos-falabella'
    columnas_excel = [
        Columna('id_producto_falabella', ayuda='Código del producto. Máximo 60 caracteres.',
                ejemplo='FALP-001'),
        Columna('nombre_producto', ayuda='Máximo 60 caracteres.', ejemplo='Audífonos JBL Tune'),
        Columna('marca', ayuda='Una marca de la lista de marcas. Da igual mayúsculas o tildes.',
                ejemplo='JBL'),
        Columna('precio_venta_falabella', tipo='entero',
                ayuda='Precio en Falabella. Hasta 100.000.000.', ejemplo='299900'),
        Columna('precio_venta_coltrade', tipo='entero',
                ayuda='Hasta 100.000.000. Con este precio se calculan los ingresos.',
                ejemplo='265000'),
    ]

    def dependencias(self):
        return _dependencias_falabella()


class VentaFalabellaViewSet(_PlantillaFalabella, VentaViewSet):
    canal = FALABELLA
    queryset = VentaFalabella.objects.select_related('id_producto', 'id_punto_venta').order_by(
        '-fecha_venta', '-id_venta'
    )
    serializer_class = VentaFalabellaSerializer
    filterset_class = VentaFalabellaFilter
    nombre_plural = 'las ventas Falabella'
    archivo_plantilla = 'plantilla-ventas-falabella'
    archivo_exportacion = 'ventas-falabella'
    con_puntos = False
    columnas_excel = [
        _PRODUCTO_FALABELLA,
        _PUNTO_FALABELLA,
        Columna('fecha_venta', tipo='fecha', ayuda='Formato AAAA-MM-DD.', ejemplo='2026-03-15'),
        Columna('cantidad_vendida', tipo='entero', ayuda='Unidades vendidas. Mínimo 1.',
                ejemplo='3'),
    ]

    @action(
        detail=False,
        methods=['post'],
        url_path='importar-reporte',
        permission_classes=[HasBiTradeApp, CanManageData],
    )
    def importar_reporte(self, request):
        """
        Carga las ventas del reporte «Ventas diarias» del portal de Falabella.

        Entran todas las fechas del archivo, solo las filas con 1 unidad o más,
        tengan meta o no, menos las de Falabella.com.

        Las preguntas, en orden, sin guardar nada hasta que estén resueltas:

        1. Si hay productos o tiendas que no existen, 409 `productos_por_crear`
           con la vista previa. `productos=crear` los crea antes de cargar las
           ventas; `productos=omitir` carga sin ellos.
        2. Igual que el querie de HC, el corte es por día: si alguno de los
           días ya tiene ventas, 409 `dias_con_ventas` con esos días; con
           `modo=sobrescribir` se borran las de esos días y quedan las del
           archivo.
        """
        archivo, error = _archivo_reporte(request)
        if error:
            return error
        try:
            lectura = leer_ventas(archivo)
        except ErrorDeReporte as exc:
            return _error(str(exc))

        pares = [(fila.sku, fila.local) for fila in lectura.ventas]
        cruce = _cruce_falabella(pares)
        por_crear = _CatalogoPorCrear(lectura.productos, lectura.tiendas)
        decision = decision_de(request)
        if por_crear and decision not in (CREAR, OMITIR):
            return por_crear.pregunta(cruce, (local for _, local in pares))
        if decision == CREAR:
            # Lo que se va a crear cuenta como existente al cruzar.
            cruce.productos |= por_crear.skus
            cruce.puntos |= por_crear.locales

        filtro = (
            VentasConMeta({(f.fecha.year, f.fecha.month) for f in lectura.ventas}, self.canal)
            if self.solo_con_meta
            else None
        )
        sin_meta = 0
        nuevas = []
        for fila in lectura.ventas:
            if not cruce.entra(fila.sku, fila.local):
                continue
            if filtro is not None and not filtro.admite(fila.sku, fila.local, fila.fecha):
                sin_meta += 1
                continue
            nuevas.append(
                VentaFalabella(
                    id_producto_id=fila.sku,
                    id_punto_venta_id=fila.local,
                    fecha_venta=fila.fecha,
                    cantidad_vendida=fila.unidades,
                )
            )
        dias = sorted({venta.fecha_venta for venta in nuevas})
        resumen = {
            'dias': [dia.isoformat() for dia in dias],
            'filas_leidas': lectura.filas_leidas,
            'sin_unidades': lectura.sin_unidades,
            # Lo que no entró por ser de Falabella.com.
            'de_falabella_com': lectura.de_falabella_com,
            # Lo que no entró porque el producto no tiene meta ese mes en ese punto.
            'sin_meta': sin_meta,
            **cruce.resumen(),
        }
        if not nuevas:
            return _error(_SIN_META if sin_meta and not cruce.omitidas else _SIN_CRUCE, **resumen)

        # Hasta guardar no se escribe nada: el catálogo se crea ya sin preguntas
        # pendientes, en la misma transacción que las ventas.
        respuesta, eliminadas, creado = cargar_ventas_por_dia(
            VentaFalabella,
            nuevas,
            sobrescribir=(request.data.get('modo') or '').strip() == SOBRESCRIBIR,
            bloquear=_bloquear_ventas_falabella,
            resumen=resumen,
            antes=por_crear.crear if decision == CREAR else None,
        )
        if respuesta:
            return respuesta
        creado = creado or _SIN_CREAR

        mensaje = f'Ventas cargadas: {len(nuevas)} registro(s) de {len(dias)} día(s)' + (
            f', reemplazando {eliminadas} que ya estaban.' if eliminadas else '.'
        )
        if lectura.de_falabella_com:
            mensaje += f' {lectura.de_falabella_com} fila(s) de Falabella.com no entran.'
        if sin_meta:
            mensaje += ' ' + aviso_sin_meta(sin_meta)
        return Response(
            {
                **resumen,
                **creado,
                'creadas': len(nuevas),
                'unidades': sum(venta.cantidad_vendida for venta in nuevas),
                'eliminadas': eliminadas,
                'message': con_lo_creado(mensaje + _fuera(cruce), creado),
            }
        )


class InventarioFalabellaViewSet(_PlantillaFalabella, InventarioViewSet):
    canal = FALABELLA
    queryset = InventarioFalabella.objects.select_related(
        'id_producto', 'id_punto_venta'
    ).order_by('id_punto_venta__nombre_pdv', 'id_producto__nombre_producto')
    serializer_class = InventarioFalabellaSerializer
    filterset_class = InventarioFalabellaFilter
    nombre_plural = 'los registros de inventario Falabella'
    archivo_plantilla = 'plantilla-inventario-falabella'
    archivo_exportacion = 'inventario-falabella'
    columnas_excel = [
        _PRODUCTO_FALABELLA,
        _PUNTO_FALABELLA,
        Columna('cantidad_inventario', tipo='entero', ayuda='Existencias actuales. Cero = agotado.',
                ejemplo='24'),
    ]

    @action(
        detail=False,
        methods=['post'],
        url_path='importar-reporte',
        permission_classes=[HasBiTradeApp, CanManageData],
    )
    def importar_reporte(self, request):
        """
        Reemplaza el inventario Falabella con el reporte «Análisis semanal».

        Es la foto del stock disponible: se borra lo que había y queda lo del
        archivo, solo con 1 unidad o más y sin Falabella.com. Si ninguna fila
        cruza no se borra nada: vaciar el inventario sin con qué reemplazarlo
        sería perder el dato.

        Si hay productos o tiendas que no existen se pregunta primero, igual que
        en las ventas: 409 `productos_por_crear`, y luego `productos=crear` u
        `omitir`.
        """
        archivo, error = _archivo_reporte(request)
        if error:
            return error
        try:
            lectura = leer_inventario(archivo)
        except ErrorDeReporte as exc:
            return _error(str(exc))

        cruce = _cruce_falabella(lectura.inventario)
        por_crear = _CatalogoPorCrear(lectura.productos, lectura.tiendas)
        decision = decision_de(request)
        if por_crear and decision not in (CREAR, OMITIR):
            return por_crear.pregunta(cruce, (local for _, local in lectura.inventario))
        if decision == CREAR:
            cruce.productos |= por_crear.skus
            cruce.puntos |= por_crear.locales

        nuevos = [
            InventarioFalabella(
                id_producto_id=sku, id_punto_venta_id=local, cantidad_inventario=unidades
            )
            for (sku, local), unidades in sorted(lectura.inventario.items())
            if cruce.entra(sku, local)
        ]
        resumen = {
            'filas_leidas': lectura.filas_leidas,
            'sin_unidades': lectura.sin_unidades,
            'de_falabella_com': lectura.de_falabella_com,
            **cruce.resumen(),
        }
        if not nuevos:
            return _error(_SIN_CRUCE, **resumen)

        with transaction.atomic():
            creado = por_crear.crear() if decision == CREAR else _SIN_CREAR
            eliminados, _ = InventarioFalabella.objects.all().delete()
            InventarioFalabella.objects.bulk_create(nuevos, batch_size=500)

        mensaje = f'Inventario cargado: {len(nuevos)} registro(s).' + _fuera(cruce)
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


class MetaFalabellaViewSet(_PlantillaFalabella, MetaViewSet):
    canal = FALABELLA
    queryset = MetaComercialFalabella.objects.select_related(
        'id_producto', 'id_punto_venta'
    ).order_by('id_punto_venta__nombre_pdv', 'id_producto__nombre_producto')
    serializer_class = MetaFalabellaSerializer
    filterset_class = MetaFalabellaFilter
    nombre_plural = 'las metas Falabella'
    archivo_plantilla = 'plantilla-metas-falabella'
    archivo_exportacion = 'metas-falabella'
    # Este canal no mide en puntos: ni los suma, ni los ordena, ni los exporta.
    con_puntos = False
    ordering_fields = ('fecha_meta', 'meta_cantidad', 'dinero_meta')
    columnas_exportacion = [
        c for c in MetaViewSet.columnas_exportacion if c.campo != 'puntos_meta'
    ]
    nota_plantilla = MetaViewSet.nota_plantilla.replace(
        'el dinero y los puntos se calculan con el precio y el puntaje del producto.',
        'el dinero se calcula con el precio Coltrade del producto.',
    )
    columnas_excel = [
        _PRODUCTO_FALABELLA,
        _PUNTO_FALABELLA,
        Columna('fecha_meta', tipo='fecha',
                ayuda='Periodo de la meta, formato AAAA-MM-DD.', ejemplo='2026-03-01'),
        Columna('meta_cantidad', tipo='entero', ayuda='Unidades objetivo.', ejemplo='25'),
    ]


# ── El tablero de Falabella: el mismo cálculo, con el canal FALABELLA ──────

@api_view(['GET'])
@permission_classes([HasBiTradeApp])
def opciones_falabella(request):
    return Response(opciones_de(FALABELLA))


@api_view(['GET'])
@permission_classes([HasBiTradeApp])
def avance_mensual_falabella(request):
    return Response(_calcular_avance(request, FALABELLA))


@api_view(['GET'])
@permission_classes([HasBiTradeApp])
def avance_mensual_falabella_exportar(request):
    return exportar_avance(request, FALABELLA)


@api_view(['GET'])
@permission_classes([HasBiTradeApp])
def cumplimiento_diario_falabella(request):
    return Response(_calcular_dia(request, FALABELLA))


@api_view(['GET'])
@permission_classes([HasBiTradeApp])
def cumplimiento_diario_falabella_exportar(request):
    return exportar_dia(request, FALABELLA)
