"""Admin de Django para BI Trade Marketing."""
from django.contrib import admin

from .models import Inventario, MetaComercial, Producto, PuntoVenta, Venta


@admin.register(PuntoVenta)
class PuntoVentaAdmin(admin.ModelAdmin):
    list_display = ('id_punto_venta', 'nombre_pdv', 'regional', 'materiales')
    list_filter = ('regional', 'materiales')
    search_fields = ('id_punto_venta', 'nombre_pdv')


@admin.register(Producto)
class ProductoAdmin(admin.ModelAdmin):
    list_display = (
        'id_producto', 'nombre_producto', 'marca', 'precio_venta_claro',
        'precio_venta_coltrade', 'puntaje',
    )
    list_filter = ('marca',)
    search_fields = ('id_producto', 'nombre_producto', 'marca')


@admin.register(Venta)
class VentaAdmin(admin.ModelAdmin):
    list_display = ('id_venta', 'fecha_venta', 'id_producto', 'id_punto_venta', 'cantidad_vendida')
    list_filter = ('fecha_venta', 'id_punto_venta__regional')
    autocomplete_fields = ('id_producto', 'id_punto_venta')
    date_hierarchy = 'fecha_venta'


@admin.register(Inventario)
class InventarioAdmin(admin.ModelAdmin):
    list_display = ('id_punto_venta', 'id_producto', 'cantidad_inventario')
    list_filter = ('id_punto_venta__regional', 'id_producto__marca')
    autocomplete_fields = ('id_producto', 'id_punto_venta')


@admin.register(MetaComercial)
class MetaAdmin(admin.ModelAdmin):
    list_display = (
        'id_punto_venta', 'id_producto', 'meta_cantidad',
    )
    list_filter = ('id_punto_venta__regional', 'id_producto__marca')
    autocomplete_fields = ('id_producto', 'id_punto_venta')
