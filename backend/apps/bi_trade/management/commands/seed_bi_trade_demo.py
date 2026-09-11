"""
Carga datos de ejemplo en BI Trade Marketing para poder ver el tablero.

    python manage.py seed_bi_trade_demo
    python manage.py seed_bi_trade_demo --limpiar    # borra lo anterior y recarga

Es idempotente. Son datos de prueba: se pueden borrar sin miedo desde el CRUD
o con `--limpiar`.
"""
import random
from datetime import date, timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q

from apps.bi_trade.models import (
    Inventario,
    Materiales,
    MetaComercial,
    Producto,
    PuntoVenta,
    Regional,
    Venta,
)

PUNTOS = [
    ('PDV-001', 'Claro Centro Mayor', Regional.PLAZA_CLARO, Materiales.TODOS),
    ('PDV-002', 'Claro Unicentro Bogotá', Regional.ZONA_NORTE, Materiales.TODOS),
    ('PDV-003', 'Claro Parque Arboleda', Regional.ZONA_SUR, Materiales.INCOMPLETOS),
    ('PDV-004', 'Claro Buenavista Barranquilla', Regional.ZONA_NORTE, Materiales.TODOS),
    ('PDV-005', 'Claro Jardín Plaza Cali', Regional.ZONA_SUR, Materiales.INCOMPLETOS),
    ('PDV-006', 'Claro Nacional Ecommerce', Regional.NACIONAL, Materiales.TODOS),
]

PRODUCTOS = [
    ('SKU-1001', 'Samsung Galaxy A55', 'Samsung', 1_299_900, 1_189_900, 90),
    ('SKU-1002', 'Samsung Galaxy S24', 'Samsung', 4_499_900, 4_149_900, 98),
    ('SKU-2001', 'iPhone 15', 'Apple', 5_299_900, 4_999_900, 99),
    ('SKU-2002', 'iPhone SE', 'Apple', 2_199_900, 2_049_900, 80),
    ('SKU-3001', 'Xiaomi Redmi Note 13', 'Xiaomi', 899_900, 819_900, 75),
    ('SKU-3002', 'Xiaomi Poco X6', 'Xiaomi', 1_149_900, 1_059_900, 82),
    ('SKU-4001', 'Motorola Moto G84', 'Motorola', 949_900, 869_900, 70),
]


class Command(BaseCommand):
    help = 'Carga puntos de venta, productos y ventas de ejemplo en BI Trade.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--limpiar',
            action='store_true',
            help='Borra los datos de ejemplo antes de volver a cargarlos.',
        )
        parser.add_argument(
            '--ventas',
            type=int,
            default=120,
            help='Cuántas ventas generar (por defecto 120).',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        codigos_pdv = [p[0] for p in PUNTOS]
        codigos_producto = [p[0] for p in PRODUCTOS]

        if options['limpiar']:
            # Solo lo que sembró este comando. Antes borraba TODAS las ventas,
            # el inventario y las metas, así que se llevaba por delante los
            # datos reales que alguien hubiera importado.
            de_demo = Q(id_producto__in=codigos_producto) | Q(id_punto_venta__in=codigos_pdv)
            borradas = Venta.objects.filter(de_demo).delete()[0]
            borrados = Inventario.objects.filter(de_demo).delete()[0]
            borradas_metas = MetaComercial.objects.filter(de_demo).delete()[0]
            Producto.objects.filter(id_producto__in=codigos_producto).delete()
            PuntoVenta.objects.filter(id_punto_venta__in=codigos_pdv).delete()
            self.stdout.write(
                self.style.WARNING(
                    f'Datos de ejemplo borrados: {borradas} venta(s), {borrados} de '
                    f'inventario y {borradas_metas} meta(s).'
                )
            )

        for codigo, nombre, regional, materiales in PUNTOS:
            PuntoVenta.objects.update_or_create(
                id_punto_venta=codigo,
                defaults={
                    'nombre_pdv': nombre,
                    'regional': regional,
                    'materiales': materiales,
                },
            )

        for codigo, nombre, marca, claro, coltrade, puntaje in PRODUCTOS:
            Producto.objects.update_or_create(
                id_producto=codigo,
                defaults={
                    'nombre_producto': nombre,
                    'marca': marca,
                    'precio_venta_claro': claro,
                    'precio_venta_coltrade': coltrade,
                    'puntaje': puntaje,
                },
            )

        puntos = list(PuntoVenta.objects.filter(id_punto_venta__in=codigos_pdv))
        productos = list(Producto.objects.filter(id_producto__in=codigos_producto))

        creadas = 0
        if not Venta.objects.exists():
            # Semilla fija: dos corridas seguidas dan el mismo tablero, que es
            # lo que uno quiere de unos datos de demostración.
            azar = random.Random(2026)
            hoy = date.today()
            for _ in range(options['ventas']):
                Venta.objects.create(
                    id_producto=azar.choice(productos),
                    id_punto_venta=azar.choice(puntos),
                    fecha_venta=hoy - timedelta(days=azar.randint(0, 179)),
                    cantidad_vendida=azar.randint(1, 12),
                )
                creadas += 1

        # Inventario y metas: una fila por combinación producto × punto de
        # venta, que es justo lo que exige la restricción de unicidad.
        azar = random.Random(77)
        inventarios = metas = 0
        # Las ventas de ejemplo cubren los últimos seis meses: la meta se carga
        # al inicio de ese tramo para que el periodo cuadre con lo vendido.
        inicio_periodo = date.today() - timedelta(days=179)
        for punto in puntos:
            for producto in productos:
                _, nuevo = Inventario.objects.get_or_create(
                    id_producto=producto,
                    id_punto_venta=punto,
                    defaults={'cantidad_inventario': azar.randint(0, 60)},
                )
                inventarios += nuevo

                # La meta se arma sobre lo realmente vendido, con un desvío de
                # ±30%: así el tablero muestra cumplimientos por encima y por
                # debajo del 100%, no todos iguales.
                vendidas = sum(
                    v.cantidad_vendida
                    for v in Venta.objects.filter(id_producto=producto, id_punto_venta=punto)
                )
                objetivo = max(1, round((vendidas or 5) * azar.uniform(0.7, 1.3)))
                _, nueva = MetaComercial.objects.get_or_create(
                    id_producto=producto,
                    id_punto_venta=punto,
                    fecha_meta=inicio_periodo,
                    defaults={
                        'meta_cantidad': objetivo,
                    },
                )
                metas += nueva

        self.stdout.write(
            self.style.SUCCESS(
                f'{len(PUNTOS)} punto(s) de venta, {len(PRODUCTOS)} producto(s), '
                f'{creadas or Venta.objects.count()} venta(s), '
                f'{inventarios or Inventario.objects.count()} registro(s) de inventario y '
                f'{metas or MetaComercial.objects.count()} meta(s) en la base.'
            )
        )
