"""
Carga los catálogos del plan Partners: regionales, puntos de venta y productos.

    python manage.py seed_plan_partners

Los datos salen del formulario anterior (Microsoft Forms), donde el punto y el
producto venían pegados en un texto («Cav Cucuta Centro Av Quinta - C192»):
aquí el código queda aparte del nombre, y el nombre en tipo oración.

Es idempotente: se puede correr las veces que haga falta. Actualiza el nombre y
la regional de lo que ya exista, y no borra nada. Los tres catálogos también se
administran desde el formulario, así que esto es solo la carga inicial.
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.bi_trade.models import ProductoPartner, PuntoVentaPartner, RegionalPartner

NORTE = 'Región Centro (Z. Norte)'
SUR = 'Región Centro (Z. Sur)'
COSTA = 'Región Costa'

# (código, nombre, regional). La regional es la zona en la que el formulario
# anterior mostraba cada punto.
PUNTOS = [
    ('C114', 'Bosa Gran Plaza', SUR),
    ('C159', 'Cav Andino', NORTE),
    ('C502', 'Cav Barranquilla Metropolitano', COSTA),
    ('C501', 'Cav Barranquilla Prado', COSTA),
    ('C106', 'Cav Bogota Alamos', NORTE),
    ('C116', 'Cav Bogota Calima', NORTE),
    ('C176', 'Cav Bogota Centro Mayor', SUR),
    ('C102', 'Cav Bogota Chapinero', NORTE),
    ('C109', 'Cav Bogota Cra 8', SUR),
    ('C153', 'Cav Bogota Ensueño Madelena', SUR),
    ('C110', 'Cav Bogota Fontibon', NORTE),
    ('C111', 'Cav Bogota Kennedy', SUR),
    ('C108', 'Cav Bogota Plaza Claro', SUR),
    ('C157', 'Cav Bogota Plaza De Las Americas', SUR),
    ('C103', 'Cav Bogota Restrepo', SUR),
    ('C133', 'Cav Bogota Toberin', NORTE),
    ('C155', 'Cav Bogota Unicentro', NORTE),
    ('C105', 'Cav Bogota Venecia', SUR),
    ('C182', 'Cav Bucaramanga Omnicentro', COSTA),
    ('C309', 'Cav Cali Jardin Plaza', NORTE),
    ('C507', 'Cav Cartagena Ejecutivos', COSTA),
    ('C312', 'Cav Caucasia', SUR),
    ('C181', 'Cav Chia Fontanar', NORTE),
    ('C192', 'Cav Cucuta Centro Av Quinta', NORTE),
    ('C123', 'Cav Cucuta Gran Colombia', NORTE),
    ('C303', 'Cav Medellin Av Colombia', COSTA),
    ('C300', 'Cav Medellin Molinos Laureles', COSTA),
    ('C301', 'Cav Medellin Premium', COSTA),
    ('C305', 'Cav Medellin Puerta Del Norte', COSTA),
    ('C508', 'Cav Monteria Alameda', COSTA),
    ('C125', 'Cav Neiva San Pedro', COSTA),
    ('C173', 'Cav Plaza Imperial T', NORTE),
    ('C321', 'Cav Popayan Plaza Colonial', NORTE),
    ('C510', 'Cav Santa Marta Buenavista', COSTA),
    ('C511', 'Cav Sincelejo Av Okala', COSTA),
    ('C104', 'Cav Soacha Mercurio II', SUR),
    ('C107', 'Cav Titan Plaza', NORTE),
    ('C577', 'Cav Valledupar Orbe Plaza', COSTA),
    ('C302', 'Cav Viva Envigado', COSTA),
    ('C131', 'Cav Yopal', SUR),
]

# (código, nombre, precio). Los precios salen del archivo de información del
# plan, y con ellos el tablero valora lo recomendado.
PRODUCTOS = [
    ('7015640', 'Blue', 31_340),
    ('7015490', 'Estandar', 21_996),
    ('7018735', 'Matte', 37_752),
    ('7018734', 'Privacy', 47_206),
    ('7019655', 'QQQ', 22_090),
]


class Command(BaseCommand):
    help = 'Carga los puntos de venta y productos del plan Partners.'

    @transaction.atomic
    def handle(self, *args, **options):
        regionales = {}
        nuevos = 0
        for nombre in (NORTE, SUR, COSTA):
            regional, creada = RegionalPartner.objects.get_or_create(nombre=nombre)
            regionales[nombre] = regional
            nuevos += creada
        self.stdout.write(f'Regionales: {len(regionales)} ({nuevos} nuevas).')

        nuevos = 0
        for codigo, nombre, regional in PUNTOS:
            _, creado = PuntoVentaPartner.objects.update_or_create(
                id_punto_venta=codigo,
                defaults={'nombre_pdv': nombre, 'id_regional': regionales[regional]},
            )
            nuevos += creado
        self.stdout.write(f'Puntos de venta: {len(PUNTOS)} ({nuevos} nuevos).')

        nuevos = 0
        for codigo, nombre, precio in PRODUCTOS:
            _, creado = ProductoPartner.objects.update_or_create(
                id_producto=codigo, defaults={'nombre_producto': nombre, 'precio': precio}
            )
            nuevos += creado
        self.stdout.write(f'Productos: {len(PRODUCTOS)} ({nuevos} nuevos).')

        self.stdout.write(self.style.SUCCESS('Catálogos del plan Partners listos.'))
