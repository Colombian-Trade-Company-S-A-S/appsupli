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
    path('acumulado', views.acumulado, name='acumulado'),
    # Carga de objetivos por Excel, con la misma plantilla de BI Trade.
    path('objetivos/plantilla', views.plantilla_objetivos, name='objetivos-plantilla'),
    path('objetivos/importar', views.importar_objetivos, name='objetivos-importar'),
    path('periodos/<str:periodo>/resumen', views.resumen_periodo, name='periodo-resumen'),
    path('periodos/<str:periodo>/activar', views.activar_periodo, name='periodo-activar'),
    # La excepción del A9: People reabre un mes ya congelado.
    path('periodos/<str:periodo>/edicion', views.habilitar_edicion, name='periodo-edicion'),
    path('objetivos/<int:pk>/resultado', views.cargar_resultado, name='objetivo-resultado'),
    path('objetivos/<int:pk>/validar', views.validar_resultado, name='objetivo-validar'),
    *router.urls,
]
