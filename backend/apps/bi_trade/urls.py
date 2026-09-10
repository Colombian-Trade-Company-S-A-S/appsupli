from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

app_name = 'bi_trade'

# Sin slash final, igual que el resto de la API.
router = DefaultRouter(trailing_slash=False)
router.register('puntos-venta', views.PuntoVentaViewSet, basename='puntos-venta')
router.register('productos', views.ProductoViewSet, basename='productos')
router.register('ventas', views.VentaViewSet, basename='ventas')

urlpatterns = [
    path('opciones', views.opciones, name='opciones'),
    path('dashboard', views.dashboard, name='dashboard'),
    *router.urls,
]
