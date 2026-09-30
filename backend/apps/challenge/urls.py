from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

app_name = 'challenge'

# Sin slash final, como el resto de la API.
router = DefaultRouter(trailing_slash=False)
router.register('retos', views.RetoViewSet, basename='retos')

urlpatterns = [
    path('opciones', views.opciones, name='opciones'),
    path('mis-retos', views.mis_retos, name='mis-retos'),
    path('top', views.top, name='top'),
    # Ciclo de vida del reto: lo gestiona People.
    path('retos/<int:pk>/publicar', views.publicar, name='reto-publicar'),
    path('retos/<int:pk>/cerrar', views.cerrar, name='reto-cerrar'),
    path('retos/<int:pk>/finalizar', views.finalizar, name='reto-finalizar'),
    path('retos/<int:pk>/reabrir', views.reabrir, name='reto-reabrir'),
    path('retos/<int:pk>/participaciones', views.participaciones, name='reto-participaciones'),
    path('retos/<int:pk>/resultado', views.resultado, name='reto-resultado'),
    path('participaciones/<int:pk>/valorar', views.valorar, name='participacion-valorar'),
    path('participaciones/<int:pk>/revision', views.pedir_revision, name='participacion-revision'),
    path('revisiones/<int:pk>/atender', views.atender_revision, name='revision-atender'),
    *router.urls,
]
