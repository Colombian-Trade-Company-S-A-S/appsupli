"""
Rutas del formulario público del plan Partners.

Son dos y no hay más: las listas para llenar el formulario y el envío. Cuelgan
de su propio prefijo, aparte del tablero compartido.
"""
from django.urls import path

from . import publico_formulario

app_name = 'bi_trade_formulario'

urlpatterns = [
    path('<str:token>/opciones', publico_formulario.opciones, name='opciones'),
    path('<str:token>/registros', publico_formulario.registrar, name='registros'),
]
