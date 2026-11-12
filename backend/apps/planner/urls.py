from django.urls import path

from . import views

app_name = 'planner'

urlpatterns = [
    path('opciones', views.opciones, name='opciones'),
    path('mi-cumplimiento', views.mi_cumplimiento, name='mi-cumplimiento'),
    path('dashboard', views.dashboard, name='dashboard'),
    path('personas/<int:pk>', views.persona, name='persona'),
    path('hitos', views.hitos, name='hitos'),
    path('hitos/<int:pk>/validar', views.validar_hito, name='hito-validar'),
    path('conexion', views.conexion, name='conexion'),
    path('sincronizar', views.sincronizar, name='sincronizar'),
    path('inventario', views.inventario, name='inventario'),
    path('planes', views.planes, name='planes'),
    path('planes/<int:pk>', views.plan, name='plan'),
    path('parametros', views.parametros, name='parametros'),
]
