"""
Filtros de los listados de BI Trade.

Cada tabla se puede acotar por todos sus campos, no solo por los propios del
modelo: la marca vive en el producto y la regional en el punto de venta, pero
son las dos columnas por las que más se filtra, así que se exponen como si
fueran campos del listado.

Los rangos van como dos parámetros con nombre (`desde`/`hasta`,
`cantidadMin`/`cantidadMax`) en lugar de un `RangeFilter`, porque así el
frontend manda solo el extremo que la persona llenó.
"""
from django_filters import rest_framework as filtros

from .models import (
    Inventario,
    InventarioFalabella,
    InventarioHc,
    InventarioTmk,
    MetaComercial,
    MetaComercialFalabella,
    MetaComercialHc,
    MetaComercialTmk,
    Venta,
    VentaFalabella,
    VentaHc,
    VentaTmk,
)


class _PorProductoYPunto(filtros.FilterSet):
    """Lo común a los tres listados: todos cuelgan de un producto y un punto."""

    marca = filtros.CharFilter(field_name='id_producto__marca')
    regional = filtros.CharFilter(field_name='id_punto_venta__regional')
    materiales = filtros.CharFilter(field_name='id_punto_venta__materiales')
    # `Sin dato` no es un valor de la columna, es la ausencia de valor, así que
    # necesita su propio filtro: `regional=` vacío no filtraría nada.
    sin_regional = filtros.BooleanFilter(
        field_name='id_punto_venta__regional', lookup_expr='isnull'
    )


class VentaFilter(_PorProductoYPunto):
    desde = filtros.DateFilter(field_name='fecha_venta', lookup_expr='gte')
    hasta = filtros.DateFilter(field_name='fecha_venta', lookup_expr='lte')
    anio = filtros.NumberFilter(field_name='fecha_venta', lookup_expr='year')
    mes = filtros.NumberFilter(field_name='fecha_venta', lookup_expr='month')
    cantidad_min = filtros.NumberFilter(field_name='cantidad_vendida', lookup_expr='gte')
    cantidad_max = filtros.NumberFilter(field_name='cantidad_vendida', lookup_expr='lte')

    class Meta:
        model = Venta
        fields = ('id_producto', 'id_punto_venta', 'fecha_venta')


class InventarioFilter(_PorProductoYPunto):
    cantidad_min = filtros.NumberFilter(field_name='cantidad_inventario', lookup_expr='gte')
    cantidad_max = filtros.NumberFilter(field_name='cantidad_inventario', lookup_expr='lte')
    #: `?agotado=true` deja solo lo que está en cero; `false`, lo que tiene stock.
    agotado = filtros.BooleanFilter(method='filtrar_agotado')

    class Meta:
        model = Inventario
        fields = ('id_producto', 'id_punto_venta')

    def filtrar_agotado(self, queryset, nombre, valor):
        if valor:
            return queryset.filter(cantidad_inventario=0)
        return queryset.exclude(cantidad_inventario=0)


class MetaFilter(_PorProductoYPunto):
    desde = filtros.DateFilter(field_name='fecha_meta', lookup_expr='gte')
    hasta = filtros.DateFilter(field_name='fecha_meta', lookup_expr='lte')
    # El año y el mes son el corte natural de una meta: la fecha exacta del
    # registro solo indica a qué periodo pertenece.
    anio = filtros.NumberFilter(field_name='fecha_meta', lookup_expr='year')
    mes = filtros.NumberFilter(field_name='fecha_meta', lookup_expr='month')
    # `dinero_meta` es la anotación del viewset: la meta en pesos no se
    # guarda, se calcula con el precio del producto.
    dinero_min = filtros.NumberFilter(field_name='dinero_meta', lookup_expr='gte')
    dinero_max = filtros.NumberFilter(field_name='dinero_meta', lookup_expr='lte')
    cantidad_min = filtros.NumberFilter(field_name='meta_cantidad', lookup_expr='gte')
    cantidad_max = filtros.NumberFilter(field_name='meta_cantidad', lookup_expr='lte')

    class Meta:
        model = MetaComercial
        fields = ('id_producto', 'id_punto_venta', 'fecha_meta')


# ── Homecenter: los mismos filtros sobre las tablas `_hc` ──────────────────


class VentaHcFilter(VentaFilter):
    class Meta(VentaFilter.Meta):
        model = VentaHc


class InventarioHcFilter(InventarioFilter):
    class Meta(InventarioFilter.Meta):
        model = InventarioHc


class MetaHcFilter(MetaFilter):
    class Meta(MetaFilter.Meta):
        model = MetaComercialHc


# ── Falabella: los mismos filtros sobre las tablas `_falabella` ────────────


class VentaFalabellaFilter(VentaFilter):
    class Meta(VentaFilter.Meta):
        model = VentaFalabella


class InventarioFalabellaFilter(InventarioFilter):
    class Meta(InventarioFilter.Meta):
        model = InventarioFalabella


class MetaFalabellaFilter(MetaFilter):
    class Meta(MetaFilter.Meta):
        model = MetaComercialFalabella


# ── Tmk Ecommerce Claro: los mismos filtros sobre las tablas `_tmk` ────────────


class VentaTmkFilter(VentaFilter):
    class Meta(VentaFilter.Meta):
        model = VentaTmk


class InventarioTmkFilter(InventarioFilter):
    class Meta(InventarioFilter.Meta):
        model = InventarioTmk


class MetaTmkFilter(MetaFilter):
    class Meta(MetaFilter.Meta):
        model = MetaComercialTmk
