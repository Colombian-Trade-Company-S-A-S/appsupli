"""
Plan Recomiéndame Belkin: el formulario de recomendaciones y sus catálogos.

Registrar una recomendación solo pide tener la aplicación. Mantener los
catálogos —regionales, puntos de venta, asesores Apple, categorías y
productos— y corregir o borrar un registro pide `bi-trade:data:manage`.

Lo que se cambia en un catálogo cambia el formulario y también lo ya cargado:
el registro no copia la regional ni la categoría, las lee del punto y del
producto cada vez.
"""
from django.db.models import Count
from rest_framework import viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .api_permissions import HasBiTradeApp, ReadOnlyOrCanManage
from .models import (
    AsesorApple,
    CategoriaBelkin,
    ProductoBelkin,
    PuntoVentaBelkin,
    RegionalBelkin,
    RegistroBelkin,
)
from .serializers import (
    AsesorAppleSerializer,
    CategoriaBelkinSerializer,
    ProductoBelkinSerializer,
    PuntoVentaBelkinSerializer,
    RegionalBelkinSerializer,
    RegistroBelkinSerializer,
)
from .views import PaginacionListado
from .views_partners import PuedeRegistrar, _en_uso


class RegionalBelkinViewSet(viewsets.ModelViewSet):
    queryset = RegionalBelkin.objects.annotate(
        conteo_puntos_venta=Count('puntos_venta')
    ).order_by('nombre')
    serializer_class = RegionalBelkinSerializer
    permission_classes = [HasBiTradeApp, ReadOnlyOrCanManage]
    search_fields = ('nombre',)
    filterset_fields = ('activa',)
    pagination_class = None

    def destroy(self, request, *args, **kwargs):
        regional = self.get_object()
        bloqueo = _en_uso(
            regional.nombre, [('punto(s) de venta', regional.puntos_venta.count())]
        )
        return bloqueo or super().destroy(request, *args, **kwargs)


class PuntoVentaBelkinViewSet(viewsets.ModelViewSet):
    queryset = (
        PuntoVentaBelkin.objects.select_related('id_regional')
        .annotate(
            conteo_asesores=Count('asesores', distinct=True),
            conteo_registros=Count('registros', distinct=True),
        )
        .order_by('nombre_pdv')
    )
    serializer_class = PuntoVentaBelkinSerializer
    permission_classes = [HasBiTradeApp, ReadOnlyOrCanManage]
    search_fields = ('id_punto_venta', 'nombre_pdv')
    filterset_fields = ('id_regional', 'activo')
    pagination_class = None

    def destroy(self, request, *args, **kwargs):
        punto = self.get_object()
        bloqueo = _en_uso(
            punto.nombre_pdv,
            [
                ('asesor(es)', punto.asesores.count()),
                ('registro(s)', punto.registros.count()),
            ],
        )
        return bloqueo or super().destroy(request, *args, **kwargs)


class AsesorAppleViewSet(viewsets.ModelViewSet):
    queryset = (
        AsesorApple.objects.select_related('id_punto_venta', 'id_punto_venta__id_regional')
        .annotate(conteo_registros=Count('registros'))
        .order_by('nombre')
    )
    serializer_class = AsesorAppleSerializer
    permission_classes = [HasBiTradeApp, ReadOnlyOrCanManage]
    search_fields = ('nombre', 'id_punto_venta__id_punto_venta', 'id_punto_venta__nombre_pdv')
    filterset_fields = ('id_punto_venta', 'activo')
    pagination_class = None

    def destroy(self, request, *args, **kwargs):
        asesor = self.get_object()
        bloqueo = _en_uso(asesor.nombre, [('registro(s)', asesor.registros.count())])
        return bloqueo or super().destroy(request, *args, **kwargs)


