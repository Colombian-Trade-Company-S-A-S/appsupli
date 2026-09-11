"""
Homecenter: el mismo BI de Claro sobre sus propias tablas.

Aquí no hay cálculo propio. Los CRUD heredan los de Claro y cambian solo lo que
es de Homecenter —las tablas, los serializers y los encabezados `_hc` de las
plantillas—; el tablero llama al mismo cálculo con el canal HC. Lo que se
arregle en Claro queda arreglado aquí.

No existe el «Importar» general del informe del ERP: ese informe es de Claro.
Cada módulo sí tiene su plantilla y su importación.
"""
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .api_permissions import HasBiTradeApp
from .canales import HC
from .excel import Columna
from .filters import InventarioHcFilter, MetaHcFilter, VentaHcFilter
from .models import (
    InventarioHc,
    Materiales,
    MetaComercialHc,
    ProductoHc,
    PuntoVentaHc,
    RegionalHc,
    VentaHc,
    anotaciones_meta,
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


class PuntoVentaHcViewSet(_PlantillaHc, PuntoVentaViewSet):
    queryset = PuntoVentaHc.objects.prefetch_related('ventas').order_by('nombre_pdv')
    serializer_class = PuntoVentaHcSerializer
    nombre_plural = 'los puntos de venta Homecenter'
    archivo_plantilla = 'plantilla-puntos-venta-hc'
    columnas_excel = [
        Columna('id_punto_venta_hc', ayuda='Código de la tienda. Máximo 60 caracteres.',
                ejemplo='HC-101'),
        Columna('nombre_pdv', ayuda='Máximo 100 caracteres.', ejemplo='Homecenter Calle 80'),
        Columna('regional', tipo='opcion', obligatoria=False, opciones=list(RegionalHc.values),
                ejemplo=RegionalHc.ZONA_CENTRO.value),
        Columna('materiales', tipo='opcion', obligatoria=False, opciones=list(Materiales.values),
                ejemplo=Materiales.TODOS.value),
    ]

    def buscar_existente(self, fila):
        return PuntoVentaHc.objects.filter(pk=fila.get('id_punto_venta_hc')).first()

    def dependencias(self):
        return _dependencias_hc()


class ProductoHcViewSet(_PlantillaHc, ProductoViewSet):
    queryset = ProductoHc.objects.prefetch_related('ventas').order_by('nombre_producto')
    serializer_class = ProductoHcSerializer
    nombre_plural = 'los productos Homecenter'
    archivo_plantilla = 'plantilla-productos-hc'
    columnas_excel = [
        Columna('id_producto_hc', ayuda='Código del producto. Máximo 60 caracteres.',
                ejemplo='HCP-001'),
        Columna('nombre_producto', ayuda='Máximo 60 caracteres.', ejemplo='Torre de sonido Aiwa'),
        Columna('marca', ayuda='Máximo 60 caracteres.', ejemplo='Aiwa'),
        Columna('precio_venta_hc', tipo='entero',
                ayuda='Precio en Homecenter. Hasta 100.000.000.', ejemplo='1199900'),
        Columna('precio_venta_coltrade', tipo='entero',
                ayuda='Hasta 100.000.000. Con este precio se calculan los ingresos.',
                ejemplo='1094413'),
    ]

    def buscar_existente(self, fila):
        return ProductoHc.objects.filter(pk=fila.get('id_producto_hc')).first()

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
    con_puntos = False
    columnas_excel = [
        _PRODUCTO_HC,
        _PUNTO_HC,
        Columna('fecha_venta', tipo='fecha', ayuda='Formato AAAA-MM-DD.', ejemplo='2026-03-15'),
        Columna('cantidad_vendida', tipo='entero', ayuda='Unidades vendidas. Mínimo 1.',
                ejemplo='3'),
    ]


class InventarioHcViewSet(_PlantillaHc, InventarioViewSet):
    queryset = InventarioHc.objects.select_related('id_producto', 'id_punto_venta').order_by(
        'id_punto_venta__nombre_pdv', 'id_producto__nombre_producto'
    )
    serializer_class = InventarioHcSerializer
    filterset_class = InventarioHcFilter
    nombre_plural = 'los registros de inventario Homecenter'
    archivo_plantilla = 'plantilla-inventario-hc'
    archivo_exportacion = 'inventario-hc'
    columnas_excel = [
        _PRODUCTO_HC,
        _PUNTO_HC,
        Columna('cantidad_inventario', tipo='entero', ayuda='Existencias actuales. Cero = agotado.',
                ejemplo='24'),
    ]

    def buscar_existente(self, fila):
        return InventarioHc.objects.filter(
            id_producto=fila.get('id_producto_hc'),
            id_punto_venta=fila.get('id_punto_venta_hc'),
        ).first()


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
        c for c in MetaViewSet.columnas_exportacion if c.campo != 'puntos_meta'
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

    def buscar_existente(self, fila):
        return MetaComercialHc.objects.filter(
            id_producto=fila.get('id_producto_hc'),
            id_punto_venta=fila.get('id_punto_venta_hc'),
            fecha_meta=fila.get('fecha_meta'),
        ).first()


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
