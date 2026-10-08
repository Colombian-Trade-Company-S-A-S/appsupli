"""
Rutas de los formularios públicos de los planes.

Son dos por plan y no hay más: las listas para llenar el formulario y el
envío. Cuelgan de su propio prefijo, aparte del tablero compartido.
"""
from django.urls import path

from . import publico_formulario

app_name = 'bi_trade_formulario'

urlpatterns = [
    path('<str:token>/opciones', publico_formulario.opciones, name='opciones'),
    path('<str:token>/registros', publico_formulario.registrar, name='registros'),
    # Belkin en su propio tramo: un token de Partners no llega a estas vistas.
    path(
        'belkin/<str:token>/opciones',
        publico_formulario.opciones_belkin,
        name='belkin-opciones',
    ),
    path(
        'belkin/<str:token>/registros',
        publico_formulario.registrar_belkin,
        name='belkin-registros',
    ),
]