class CategoriaBelkinViewSet(viewsets.ModelViewSet):
    queryset = CategoriaBelkin.objects.annotate(conteo_productos=Count('productos')).order_by(
        'nombre'
    )
    serializer_class = CategoriaBelkinSerializer
    permission_classes = [HasBiTradeApp, ReadOnlyOrCanManage]
    search_fields = ('nombre',)
    filterset_fields = ('activa',)
    pagination_class = None

    def destroy(self, request, *args, **kwargs):
        categoria = self.get_object()
        bloqueo = _en_uso(categoria.nombre, [('producto(s)', categoria.productos.count())])
        return bloqueo or super().destroy(request, *args, **kwargs)


class ProductoBelkinViewSet(viewsets.ModelViewSet):
    queryset = (
        ProductoBelkin.objects.select_related('id_categoria')
        .annotate(conteo_registros=Count('registros'))
        .order_by('nombre_producto')
    )
    serializer_class = ProductoBelkinSerializer
    permission_classes = [HasBiTradeApp, ReadOnlyOrCanManage]
    search_fields = ('id_producto', 'nombre_producto')
    filterset_fields = ('id_categoria', 'activo')
    pagination_class = None

    def destroy(self, request, *args, **kwargs):
        producto = self.get_object()
        bloqueo = _en_uso(producto.nombre_producto, [('registro(s)', producto.registros.count())])
        return bloqueo or super().destroy(request, *args, **kwargs)


class RegistroBelkinViewSet(viewsets.ModelViewSet):
    queryset = RegistroBelkin.objects.select_related(
        'id_punto_venta',
        'id_punto_venta__id_regional',
        'id_asesor',
        'id_producto',
        'id_producto__id_categoria',
        'registrado_por',
        'enlace',
    ).order_by('-fecha_recomendacion', '-id_registro')
    serializer_class = RegistroBelkinSerializer
    permission_classes = [HasBiTradeApp, PuedeRegistrar]
    pagination_class = PaginacionListado
    filterset_fields = ('id_punto_venta', 'id_asesor', 'id_producto')
    search_fields = (
        'id_punto_venta__id_punto_venta',
        'id_punto_venta__nombre_pdv',
        'id_punto_venta__id_regional__nombre',
        'id_asesor__nombre',
        'id_producto__id_producto',
        'id_producto__nombre_producto',
        'id_producto__id_categoria__nombre',
        'observacion',
    )

    def perform_create(self, serializer):
        serializer.save(registrado_por=self.request.user)


def catalogos_belkin() -> dict:
    """Los desplegables del formulario, solo con lo activo.

    Cada punto viaja con su regional, cada asesor con su punto y cada producto
    con su categoría: el formulario va filtrando uno con el otro, como hacían
    las columnas «Zona Norte / Zona Sur» y «Case Apple / Lámina / …» del
    formulario anterior.

    Vive aparte de la vista porque el enlace público sirve exactamente lo
    mismo: el formulario es el mismo, con cuenta o sin ella.
    """
    regionales = RegionalBelkin.objects.filter(activa=True)
    puntos = PuntoVentaBelkin.objects.filter(activo=True, id_regional__activa=True)
    asesores = AsesorApple.objects.filter(activo=True)
    categorias = CategoriaBelkin.objects.filter(activa=True)
    productos = ProductoBelkin.objects.filter(activo=True, id_categoria__activa=True)
    return {
        'regionales': [{'value': r.pk, 'label': r.nombre} for r in regionales],
        'puntos_venta': [
            {'value': p.pk, 'label': p.etiqueta, 'id_regional': p.id_regional_id}
            for p in puntos
        ],
        'asesores': [
            {'value': a.pk, 'label': a.nombre, 'id_punto_venta': a.id_punto_venta_id}
            for a in asesores
        ],
        'categorias': [{'value': c.pk, 'label': c.nombre} for c in categorias],
        'productos': [
            {'value': p.pk, 'label': p.etiqueta, 'id_categoria': p.id_categoria_id}
            for p in productos
        ],
    }


@api_view(['GET'])
@permission_classes([HasBiTradeApp])
def opciones_belkin(request):
    """Los desplegables del formulario, para quien entra con su cuenta."""
    return Response(catalogos_belkin())
