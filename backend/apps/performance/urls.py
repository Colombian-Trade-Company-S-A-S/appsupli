from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

app_name = 'performance'

# Sin slash final, como el resto de la API.
router = DefaultRouter(trailing_slash=False)
router.register('objetivos', views.ObjetivoViewSet, basename='objetivos')

urlpatterns = [
    path('opciones', views.opciones, name='opciones'),
    path('resumen', views.resumen, name='resumen'),
    path('mis-objetivos', views.mis_objetivos, name='mis-objetivos'),
    path('periodos/<str:periodo>/resumen', views.resumen_periodo, name='periodo-resumen'),
    path('periodos/<str:periodo>/activar', views.activar_periodo, name='periodo-activar'),
    *router.urls,
]
