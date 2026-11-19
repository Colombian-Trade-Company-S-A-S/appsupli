from django.urls import path

from . import views

app_name = 'planner'

urlpatterns = [
    path('opciones', views.opciones, name='opciones'),
    path('mi-cumplimiento', views.mi_cumplimiento, name='mi-cumplimiento'),
    path('dashboard', views.dashboard, name='dashboard'),
    path('personas/<int:pk>', views.persona, name='persona'),
    path('conexion', views.conexion, name='conexion'),
    path('sincronizar', views.sincronizar, name='sincronizar'),
    # El plan de cada persona sale de su URL de Planner: aquí solo se consulta.
    path('planes', views.planes, name='planes'),
    path('parametros', views.parametros, name='parametros'),
    # El recálculo excepcional de una semana ya cerrada: People, con motivo.
    path('parametros/recalcular', views.recalcular, name='parametros-recalcular'),
]
