"""
BI Trade Marketing: puntos de venta, productos y ventas.

Los nombres de campo van tal como los definió el negocio (`id_punto_venta`,
`nombre_pdv`, …) porque son los mismos de la fuente de datos de trade; no se
traducen para que un archivo del BI se pueda cargar sin renombrar columnas.
"""
from django.core.validators import MaxValueValidator
from django.db import models

from apps.core.models import TimeStampedModel

# Tope de los precios: cien millones, sin decimales.
PRECIO_MAXIMO = 100_000_000


class Regional(models.TextChoices):
    ZONA_SUR = 'Zona Sur', 'Zona Sur'
    ZONA_NORTE = 'Zona Norte', 'Zona Norte'
    PLAZA_CLARO = 'Plaza Claro', 'Plaza Claro'
    NACIONAL = 'Nacional', 'Nacional'


class Materiales(models.TextChoices):
    TODOS = 'Todos los materiales', 'Todos los materiales'
    INCOMPLETOS = 'Sin todos los materiales', 'Sin todos los materiales'


class PuntoVenta(TimeStampedModel):
    """Punto de venta. Su código viene del negocio, no lo genera la base."""

    id_punto_venta = models.CharField('código del punto de venta', max_length=60, primary_key=True)
    nombre_pdv = models.CharField('nombre del punto de venta', max_length=100)
    regional = models.CharField(  # noqa: DJ001 — nulable a propósito: "sin dato" ≠ ""
        'regional', max_length=100, choices=Regional.choices, null=True, blank=True
    )
    materiales = models.CharField(  # noqa: DJ001 — nulable a propósito: "sin dato" ≠ ""
        'materiales', max_length=100, choices=Materiales.choices, null=True, blank=True
    )

    class Meta:
        db_table = 'bi_trade_puntos_venta'
        verbose_name = 'punto de venta'
        verbose_name_plural = 'puntos de venta'
        ordering = ('nombre_pdv',)

    def __str__(self) -> str:
        return f'{self.id_punto_venta} · {self.nombre_pdv}'


class Producto(TimeStampedModel):
    """Producto del catálogo, con su precio en Claro y en Coltrade."""

    id_producto = models.CharField('código del producto', max_length=60, primary_key=True)
    nombre_producto = models.CharField('nombre del producto', max_length=60)
    marca = models.CharField('marca', max_length=60)
    precio_venta_claro = models.PositiveIntegerField(
        'precio de venta Claro', validators=[MaxValueValidator(PRECIO_MAXIMO)]
    )
    precio_venta_coltrade = models.PositiveIntegerField(
        'precio de venta Coltrade', validators=[MaxValueValidator(PRECIO_MAXIMO)]
    )
    puntaje = models.IntegerField('puntaje', null=True, blank=True)

    class Meta:
        db_table = 'bi_trade_productos'
        verbose_name = 'producto'
        verbose_name_plural = 'productos'
        ordering = ('nombre_producto',)

    def __str__(self) -> str:
        return f'{self.id_producto} · {self.nombre_producto}'


class Venta(TimeStampedModel):
    """Una venta: qué producto, en qué punto, cuándo y cuántas unidades."""

    id_venta = models.AutoField('id de la venta', primary_key=True)
    # `db_column` mantiene el nombre del negocio en la tabla: sin él Django
    # crearía la columna como `id_producto_id`.
    id_producto = models.ForeignKey(
        Producto,
        on_delete=models.PROTECT,
        db_column='id_producto',
        related_name='ventas',
        verbose_name='producto',
    )
    id_punto_venta = models.ForeignKey(
        PuntoVenta,
        on_delete=models.PROTECT,
        db_column='id_punto_venta',
        related_name='ventas',
        verbose_name='punto de venta',
    )
    fecha_venta = models.DateField('fecha de la venta')
    cantidad_vendida = models.PositiveIntegerField('cantidad vendida')

    class Meta:
        db_table = 'bi_trade_ventas'
        verbose_name = 'venta'
        verbose_name_plural = 'ventas'
        ordering = ('-fecha_venta', '-id_venta')

    def __str__(self) -> str:
        return f'{self.fecha_venta} · {self.id_producto_id} × {self.cantidad_vendida}'

    @property
    def total_coltrade(self) -> int:
        """Lo que factura la venta al precio Coltrade."""
        return self.cantidad_vendida * self.id_producto.precio_venta_coltrade
