"""
Rutas del tablero público: sin cuenta, por enlace y contraseña.

Todo cuelga del token del enlace. `acceso` cambia la contraseña por un acceso
firmado; el resto son las consultas de solo lectura que ese acceso abre.
"""
from django.urls import path

from . import publico

app_name = 'bi_trade_publico'

urlpatterns = [
    path('<str:token>', publico.info, name='info'),
    path('<str:token>/acceso', publico.acceso, name='acceso'),
    path('<str:token>/avance-mensual', publico.avance_mensual, name='avance-mensual'),
    path(
        '<str:token>/cumplimiento-diario',
        publico.cumplimiento_diario,
        name='cumplimiento-diario',
    ),
    path('<str:token>/tickets', publico.tickets, name='tickets'),
    path('<str:token>/opciones', publico.opciones, name='opciones'),
    path('<str:token>/productos', publico.productos, name='productos'),
    path('<str:token>/puntos-venta', publico.puntos_venta, name='puntos-venta'),
    path('<str:token>/campanas', publico.campanas, name='campanas'),
]
