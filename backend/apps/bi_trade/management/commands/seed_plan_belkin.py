"""
Carga los catálogos del plan Recomiéndame Belkin: regionales, puntos de venta,
categorías y productos.

    python manage.py seed_plan_belkin

Los datos salen del formulario anterior (Microsoft Forms), donde el punto y el
producto venían pegados con una barra invertida («Cav Andino \\ C159»,
«7020178 \\ Spigen Iphone 12 / 12 Pro Case Crystal Flex»): aquí el código
queda aparte del nombre.

Los asesores Apple no se cargan: en el archivo venían escritos a mano y el
mismo asesor aparecía de varias formas. Se crean desde el panel del plan.

Es idempotente: se puede correr las veces que haga falta. Actualiza el nombre
y el grupo de lo que ya exista, y no borra nada.
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.bi_trade.models import (
    CategoriaBelkin,
    ProductoBelkin,
    PuntoVentaBelkin,
    RegionalBelkin,
)

NORTE = 'Zona Norte'
SUR = 'Zona Sur'

# (centro de costos, nombre, regional): la columna en la que el formulario
# anterior mostraba cada punto.
PUNTOS = [
    ('C116', 'Calima Mall Plaza', NORTE),
    ('C159', 'Cav Andino', NORTE),
    ('C501', 'Cav Barranquilla Prado', NORTE),
    ('C106', 'Cav Bogota Alamos', NORTE),
    ('C102', 'Cav Bogota Chapinero', NORTE),
    ('C155', 'Cav Bogota Unicentro', NORTE),
    ('C507', 'Cav Cartagena Ejecutivos', NORTE),
    ('C181', 'Cav Chia Fontanar', NORTE),
    ('C192', 'Cav Cucuta Centro Av Quinta', NORTE),
    ('C123', 'Cav Cucuta Gran Colombia', NORTE),
    ('C125', 'Cav Neiva San Pedro', NORTE),
    ('C173', 'Cav Plaza Imperial T', NORTE),
    ('C510', 'Cav Santa Marta Buenavista', NORTE),
    ('C107', 'Cav Titan Plaza', NORTE),
    ('C176', 'Cav Bogota Centro Mayor', SUR),
    ('C111', 'Cav Bogota Kennedy', SUR),
    ('C108', 'Cav Bogota Plaza Claro', SUR),
    ('C157', 'Cav Bogota Plaza De Las Americas', SUR),
    ('C105', 'Cav Bogota Venecia', SUR),
    ('C303', 'Cav Medellin Av Colombia', SUR),
    ('C300', 'Cav Medellin Molinos Laureles', SUR),
    ('C301', 'Cav Medellin Premium', SUR),
    ('C305', 'Cav Medellin Puerta Del Norte', SUR),
    ('C508', 'Cav Monteria Alameda', SUR),
    ('C104', 'Cav Soacha Mercurio', SUR),
    ('C302', 'Cav Viva Envigado', SUR),
    ('C131', 'Cav Yopal', SUR),
]

CASE = 'Case Apple'
LAMINA = 'Lámina'
CABLE = 'Cable'
CARGADOR = 'Cargador'

# (código, nombre, categoría): la columna en la que el formulario anterior
# mostraba cada producto.
PRODUCTOS = [
    ('7020166', 'Spigen Iphone 15 Pro Case Crystal Hybrid (Magfit)', CASE),
    ('7020178', 'Spigen Iphone 12 / 12 Pro Case Crystal Flex', CASE),
    ('7019748', 'Tempered Glass Anti-Microbio Iphonexr/11', LAMINA),
    ('7019749', 'Ultraglassanti-Microbioiphone13/13Pro/14', LAMINA),
    ('7019750', 'Ultraglass Anti-Microbio Iphone14Promax', LAMINA),
    ('7020226', 'Sfp Tempered Glass Iphone 15/14 Pro', LAMINA),
    ('7020227', 'Sfp Tempered Glass Iphone15Plus/14 Promax', LAMINA),
    ('7020228', 'Sfp Tempered Glass Iphone 15 Pro', LAMINA),
    ('7020229', 'Sfp Tempered Glass Iphone 15 Pro Max', LAMINA),
    ('7020230', 'Sfp Tempered Glass Iphone 13/13Pro/14', LAMINA),
    ('7015927', 'Cable Lightning Vers Usb-A 1Mt Blnc Belk', CABLE),
    ('7015929', 'Cable Trenzado Usb-C A Usb-C 1M Ngr Belk', CABLE),
    ('7016122', 'Cabl Boost Chrg Lightning Usb Tip-A Belk', CABLE),
    ('7015931', 'Carg Prd Db Usb-A24W+Cab Lgth_Usb-A Belk', CARGADOR),
    ('7015981', 'Soport F8J168Bt Smartp Portav Coche Belk', CARGADOR),
    ('7016114', 'Carg Autom Boost Chrg 32W Cab Usb-C Belk', CARGADOR),
    ('7016115', 'Carg Autom Boost Chrg 24W 2Xusb 2.0 Belk', CARGADOR),
    ('7016116', 'Carg Autom Boost Charg 20W Usb-C Pd Belk', CARGADOR),
    ('7018658', 'Crg Prd 1Pusb-C20W+Cblusb-C_Usb-C1M Belk', CARGADOR),
    ('7018659', 'Crg Prd Wca006Dqwh 1Pusb-C20Wt Blnc Belk', CARGADOR),
    ('7018660', 'Crg Prd 1Pusb-C30W+Cblusb-C_Usb-C1M Belk', CARGADOR),
    ('7018661', 'Crg Prd Wca005Dqwh 1Pusb-C30Wt Blnc Belk', CARGADOR),
    ('7018673', 'Cr Pd 2P37Wusb-C25W+Cblusb-A12W Bln Belk', CARGADOR),
    ('7022138', 'Cargador Pared 20W Usb-C Blnc Belk', CARGADOR),
    ('7022139', 'Cargador Pared 30W Usb-C Blnc Belk', CARGADOR),
]


class Command(BaseCommand):
    help = 'Carga las regionales, puntos de venta, categorías y productos del plan Belkin.'

    @transaction.atomic
    def handle(self, *args, **options):
        regionales = {}
        for nombre in (NORTE, SUR):
            regionales[nombre], _ = RegionalBelkin.objects.get_or_create(nombre=nombre)
        self.stdout.write(f'Regionales: {len(regionales)}.')

        nuevos = 0
        for codigo, nombre, regional in PUNTOS:
            _, creado = PuntoVentaBelkin.objects.update_or_create(
                id_punto_venta=codigo,
                defaults={'nombre_pdv': nombre, 'id_regional': regionales[regional]},
            )
            nuevos += creado
        self.stdout.write(f'Puntos de venta: {len(PUNTOS)} ({nuevos} nuevos).')

        categorias = {}
        for nombre in (CASE, LAMINA, CABLE, CARGADOR):
            categorias[nombre], _ = CategoriaBelkin.objects.get_or_create(nombre=nombre)
        self.stdout.write(f'Categorías: {len(categorias)}.')

        nuevos = 0
        for codigo, nombre, categoria in PRODUCTOS:
            _, creado = ProductoBelkin.objects.update_or_create(
                id_producto=codigo,
                defaults={'nombre_producto': nombre, 'id_categoria': categorias[categoria]},
            )
            nuevos += creado
        self.stdout.write(f'Productos: {len(PRODUCTOS)} ({nuevos} nuevos).')

        self.stdout.write(self.style.SUCCESS('Catálogos del plan Belkin listos.'))
