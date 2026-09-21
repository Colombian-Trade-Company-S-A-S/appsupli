"""
Tmk Ecommerce Claro: el mismo BI de Claro sobre sus propias tablas, igual que Homecenter.

Aquí no hay cálculo propio. Los CRUD heredan los de Claro y cambian solo lo que
es de Tmk Ecommerce Claro —las tablas, los serializers y los encabezados `_tmk` de
las plantillas—; el tablero llama al mismo cálculo con el canal TMK.

A diferencia de Homecenter y Falabella, aquí sí está el «Importar» general
del informe del ERP: el mismo de Claro, sobre las tablas `_tmk`. Cada módulo
tiene además su plantilla y su importación.
"""
from django.db.models import Count
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from .api_permissions import CanManageData, HasBiTradeApp
from .canales import TMK
from .excel import Columna
from .filters import InventarioTmkFilter, MetaTmkFilter, VentaTmkFilter
from .models import (
    InventarioTmk,
    Materiales,
    MetaComercialTmk,
    ProductoTmk,
    PuntoVentaTmk,
    RegionalTmk,
    VentaTmk,
    anotaciones_meta,
)
from .serializers import (
    InventarioTmkSerializer,
    MetaTmkSerializer,
    ProductoTmkSerializer,
    PuntoVentaTmkSerializer,
    VentaTmkSerializer,
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
    importar_informe_de,
    opciones_de,
)


class _PlantillaTmk:
    """
    Las plantillas de Tmk Ecommerce Claro hablan con encabezados `_tmk`; el
    serializer, no. Aquí se traduce de uno a otro al importar.
    """

    ENCABEZADOS = {
        'id_punto_venta_tmk': 'id_punto_venta',
        'id_producto_tmk': 'id_producto',
        'precio_venta_tmk': 'precio_venta_claro',
    }

    def fila_a_payload(self, fila: dict) -> dict:
        return {
            self.ENCABEZADOS.get(clave, clave): valor
            for clave, valor in fila.items()
            if clave != '_fila'
        }


def _dependencias_tmk() -> list[tuple[str, int]]:
    """Lo que impide vaciar los catálogos de Tmk Ecommerce Claro: sus ventas, inventario y metas."""
    return [
        ('ventas', VentaTmk.objects.count()),
        ('registros de inventario', InventarioTmk.objects.count()),
        ('metas', MetaComercialTmk.objects.count()),
    ]


_PRODUCTO_TMK = Columna(
    'id_producto_tmk',
    ayuda='Código de un producto Tmk Ecommerce Claro que ya exista.',
    ejemplo='TMKP-001',
)
_PUNTO_TMK = Columna(
    'id_punto_venta_tmk',
    ayuda='Código de una tienda Tmk Ecommerce Claro que ya exista.',
    ejemplo='TMK-301',
)


class PuntoVentaTmkViewSet(_PlantillaTmk, PuntoVentaViewSet):
    queryset = PuntoVentaTmk.objects.annotate(conteo_ventas=Count('ventas')).order_by('nombre_pdv')
    serializer_class = PuntoVentaTmkSerializer
    nombre_plural = 'los puntos de venta Tmk Ecommerce Claro'
    archivo_plantilla = 'plantilla-puntos-venta-tmk'
    columnas_excel = [
        Columna('id_punto_venta_tmk', ayuda='Código de la tienda. Máximo 60 caracteres.',
                ejemplo='TMK-301'),
        Columna('nombre_pdv', ayuda='Máximo 100 caracteres.', ejemplo='Tmk Call Center Bogotá'),
        Columna('regional', tipo='opcion', obligatoria=False,
                opciones=list(RegionalTmk.values),
                ejemplo=RegionalTmk.ZONA_NORTE.value),
        Columna('materiales', tipo='opcion', obligatoria=False, opciones=list(Materiales.values),
                ejemplo=Materiales.TODOS.value),
    ]

    def dependencias(self):
        return _dependencias_tmk()


