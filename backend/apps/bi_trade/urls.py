from django.urls import path
from rest_framework.routers import DefaultRouter

from . import publico, views, views_falabella, views_hc, views_tmk

app_name = 'bi_trade'

# Sin slash final, igual que el resto de la API.
router = DefaultRouter(trailing_slash=False)
router.register('puntos-venta', views.PuntoVentaViewSet, basename='puntos-venta')
router.register('productos', views.ProductoViewSet, basename='productos')
router.register('ventas', views.VentaViewSet, basename='ventas')
router.register('inventario', views.InventarioViewSet, basename='inventario')
router.register('metas', views.MetaViewSet, basename='metas')
router.register('campanas', views.CampanaViewSet, basename='campanas')
router.register('enlaces', publico.EnlacePublicoViewSet, basename='enlaces')
# Homecenter: los mismos recursos, sobre sus propias tablas.
router.register('hc/puntos-venta', views_hc.PuntoVentaHcViewSet, basename='hc-puntos-venta')
router.register('hc/productos', views_hc.ProductoHcViewSet, basename='hc-productos')
router.register('hc/ventas', views_hc.VentaHcViewSet, basename='hc-ventas')
router.register('hc/inventario', views_hc.InventarioHcViewSet, basename='hc-inventario')
router.register('hc/metas', views_hc.MetaHcViewSet, basename='hc-metas')
# Falabella: igual que Homecenter, sobre sus tablas `_falabella`.
_fal = views_falabella
router.register(
    'falabella/puntos-venta', _fal.PuntoVentaFalabellaViewSet, basename='falabella-puntos-venta'
)
router.register(
    'falabella/productos', _fal.ProductoFalabellaViewSet, basename='falabella-productos'
)
router.register('falabella/ventas', _fal.VentaFalabellaViewSet, basename='falabella-ventas')
router.register(
    'falabella/inventario', _fal.InventarioFalabellaViewSet, basename='falabella-inventario'
)
router.register('falabella/metas', _fal.MetaFalabellaViewSet, basename='falabella-metas')
# Tmk Ecommerce Claro: igual que Homecenter, sobre sus tablas `_tmk`.
_tmk = views_tmk
router.register(
    'tmk/puntos-venta', _tmk.PuntoVentaTmkViewSet, basename='tmk-puntos-venta'
)
router.register(
    'tmk/productos', _tmk.ProductoTmkViewSet, basename='tmk-productos'
)
router.register('tmk/ventas', _tmk.VentaTmkViewSet, basename='tmk-ventas')
router.register(
    'tmk/inventario', _tmk.InventarioTmkViewSet, basename='tmk-inventario'
)
router.register('tmk/metas', _tmk.MetaTmkViewSet, basename='tmk-metas')

urlpatterns = [
    path('opciones', views.opciones, name='opciones'),
    path('dashboard', views.dashboard, name='dashboard'),
    path('cumplimiento', views.cumplimiento, name='cumplimiento'),
    path('avance-mensual', views.avance_mensual, name='avance-mensual'),
    path(
        'avance-mensual/exportar',
        views.avance_mensual_exportar,
        name='avance-mensual-exportar',
    ),
    path('importar-informe', views.importar_informe, name='importar-informe'),
    path('cumplimiento-diario', views.cumplimiento_diario, name='cumplimiento-diario'),
    path(
        'cumplimiento-diario/exportar',
        views.cumplimiento_diario_exportar,
        name='cumplimiento-diario-exportar',
    ),
    path('tickets', views.tickets, name='tickets'),
    path('tickets/exportar', views.tickets_exportar, name='tickets-exportar'),
    path('hc/opciones', views_hc.opciones_hc, name='hc-opciones'),
    path('hc/avance-mensual', views_hc.avance_mensual_hc, name='hc-avance-mensual'),
    path(
        'hc/avance-mensual/exportar',
        views_hc.avance_mensual_hc_exportar,
        name='hc-avance-mensual-exportar',
    ),
    path(
        'hc/cumplimiento-diario',
        views_hc.cumplimiento_diario_hc,
        name='hc-cumplimiento-diario',
    ),
    path(
        'hc/cumplimiento-diario/exportar',
        views_hc.cumplimiento_diario_hc_exportar,
        name='hc-cumplimiento-diario-exportar',
    ),
    path('falabella/opciones', _fal.opciones_falabella, name='falabella-opciones'),
    path(
        'falabella/avance-mensual',
        _fal.avance_mensual_falabella,
        name='falabella-avance-mensual',
    ),
    path(
        'falabella/avance-mensual/exportar',
        _fal.avance_mensual_falabella_exportar,
        name='falabella-avance-mensual-exportar',
    ),
    path(
        'falabella/cumplimiento-diario',
        _fal.cumplimiento_diario_falabella,
        name='falabella-cumplimiento-diario',
    ),
    path(
        'falabella/cumplimiento-diario/exportar',
        _fal.cumplimiento_diario_falabella_exportar,
        name='falabella-cumplimiento-diario-exportar',
    ),
    path('tmk/opciones', _tmk.opciones_tmk, name='tmk-opciones'),
    path('tmk/importar-informe', _tmk.importar_informe_tmk, name='tmk-importar-informe'),
    path(
        'tmk/avance-mensual',
        _tmk.avance_mensual_tmk,
        name='tmk-avance-mensual',
    ),
    path(
        'tmk/avance-mensual/exportar',
        _tmk.avance_mensual_tmk_exportar,
        name='tmk-avance-mensual-exportar',
    ),
    path(
        'tmk/cumplimiento-diario',
        _tmk.cumplimiento_diario_tmk,
        name='tmk-cumplimiento-diario',
    ),
    path(
        'tmk/cumplimiento-diario/exportar',
        _tmk.cumplimiento_diario_tmk_exportar,
        name='tmk-cumplimiento-diario-exportar',
    ),
    *router.urls,
]
