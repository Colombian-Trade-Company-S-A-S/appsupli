"""
Falabella: el mismo BI de Claro sobre sus propias tablas, igual que Homecenter.

Aquí no hay cálculo propio. Los CRUD heredan los de Claro y cambian solo lo que
es de Falabella —las tablas, los serializers y los encabezados `_falabella` de
las plantillas—; el tablero llama al mismo cálculo con el canal FALABELLA.

No existe el «Importar» general del informe del ERP: ese informe es de Claro.
Cada módulo sí tiene su plantilla y su importación.
"""
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .api_permissions import HasBiTradeApp
from .canales import FALABELLA
from .excel import Columna
from .filters import InventarioFalabellaFilter, MetaFalabellaFilter, VentaFalabellaFilter
from .models import (
    InventarioFalabella,
    Materiales,
    MetaComercialFalabella,
    ProductoFalabella,
    PuntoVentaFalabella,
    RegionalFalabella,
    VentaFalabella,
    anotaciones_meta,
)
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
    VentaViewSet,
    _calcular_avance,
    _calcular_dia,
    exportar_avance,
    exportar_dia,
    opciones_de,
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


class PuntoVentaFalabellaViewSet(_PlantillaFalabella, PuntoVentaViewSet):
    queryset = PuntoVentaFalabella.objects.prefetch_related('ventas').order_by('nombre_pdv')
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

    def buscar_existente(self, fila):
        return PuntoVentaFalabella.objects.filter(pk=fila.get('id_punto_venta_falabella')).first()

    def dependencias(self):
        return _dependencias_falabella()


class ProductoFalabellaViewSet(_PlantillaFalabella, ProductoViewSet):
    queryset = ProductoFalabella.objects.prefetch_related('ventas').order_by('nombre_producto')
    serializer_class = ProductoFalabellaSerializer
    nombre_plural = 'los productos Falabella'
    archivo_plantilla = 'plantilla-productos-falabella'
    columnas_excel = [
        Columna('id_producto_falabella', ayuda='Código del producto. Máximo 60 caracteres.',
                ejemplo='FALP-001'),
        Columna('nombre_producto', ayuda='Máximo 60 caracteres.', ejemplo='Audífonos JBL Tune'),
        Columna('marca', ayuda='Máximo 60 caracteres.', ejemplo='JBL'),
        Columna('precio_venta_falabella', tipo='entero',
                ayuda='Precio en Falabella. Hasta 100.000.000.', ejemplo='299900'),
        Columna('precio_venta_coltrade', tipo='entero',
                ayuda='Hasta 100.000.000. Con este precio se calculan los ingresos.',
                ejemplo='265000'),
    ]

    def buscar_existente(self, fila):
        return ProductoFalabella.objects.filter(pk=fila.get('id_producto_falabella')).first()

    def dependencias(self):
        return _dependencias_falabella()


class VentaFalabellaViewSet(_PlantillaFalabella, VentaViewSet):
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


class InventarioFalabellaViewSet(_PlantillaFalabella, InventarioViewSet):
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

    def buscar_existente(self, fila):
        return InventarioFalabella.objects.filter(
            id_producto=fila.get('id_producto_falabella'),
            id_punto_venta=fila.get('id_punto_venta_falabella'),
        ).first()


class MetaFalabellaViewSet(_PlantillaFalabella, MetaViewSet):
    queryset = (
        MetaComercialFalabella.objects.select_related('id_producto', 'id_punto_venta')
        .annotate(**anotaciones_meta(con_puntos=False))
        .order_by('id_punto_venta__nombre_pdv', 'id_producto__nombre_producto')
    )
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

    def buscar_existente(self, fila):
        return MetaComercialFalabella.objects.filter(
            id_producto=fila.get('id_producto_falabella'),
            id_punto_venta=fila.get('id_punto_venta_falabella'),
            fecha_meta=fila.get('fecha_meta'),
        ).first()


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
