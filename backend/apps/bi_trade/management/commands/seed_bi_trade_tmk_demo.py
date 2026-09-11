"""
Carga unos pocos datos de ejemplo del canal Tmk Ecommerce Claro.

    python manage.py seed_bi_trade_tmk_demo
    python manage.py seed_bi_trade_tmk_demo --limpiar    # borra lo sembrado y recarga

Siembra el mes anterior completo y el mes en curso hasta hoy, con metas en los
dos: así las dos hojas del tablero de Tmk Ecommerce Claro tienen qué mostrar desde el
primer día. Solo toca las tablas `_tmk`; lo de Claro y Homecenter no se
mira.

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
    InventarioTmk,
    Materiales,
    MetaComercialTmk,
    ProductoTmk,
    PuntoVentaTmk,
    RegionalTmk,
    VentaTmk,
)

PUNTOS = [
    ('TMK-301', 'Tmk Call Center Bogotá', RegionalTmk.ZONA_CENTRO, Materiales.TODOS),
    ('TMK-302', 'Tienda virtual Claro', RegionalTmk.NACIONAL, Materiales.TODOS),
    ('TMK-303', 'Tmk Call Center Barranquilla', RegionalTmk.ZONA_NORTE, Materiales.INCOMPLETOS),
    ('TMK-304', 'Tmk Call Center Cali', RegionalTmk.ZONA_SUR, Materiales.TODOS),
    ('TMK-305', 'Tmk Call Center Medellín', RegionalTmk.NACIONAL, Materiales.INCOMPLETOS),
]

# (código, nombre, marca, precio Tmk Ecommerce Claro, precio Coltrade)
PRODUCTOS = [
    ('TMKP-001', 'Echo Dot 5ta generación', 'Amazon', 249_900, 220_525),
    ('TMKP-002', 'Fire TV Stick Lite', 'Amazon', 219_900, 193_500),
    ('TMKP-003', 'Audífonos JBL Wave Buds', 'JBL', 229_900, 202_300),
    ('TMKP-004', 'Parlante JBL Go 4', 'JBL', 259_900, 228_700),
    ('TMKP-005', 'Smartwatch Cubitt CT2 Pro', 'Cubitt', 189_900, 167_100),
    ('TMKP-006', 'Roku Express 4K', 'Roku', 229_900, 202_300),
    ('TMKP-007', 'Cargador de pared Belkin 25W', 'Belkin', 99_900, 87_900),
    ('TMKP-008', 'Kit bombillos inteligentes Sylvania x2', 'Sylvania', 69_900, 58_700),
]


def _inicio_mes_anterior(hoy: date) -> date:
    return (hoy.replace(day=1) - timedelta(days=1)).replace(day=1)


class Command(BaseCommand):
    help = 'Carga tiendas, productos, ventas, metas e inventario de ejemplo de Tmk Ecommerce Claro.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--limpiar',
            action='store_true',
            help='Borra los datos de ejemplo de Tmk Ecommerce Claro antes de volver a cargarlos.',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        codigos_pdv = [p[0] for p in PUNTOS]
        codigos_producto = [p[0] for p in PRODUCTOS]

        if options['limpiar']:
            # Solo lo que sembró este comando, igual que las otras semillas.
            de_demo = Q(id_producto__in=codigos_producto) | Q(id_punto_venta__in=codigos_pdv)
            borradas = VentaTmk.objects.filter(de_demo).delete()[0]
            InventarioTmk.objects.filter(de_demo).delete()
            MetaComercialTmk.objects.filter(de_demo).delete()
            ProductoTmk.objects.filter(id_producto__in=codigos_producto).delete()
            PuntoVentaTmk.objects.filter(id_punto_venta__in=codigos_pdv).delete()
            self.stdout.write(
                self.style.WARNING(f'Datos de ejemplo de Tmk borrados: {borradas} venta(s).')
            )

        for codigo, nombre, regional, materiales in PUNTOS:
            PuntoVentaTmk.objects.update_or_create(
                id_punto_venta=codigo,
                defaults={'nombre_pdv': nombre, 'regional': regional, 'materiales': materiales},
            )
        for codigo, nombre, marca, precio_tmk, coltrade in PRODUCTOS:
            ProductoTmk.objects.update_or_create(
                id_producto=codigo,
                defaults={
                    'nombre_producto': nombre,
                    'marca': marca,
                    'precio_venta_tmk': precio_tmk,
                    'precio_venta_coltrade': coltrade,
                },
            )

        puntos = list(PuntoVentaTmk.objects.filter(id_punto_venta__in=codigos_pdv))
        productos = list(ProductoTmk.objects.filter(id_producto__in=codigos_producto))
        hoy = timezone.localdate()
        meses = [_inicio_mes_anterior(hoy), hoy.replace(day=1)]

        creadas = 0
        if not VentaTmk.objects.filter(id_punto_venta__in=codigos_pdv).exists():
            # Semilla fija: dos corridas dan el mismo tablero. Solo días hábiles
            # y solo hasta hoy, como vendería una tienda de verdad.
            azar = random.Random(2029)
            nuevas = []
            for inicio in meses:
                for dia in dias_del_mes(inicio.year, inicio.month):
                    if dia > hoy or not es_habil(dia):
                        continue
                    for punto in puntos:
                        for _ in range(azar.randint(0, 2)):
                            nuevas.append(
                                VentaTmk(
                                    id_producto=azar.choice(productos),
                                    id_punto_venta=punto,
                                    fecha_venta=dia,
                                    cantidad_vendida=azar.randint(1, 4),
                                )
                            )
            VentaTmk.objects.bulk_create(nuevas)
            creadas = len(nuevas)

        # Una meta por tienda × producto en cada mes, cerca de lo que se vende:
        # así el tablero muestra cumplimientos por encima y por debajo de 100%.
        azar = random.Random(104)
        inventarios = metas = 0
        for punto in puntos:
            for producto in productos:
                _, nuevo = InventarioTmk.objects.get_or_create(
                    id_producto=producto,
                    id_punto_venta=punto,
                    defaults={'cantidad_inventario': azar.randint(0, 30)},
                )
                inventarios += nuevo
                for inicio in meses:
                    _, nueva = MetaComercialTmk.objects.get_or_create(
                        id_producto=producto,
                        id_punto_venta=punto,
                        fecha_meta=inicio,
                        defaults={'meta_cantidad': azar.randint(4, 12)},
                    )
                    metas += nueva

        self.stdout.write(
            self.style.SUCCESS(
                f'{len(PUNTOS)} punto(s) Tmk Ecommerce Claro, {len(PRODUCTOS)} producto(s), '
                f'{creadas} venta(s) nuevas, {inventarios} registro(s) de inventario y '
                f'{metas} meta(s) nuevas.'
            )
        )