class ProductoTmkViewSet(_PlantillaTmk, ProductoViewSet):
    queryset = ProductoTmk.objects.annotate(conteo_ventas=Count('ventas')).order_by(
        'nombre_producto'
    )
    serializer_class = ProductoTmkSerializer
    nombre_plural = 'los productos Tmk Ecommerce Claro'
    archivo_plantilla = 'plantilla-productos-tmk'
    columnas_excel = [
        Columna('id_producto_tmk', ayuda='Código del producto. Máximo 60 caracteres.',
                ejemplo='TMKP-001'),
        Columna('nombre_producto', ayuda='Máximo 60 caracteres.', ejemplo='Audífonos JBL Tune'),
        Columna('marca', ayuda='Máximo 60 caracteres.', ejemplo='JBL'),
        Columna('precio_venta_tmk', tipo='entero',
                ayuda='Precio en Tmk Ecommerce Claro. Hasta 100.000.000.', ejemplo='299900'),
        Columna('precio_venta_coltrade', tipo='entero',
                ayuda='Hasta 100.000.000. Con este precio se calculan los ingresos.',
                ejemplo='265000'),
    ]

    def dependencias(self):
        return _dependencias_tmk()


class VentaTmkViewSet(_PlantillaTmk, VentaViewSet):
    queryset = VentaTmk.objects.select_related('id_producto', 'id_punto_venta').order_by(
        '-fecha_venta', '-id_venta'
    )
    serializer_class = VentaTmkSerializer
    filterset_class = VentaTmkFilter
    nombre_plural = 'las ventas Tmk Ecommerce Claro'
    archivo_plantilla = 'plantilla-ventas-tmk'
    archivo_exportacion = 'ventas-tmk'
    con_puntos = False
    columnas_excel = [
        _PRODUCTO_TMK,
        _PUNTO_TMK,
        Columna('fecha_venta', tipo='fecha', ayuda='Formato AAAA-MM-DD.', ejemplo='2026-03-15'),
        Columna('cantidad_vendida', tipo='entero', ayuda='Unidades vendidas. Mínimo 1.',
                ejemplo='3'),
    ]


class InventarioTmkViewSet(_PlantillaTmk, InventarioViewSet):
    queryset = InventarioTmk.objects.select_related(
        'id_producto', 'id_punto_venta'
    ).order_by('id_punto_venta__nombre_pdv', 'id_producto__nombre_producto')
    serializer_class = InventarioTmkSerializer
    filterset_class = InventarioTmkFilter
    nombre_plural = 'los registros de inventario Tmk Ecommerce Claro'
    archivo_plantilla = 'plantilla-inventario-tmk'
    archivo_exportacion = 'inventario-tmk'
    columnas_excel = [
        _PRODUCTO_TMK,
        _PUNTO_TMK,
        Columna('cantidad_inventario', tipo='entero', ayuda='Existencias actuales. Cero = agotado.',
                ejemplo='24'),
    ]


class MetaTmkViewSet(_PlantillaTmk, MetaViewSet):
    queryset = (
        MetaComercialTmk.objects.select_related('id_producto', 'id_punto_venta')
        .annotate(**anotaciones_meta(con_puntos=False))
        .order_by('id_punto_venta__nombre_pdv', 'id_producto__nombre_producto')
    )
    serializer_class = MetaTmkSerializer
    filterset_class = MetaTmkFilter
    nombre_plural = 'las metas Tmk Ecommerce Claro'
    archivo_plantilla = 'plantilla-metas-tmk'
    archivo_exportacion = 'metas-tmk'
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
        _PRODUCTO_TMK,
        _PUNTO_TMK,
        Columna('fecha_meta', tipo='fecha',
                ayuda='Periodo de la meta, formato AAAA-MM-DD.', ejemplo='2026-03-01'),
        Columna('meta_cantidad', tipo='entero', ayuda='Unidades objetivo.', ejemplo='25'),
    ]


# ── El tablero de Tmk Ecommerce Claro: el mismo cálculo, con el canal TMK ──────

@api_view(['GET'])
@permission_classes([HasBiTradeApp])
def opciones_tmk(request):
    return Response(opciones_de(TMK))


@api_view(['GET'])
@permission_classes([HasBiTradeApp])
def avance_mensual_tmk(request):
    return Response(_calcular_avance(request, TMK))


@api_view(['GET'])
@permission_classes([HasBiTradeApp])
def avance_mensual_tmk_exportar(request):
    return exportar_avance(request, TMK)


@api_view(['GET'])
@permission_classes([HasBiTradeApp])
def cumplimiento_diario_tmk(request):
    return Response(_calcular_dia(request, TMK))


@api_view(['GET'])
@permission_classes([HasBiTradeApp])
def cumplimiento_diario_tmk_exportar(request):
    return exportar_dia(request, TMK)


@api_view(['POST'])
@permission_classes([HasBiTradeApp, CanManageData])
@parser_classes([MultiPartParser])
def importar_informe_tmk(request):
    """El informe del ERP, igual que en Claro, pero sobre las tablas `_tmk`."""
    return importar_informe_de(request, TMK)
