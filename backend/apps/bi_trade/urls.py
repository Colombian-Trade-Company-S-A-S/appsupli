from django.urls import path
from rest_framework.routers import DefaultRouter

from . import (
    publico,
    views,
    views_belkin,
    views_falabella,
    views_guias,
    views_hc,
    views_marcas,
    views_partners,
    views_precios,
    views_tmk,
)
from .canales import CLARO, FALABELLA, HC, TMK

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
# Marcas: un solo catálogo para los cuatro canales.
router.register('marcas', views_marcas.MarcaViewSet, basename='marcas')
# Precios Coltrade por periodo: cada canal sobre su propia tabla.
_pre = views_precios
router.register('precios', _pre.PrecioViewSet, basename='precios')
router.register('hc/precios', _pre.PrecioHcViewSet, basename='hc-precios')
router.register('falabella/precios', _pre.PrecioFalabellaViewSet, basename='falabella-precios')
router.register('tmk/precios', _pre.PrecioTmkViewSet, basename='tmk-precios')
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
# Plan Partners: el formulario de recomendaciones y sus catálogos.
_par = views_partners
router.register('partners/regionales', _par.RegionalPartnerViewSet, basename='partners-regionales')
router.register(
    'partners/puntos-venta', _par.PuntoVentaPartnerViewSet, basename='partners-puntos-venta'
)
router.register('partners/productos', _par.ProductoPartnerViewSet, basename='partners-productos')
router.register('partners/registros', _par.RegistroPartnerViewSet, basename='partners-registros')
router.register('partners/metas', _par.MetaPartnerViewSet, basename='partners-metas')
# Plan Recomiéndame Belkin: el formulario, sus catálogos y el tablero.
_bel = views_belkin
router.register('belkin/regionales', _bel.RegionalBelkinViewSet, basename='belkin-regionales')
router.register(
    'belkin/puntos-venta', _bel.PuntoVentaBelkinViewSet, basename='belkin-puntos-venta'
)
router.register('belkin/asesores', _bel.AsesorAppleViewSet, basename='belkin-asesores')
router.register('belkin/categorias', _bel.CategoriaBelkinViewSet, basename='belkin-categorias')
router.register('belkin/productos', _bel.ProductoBelkinViewSet, basename='belkin-productos')
router.register('belkin/registros', _bel.RegistroBelkinViewSet, basename='belkin-registros')

urlpatterns = [
    # La guía de uso en PDF de cada informe. Claro va sin tramo, como el resto de lo suyo.
    path('guia', views_guias.vista_guia('claro'), name='guia'),
    path('hc/guia', views_guias.vista_guia('hc'), name='hc-guia'),
    path('falabella/guia', views_guias.vista_guia('falabella'), name='falabella-guia'),
    path('tmk/guia', views_guias.vista_guia('tmk'), name='tmk-guia'),
    path('partners/guia', views_guias.vista_guia('partners'), name='partners-guia'),
    path('belkin/guia', views_guias.vista_guia('belkin'), name='belkin-guia'),
    path('opciones', views.opciones, name='opciones'),
    path('partners/opciones', _par.opciones_partners, name='partners-opciones'),
    path('partners/dashboard', _par.dashboard_partners, name='partners-dashboard'),
    path('belkin/opciones', _bel.opciones_belkin, name='belkin-opciones'),
    path('belkin/dashboard', _bel.dashboard_belkin, name='belkin-dashboard'),
    path(
        'belkin/dashboard/puntos/exportar',
        _bel.exportar_puntos_belkin,
        name='belkin-dashboard-puntos-exportar',
    ),
    path('dashboard', views.dashboard, name='dashboard'),
    path('cumplimiento', views.cumplimiento, name='cumplimiento'),
    path('avance-mensual', views.avance_mensual, name='avance-mensual'),
    # El detalle de un punto de venta (?id_punto_venta=), en cada canal.
    path('punto-venta-detalle', views.vista_detalle_punto(CLARO), name='punto-detalle'),
    path('hc/punto-venta-detalle', views.vista_detalle_punto(HC), name='hc-punto-detalle'),
    path(
        'falabella/punto-venta-detalle',
        views.vista_detalle_punto(FALABELLA),
        name='falabella-punto-detalle',
    ),
    path('tmk/punto-venta-detalle', views.vista_detalle_punto(TMK), name='tmk-punto-detalle'),
    # El detalle de una regional (?regional=), en cada canal.
    path('regional-detalle', views.vista_detalle_regional(CLARO), name='regional-detalle'),
    path('hc/regional-detalle', views.vista_detalle_regional(HC), name='hc-regional-detalle'),
    path(
        'falabella/regional-detalle',
        views.vista_detalle_regional(FALABELLA),
        name='falabella-regional-detalle',
    ),
    path('tmk/regional-detalle', views.vista_detalle_regional(TMK), name='tmk-regional-detalle'),
    path(
        'avance-mensual/exportar',
        views.avance_mensual_exportar,
        name='avance-mensual-exportar',
    ),
    path('importar-informe', views.importar_informe, name='importar-informe'),
    # El último informe del ERP en el buzón compartido (Claro y Tmk usan el mismo).
    path('informe-correo', views.informe_del_correo, name='informe-correo'),
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
