"""
Carga unos pocos datos de ejemplo del canal Falabella.

    python manage.py seed_bi_trade_falabella_demo
    python manage.py seed_bi_trade_falabella_demo --limpiar    # borra lo sembrado y recarga

Siembra el mes anterior completo y el mes en curso hasta hoy, con metas en los
dos: así las dos hojas del tablero de Falabella tienen qué mostrar desde el
primer día. Solo toca las tablas `_falabella`; lo de Claro y Homecenter no se
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
    InventarioFalabella,
    Materiales,
    MetaComercialFalabella,
    ProductoFalabella,
    PuntoVentaFalabella,
    RegionalFalabella,
    VentaFalabella,
)

PUNTOS = [
    ('FAL-201', 'Falabella Andino', RegionalFalabella.ZONA_NORTE, Materiales.TODOS),
    ('FAL-202', 'Falabella Unicentro', RegionalFalabella.ZONA_NORTE, Materiales.INCOMPLETOS),
    ('FAL-203', 'Falabella Titán Plaza', RegionalFalabella.ZONA_CENTRO, Materiales.TODOS),
    ('FAL-204', 'Falabella Centro Mayor', RegionalFalabella.ZONA_SUR, Materiales.TODOS),
    ('FAL-205', 'Falabella Santafé Medellín', RegionalFalabella.NACIONAL, Materiales.INCOMPLETOS),
]

# (código, nombre, marca, precio Falabella, precio Coltrade)
PRODUCTOS = [
    ('FALP-001', 'Audífonos JBL Tune 520BT', 'JBL', 299_900, 265_000),
    ('FALP-002', 'Parlante JBL Flip 6', 'JBL', 649_900, 584_900),
    ('FALP-003', 'Echo Show 5', 'Amazon', 449_900, 399_000),
    ('FALP-004', 'Fire TV Stick 4K', 'Amazon', 279_900, 246_300),
    ('FALP-005', 'Smartwatch Cubitt CT4', 'Cubitt', 239_900, 212_400),
    ('FALP-006', 'Torre de sonido Aiwa 60W', 'Aiwa', 799_900, 719_900),
    ('FALP-007', 'Cargador inalámbrico Belkin 15W', 'Belkin', 159_900, 139_100),
    ('FALP-008', 'Roku Streaming Stick 4K', 'Roku', 329_900, 290_300),
]


def _inicio_mes_anterior(hoy: date) -> date:
    return (hoy.replace(day=1) - timedelta(days=1)).replace(day=1)


class Command(BaseCommand):
    help = 'Carga tiendas, productos, ventas, metas e inventario de ejemplo de Falabella.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--limpiar',
            action='store_true',
            help='Borra los datos de ejemplo de Falabella antes de volver a cargarlos.',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        codigos_pdv = [p[0] for p in PUNTOS]
        codigos_producto = [p[0] for p in PRODUCTOS]

        if options['limpiar']:
            # Solo lo que sembró este comando, igual que las otras semillas.
            de_demo = Q(id_producto__in=codigos_producto) | Q(id_punto_venta__in=codigos_pdv)
            borradas = VentaFalabella.objects.filter(de_demo).delete()[0]
            InventarioFalabella.objects.filter(de_demo).delete()
            MetaComercialFalabella.objects.filter(de_demo).delete()
            ProductoFalabella.objects.filter(id_producto__in=codigos_producto).delete()
            PuntoVentaFalabella.objects.filter(id_punto_venta__in=codigos_pdv).delete()
            self.stdout.write(
                self.style.WARNING(f'Datos de ejemplo de Falabella borrados: {borradas} venta(s).')
            )

        for codigo, nombre, regional, materiales in PUNTOS:
            PuntoVentaFalabella.objects.update_or_create(
                id_punto_venta=codigo,
                defaults={'nombre_pdv': nombre, 'regional': regional, 'materiales': materiales},
            )
        for codigo, nombre, marca, precio_falabella, coltrade in PRODUCTOS:
            ProductoFalabella.objects.update_or_create(
                id_producto=codigo,
                defaults={
                    'nombre_producto': nombre,
                    'marca': marca,
                    'precio_venta_falabella': precio_falabella,
                    'precio_venta_coltrade': coltrade,
                },
            )

        puntos = list(PuntoVentaFalabella.objects.filter(id_punto_venta__in=codigos_pdv))
        productos = list(ProductoFalabella.objects.filter(id_producto__in=codigos_producto))
        hoy = timezone.localdate()
        meses = [_inicio_mes_anterior(hoy), hoy.replace(day=1)]

        creadas = 0
        if not VentaFalabella.objects.filter(id_punto_venta__in=codigos_pdv).exists():
            # Semilla fija: dos corridas dan el mismo tablero. Solo días hábiles
            # y solo hasta hoy, como vendería una tienda de verdad.
            azar = random.Random(2028)
            nuevas = []
            for inicio in meses:
                for dia in dias_del_mes(inicio.year, inicio.month):
                    if dia > hoy or not es_habil(dia):
                        continue
                    for punto in puntos:
                        for _ in range(azar.randint(0, 2)):
                            nuevas.append(
                                VentaFalabella(
                                    id_producto=azar.choice(productos),
                                    id_punto_venta=punto,
                                    fecha_venta=dia,
                                    cantidad_vendida=azar.randint(1, 4),
                                )
                            )
            VentaFalabella.objects.bulk_create(nuevas)
            creadas = len(nuevas)

        # Una meta por tienda × producto en cada mes, cerca de lo que se vende:
        # así el tablero muestra cumplimientos por encima y por debajo de 100%.
        azar = random.Random(91)
        inventarios = metas = 0
        for punto in puntos:
            for producto in productos:
                _, nuevo = InventarioFalabella.objects.get_or_create(
                    id_producto=producto,
                    id_punto_venta=punto,
                    defaults={'cantidad_inventario': azar.randint(0, 30)},
                )
                inventarios += nuevo
                for inicio in meses:
                    _, nueva = MetaComercialFalabella.objects.get_or_create(
                        id_producto=producto,
                        id_punto_venta=punto,
                        fecha_meta=inicio,
                        defaults={'meta_cantidad': azar.randint(4, 12)},
                    )
                    metas += nueva

        self.stdout.write(
            self.style.SUCCESS(
                f'{len(PUNTOS)} tienda(s) Falabella, {len(PRODUCTOS)} producto(s), '
                f'{creadas} venta(s) nuevas, {inventarios} registro(s) de inventario y '
                f'{metas} meta(s) nuevas.'
            )
        )
