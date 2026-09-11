"""
Carga unos pocos datos de ejemplo del canal Homecenter.

    python manage.py seed_bi_trade_hc_demo
    python manage.py seed_bi_trade_hc_demo --limpiar    # borra lo sembrado y recarga

Siembra el mes anterior completo y el mes en curso hasta hoy, con metas en los
dos: así las dos hojas del tablero de HC tienen qué mostrar desde el primer
día. Solo toca las tablas `_hc`; lo de Claro no se mira.

Es idempotente: correrlo dos veces no duplica nada.
"""
import random
from datetime import date, timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.bi_trade.calendario import dias_del_mes, es_habil
from apps.bi_trade.models import (
    InventarioHc,
    Materiales,
    MetaComercialHc,
    ProductoHc,
    PuntoVentaHc,
    RegionalHc,
    VentaHc,
)

PUNTOS = [
    ('HC-101', 'Homecenter Calle 80', RegionalHc.ZONA_NORTE, Materiales.TODOS),
    ('HC-102', 'Homecenter Avenida 68', RegionalHc.ZONA_CENTRO, Materiales.TODOS),
    ('HC-103', 'Homecenter Cedritos', RegionalHc.ZONA_NORTE, Materiales.INCOMPLETOS),
    ('HC-104', 'Homecenter Soacha', RegionalHc.ZONA_SUR, Materiales.TODOS),
    ('HC-105', 'Homecenter Medellín Industriales', RegionalHc.NACIONAL, Materiales.INCOMPLETOS),
]

# (código, nombre, marca, precio Homecenter, precio Coltrade)
PRODUCTOS = [
    ('HCP-001', 'Torre de sonido Aiwa 100W', 'Aiwa', 1_199_900, 1_094_413),
    ('HCP-002', 'Parlante Cubitt Power Pro 40W', 'Cubitt', 319_900, 289_853),
    ('HCP-003', 'Echo Dot 5ta generación', 'Amazon', 249_900, 220_525),
    ('HCP-004', 'Roku Express HD', 'Roku', 139_900, 124_000),
    ('HCP-005', 'Bombillo inteligente Sylvania 9W', 'Sylvania', 34_900, 28_299),
    ('HCP-006', 'Cargador de pared Belkin 30W', 'Belkin', 119_900, 105_219),
    ('HCP-007', 'Smartwatch Cubitt Aura Pro', 'Cubitt', 419_900, 382_500),
    ('HCP-008', 'Power bank magnético Belkin 5000mAh', 'Belkin', 199_900, 176_408),
]


def _inicio_mes_anterior(hoy: date) -> date:
    return (hoy.replace(day=1) - timedelta(days=1)).replace(day=1)


class Command(BaseCommand):
    help = 'Carga tiendas, productos, ventas, metas e inventario de ejemplo de Homecenter.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--limpiar',
            action='store_true',
            help='Borra los datos de ejemplo de HC antes de volver a cargarlos.',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        codigos_pdv = [p[0] for p in PUNTOS]
        codigos_producto = [p[0] for p in PRODUCTOS]

        if options['limpiar']:
            # Solo lo que sembró este comando, igual que la semilla de Claro.
            de_demo = Q(id_producto__in=codigos_producto) | Q(id_punto_venta__in=codigos_pdv)
            borradas = VentaHc.objects.filter(de_demo).delete()[0]
            InventarioHc.objects.filter(de_demo).delete()
            MetaComercialHc.objects.filter(de_demo).delete()
            ProductoHc.objects.filter(id_producto__in=codigos_producto).delete()
            PuntoVentaHc.objects.filter(id_punto_venta__in=codigos_pdv).delete()
            self.stdout.write(
                self.style.WARNING(f'Datos de ejemplo de HC borrados: {borradas} venta(s).')
            )

        for codigo, nombre, regional, materiales in PUNTOS:
            PuntoVentaHc.objects.update_or_create(
                id_punto_venta=codigo,
                defaults={'nombre_pdv': nombre, 'regional': regional, 'materiales': materiales},
            )
        for codigo, nombre, marca, precio_hc, coltrade in PRODUCTOS:
            ProductoHc.objects.update_or_create(
                id_producto=codigo,
                defaults={
                    'nombre_producto': nombre,
                    'marca': marca,
                    'precio_venta_hc': precio_hc,
                    'precio_venta_coltrade': coltrade,
                },
            )

        puntos = list(PuntoVentaHc.objects.filter(id_punto_venta__in=codigos_pdv))
        productos = list(ProductoHc.objects.filter(id_producto__in=codigos_producto))
        hoy = timezone.localdate()
        meses = [_inicio_mes_anterior(hoy), hoy.replace(day=1)]

        creadas = 0
        if not VentaHc.objects.filter(id_punto_venta__in=codigos_pdv).exists():
            # Semilla fija: dos corridas dan el mismo tablero. Solo días hábiles
            # y solo hasta hoy, como vendería una tienda de verdad.
            azar = random.Random(2027)
            nuevas = []
            for inicio in meses:
                for dia in dias_del_mes(inicio.year, inicio.month):
                    if dia > hoy or not es_habil(dia):
                        continue
                    for punto in puntos:
                        for _ in range(azar.randint(0, 2)):
                            nuevas.append(
                                VentaHc(
                                    id_producto=azar.choice(productos),
                                    id_punto_venta=punto,
                                    fecha_venta=dia,
                                    cantidad_vendida=azar.randint(1, 4),
                                )
                            )
            VentaHc.objects.bulk_create(nuevas)
            creadas = len(nuevas)

        # Una meta por tienda × producto en cada mes, cerca de lo que se vende:
        # así el tablero muestra cumplimientos por encima y por debajo de 100%.
        azar = random.Random(78)
        inventarios = metas = 0
        for punto in puntos:
            for producto in productos:
                _, nuevo = InventarioHc.objects.get_or_create(
                    id_producto=producto,
                    id_punto_venta=punto,
                    defaults={'cantidad_inventario': azar.randint(0, 30)},
                )
                inventarios += nuevo
                for inicio in meses:
                    _, nueva = MetaComercialHc.objects.get_or_create(
                        id_producto=producto,
                        id_punto_venta=punto,
                        fecha_meta=inicio,
                        defaults={'meta_cantidad': azar.randint(4, 12)},
                    )
                    metas += nueva

        self.stdout.write(
            self.style.SUCCESS(
                f'{len(PUNTOS)} tienda(s) Homecenter, {len(PRODUCTOS)} producto(s), '
                f'{creadas} venta(s) nuevas, {inventarios} registro(s) de inventario y '
                f'{metas} meta(s) nuevas.'
            )
        )
