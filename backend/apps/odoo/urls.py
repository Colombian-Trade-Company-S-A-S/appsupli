from django.urls import path

from . import views

app_name = 'odoo'

urlpatterns = [
    path('estado', views.estado, name='estado'),
    path('sincronizar', views.sincronizar, name='sincronizar'),
    path('sincronizaciones', views.sincronizaciones, name='sincronizaciones'),
    path('accesos', views.accesos, name='accesos'),
]
