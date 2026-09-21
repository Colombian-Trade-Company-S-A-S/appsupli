"""
Homecenter: el mismo BI de Claro sobre sus propias tablas.

Aquí no hay cálculo propio. Los CRUD heredan los de Claro y cambian solo lo que
es de Homecenter —las tablas, los serializers y los encabezados `_hc` de las
plantillas—; el tablero llama al mismo cálculo con el canal HC. Lo que se
arregle en Claro queda arreglado aquí.

No existe el «Importar» general del informe del ERP: ese informe es de Claro.
Cada módulo sí tiene su plantilla y su importación.
"""
from django.db import connection, transaction
from django.db.models import Count
from rest_framework import status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response

from .api_permissions import CanManageData, HasBiTradeApp
from .canales import HC
from .excel import Columna, ColumnaExport
from .filters import InventarioHcFilter, MetaHcFilter, VentaHcFilter
from .models import (
    CategoriaHc,
    InventarioHc,
    Materiales,
    MetaComercialHc,
    ProductoHc,
    PuntoVentaHc,
    RegionalHc,
    VentaHc,
    anotaciones_meta,
)
from .query_hc import ErrorDeQuery, leer_query, leer_query_ventas
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
_EXPORT_PRECIO = ColumnaExport(
    'Precio Coltrade', 'id_producto__precio_venta_coltrade', 'dinero'
)


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
    Qué SKU y tiendas del archivo existen en HC, en dos consultas.

    Lo que no existe no entra: se cuenta por fila y se guarda el código, para
    decir cuáles hay que crear antes de volver a subir el archivo.
    """

    def __init__(self, pares):
        pares = list(pares)
        self.productos = set(
            ProductoHc.objects.filter(pk__in={sku for sku, _ in pares}).values_list(
                'id_producto', flat=True
            )
        )
        self.puntos = set(
            PuntoVentaHc.objects.filter(pk__in={tienda for _, tienda in pares}).values_list(
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
            # Los códigos, no solo cuántos: son los que hay que crear en HC.
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
        ColumnaExport('Precio Coltrade', 'precio_venta_coltrade', 'dinero'),
        ColumnaExport('Precio Homecenter', 'precio_venta_hc', 'dinero'),
        ColumnaExport('Ventas registradas', 'conteo_ventas', 'entero'),
    ]
    search_fields = ('id_producto', 'ean', 'sku_coltrade', 'nombre_producto', 'marca')
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
        Columna('marca', obligatoria=False, ayuda='Opcional. Máximo 60 caracteres.',
                ejemplo='Aiwa'),
        Columna('precio_venta_coltrade', tipo='entero', obligatoria=False,
                ayuda='Opcional. Hasta 100.000.000. Con este precio se calculan los ingresos.',
                ejemplo='1094413'),
        Columna('precio_venta_hc', tipo='entero', obligatoria=False,
                ayuda='Opcional. Precio en Homecenter. Hasta 100.000.000.', ejemplo='1199900'),
    ]

    def dependencias(self):
        return _dependencias_hc()


class VentaHcViewSet(_PlantillaHc, VentaViewSet):
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
        _EXPORT_PRECIO,
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

        sobrescribir = (request.data.get('modo') or '').strip() == SOBRESCRIBIR
        with transaction.atomic():
            _bloquear_ventas_hc()
            # Se mira dentro de la transacción, ya con el bloqueo: lo que se
            # ve aquí es lo que hay al guardar.
            ocupados = list(
                VentaHc.objects.filter(fecha_venta__in=dias)
                .values('fecha_venta')
                .annotate(registros=Count('id_venta'))
                .order_by('fecha_venta')
            )
            if ocupados and not sobrescribir:
                return Response(
                    {
                        'code': 'dias_con_ventas',
                        'message': (
                            f'{len(ocupados)} día(s) del archivo ya tienen ventas cargadas. '
                            'Sobrescribe para reemplazarlas, o cancela.'
                        ),
                        'dias_con_ventas': [
                            {
                                'fecha': fila['fecha_venta'].isoformat(),
                                'registros': fila['registros'],
                            }
                            for fila in ocupados
                        ],
                        **resumen,
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            eliminadas, _ = VentaHc.objects.filter(fecha_venta__in=dias).delete()
            VentaHc.objects.bulk_create(nuevas, batch_size=500)

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


class InventarioHcViewSet(_PlantillaHc, InventarioViewSet):
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
        _EXPORT_PRECIO,
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


class MetaHcViewSet(_PlantillaHc, MetaViewSet):
    queryset = (
        MetaComercialHc.objects.select_related('id_producto', 'id_punto_venta')
        .annotate(**anotaciones_meta(con_puntos=False))
        .order_by('id_punto_venta__nombre_pdv', 'id_producto__nombre_producto')
    )
    serializer_class = MetaHcSerializer
    filterset_class = MetaHcFilter
    nombre_plural = 'las metas Homecenter'
    archivo_plantilla = 'plantilla-metas-hc'
    archivo_exportacion = 'metas-hc'
    # Este canal no mide en puntos: ni los suma, ni los ordena, ni los exporta.
    con_puntos = False
    ordering_fields = ('fecha_meta', 'meta_cantidad', 'dinero_meta')
    columnas_exportacion = [
        ColumnaExport('ID meta', 'id_meta', 'entero'),
        ColumnaExport('Periodo', 'fecha_meta', 'fecha'),
        *_EXPORT_PRODUCTO,
        *_EXPORT_PUNTO,
        ColumnaExport('Meta unidades', 'meta_cantidad', 'entero'),
        _EXPORT_PRECIO,
        ColumnaExport('Meta dinero', 'dinero_meta', 'dinero'),
    ]
    nota_plantilla = MetaViewSet.nota_plantilla.replace(
        'el dinero y los puntos se calculan con el precio y el puntaje del producto.',
        'el dinero se calcula con el precio Coltrade del producto.',
    )
    columnas_excel = [
        _PRODUCTO_HC,
        _PUNTO_HC,
        Columna('fecha_meta', tipo='fecha',
                ayuda='Periodo de la meta, formato AAAA-MM-DD.', ejemplo='2026-03-01'),
        Columna('meta_cantidad', tipo='entero', ayuda='Unidades objetivo.', ejemplo='25'),
    ]


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
