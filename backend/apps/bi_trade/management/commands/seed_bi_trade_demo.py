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

from apps.bi_trade.models import Materiales, Producto, PuntoVenta, Regional, Venta

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
        if options['limpiar']:
            Venta.objects.all().delete()
            Producto.objects.filter(id_producto__in=[p[0] for p in PRODUCTOS]).delete()
            PuntoVenta.objects.filter(id_punto_venta__in=[p[0] for p in PUNTOS]).delete()
            self.stdout.write(self.style.WARNING('Datos de ejemplo anteriores borrados.'))

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

        puntos = list(PuntoVenta.objects.all())
        productos = list(Producto.objects.all())

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

        self.stdout.write(
            self.style.SUCCESS(
                f'{len(PUNTOS)} punto(s) de venta, {len(PRODUCTOS)} producto(s) y '
                f'{creadas or Venta.objects.count()} venta(s) en la base.'
            )
        )
