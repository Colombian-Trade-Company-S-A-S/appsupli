"""
BI Trade Marketing: puntos de venta, productos y ventas.

Los nombres de campo van tal como los definió el negocio (`id_punto_venta`,
`nombre_pdv`, …) porque son los mismos de la fuente de datos de trade; no se
traducen para que un archivo del BI se pueda cargar sin renombrar columnas.
"""
from django.conf import settings
from django.core.validators import MaxValueValidator
from django.db import models
from django.db.models import F, Value
from django.db.models.functions import Coalesce

from apps.core.models import TimeStampedModel

# Tope de los precios: cien millones, sin decimales.
PRECIO_MAXIMO = 100_000_000


class Regional(models.TextChoices):
    ZONA_SUR = 'Zona Sur', 'Zona Sur'
    ZONA_NORTE = 'Zona Norte', 'Zona Norte'
    PLAZA_CLARO = 'Plaza Claro', 'Plaza Claro'
    NACIONAL = 'Nacional', 'Nacional'


class RegionalHc(models.TextChoices):
    """Las regionales de Homecenter. Sin «Plaza Claro», que es un canal de Claro."""

    ZONA_NORTE = 'Zona Norte', 'Zona Norte'
    ZONA_CENTRO = 'Zona Centro', 'Zona Centro'
    ZONA_SUR = 'Zona Sur', 'Zona Sur'
    NACIONAL = 'Nacional', 'Nacional'


class RegionalFalabella(models.TextChoices):
    """Las regionales de Falabella. Sin «Plaza Claro», que es un canal de Claro."""

    ZONA_NORTE = 'Zona Norte', 'Zona Norte'
    ZONA_CENTRO = 'Zona Centro', 'Zona Centro'
    ZONA_SUR = 'Zona Sur', 'Zona Sur'
    NACIONAL = 'Nacional', 'Nacional'


class RegionalTmk(models.TextChoices):
    """Las regionales de Tmk Ecommerce Claro. Sin «Plaza Claro», que es de tiendas físicas."""

    ZONA_NORTE = 'Zona Norte', 'Zona Norte'
    ZONA_CENTRO = 'Zona Centro', 'Zona Centro'
    ZONA_SUR = 'Zona Sur', 'Zona Sur'
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


class Inventario(TimeStampedModel):
    """Existencias de un producto en un punto de venta.

    Es el stock actual, no un histórico: por eso hay una sola fila por
    producto y punto de venta.
    """

    id_inventario = models.AutoField('id de inventario', primary_key=True)
    id_producto = models.ForeignKey(
        Producto,
        on_delete=models.PROTECT,
        db_column='id_producto',
        related_name='inventarios',
        verbose_name='producto',
    )
    id_punto_venta = models.ForeignKey(
        PuntoVenta,
        on_delete=models.PROTECT,
        db_column='id_punto_venta',
        related_name='inventarios',
        verbose_name='punto de venta',
    )
    cantidad_inventario = models.PositiveIntegerField('cantidad en inventario')

    class Meta:
        db_table = 'bi_trade_inventario'
        verbose_name = 'inventario'
        verbose_name_plural = 'inventarios'
        unique_together = ('id_producto', 'id_punto_venta')
        ordering = ('id_punto_venta__nombre_pdv', 'id_producto__nombre_producto')

    def __str__(self) -> str:
        return f'{self.id_punto_venta_id} · {self.id_producto_id} = {self.cantidad_inventario}'


class MetaComercial(TimeStampedModel):
    """Meta de un producto en un punto de venta, en unidades.

    Solo se guardan las unidades: el dinero y los puntos se calculan con el
    precio y el puntaje del producto, igual que el total de una venta. Si se
    guardaran, un cambio de precio dejaría la meta en dinero desactualizada y
    el cumplimiento se mediría contra un valor que ya no existe.

    Se llama `MetaComercial` y no `Meta` porque Django reserva ese nombre para
    la configuración interna de cada modelo. La tabla sí se llama `metas`.
    """

    id_meta = models.AutoField('id de la meta', primary_key=True)
    id_producto = models.ForeignKey(
        Producto,
        on_delete=models.PROTECT,
        db_column='id_producto',
        related_name='metas',
        verbose_name='producto',
    )
    id_punto_venta = models.ForeignKey(
        PuntoVenta,
        on_delete=models.PROTECT,
        db_column='id_punto_venta',
        related_name='metas',
        verbose_name='punto de venta',
    )
    fecha_meta = models.DateField('fecha de la meta')
    meta_cantidad = models.PositiveIntegerField('meta de unidades')

    class Meta:
        db_table = 'bi_trade_metas'
        verbose_name = 'meta'
        verbose_name_plural = 'metas'
        # La fecha entra en la llave: sin ella solo cabría una meta por
        # producto y punto, y no se podría medir un periodo contra otro.
        unique_together = ('id_producto', 'id_punto_venta', 'fecha_meta')
        ordering = ('-fecha_meta', 'id_punto_venta__nombre_pdv', 'id_producto__nombre_producto')

    def __str__(self) -> str:
        return (
            f'{self.id_punto_venta_id} · {self.id_producto_id} · {self.fecha_meta} '
            f'→ {self.meta_cantidad} u.'
        )

    @property
    def meta_dinero(self) -> int:
        """La meta en pesos, al precio Coltrade del producto."""
        return self.meta_cantidad * self.id_producto.precio_venta_coltrade

    @property
    def meta_puntos(self) -> int:
        """La meta en puntos. El puntaje es nulable: sin él, no hay puntos."""
        return self.meta_cantidad * (self.id_producto.puntaje or 0)


def anotaciones_meta(con_puntos: bool = True) -> dict:
    """
    La meta en dinero y en puntos, calculadas en la base.

    Con `con_puntos=False` solo va el dinero: es para los canales que no
    miden en puntos, cuyos productos no tienen puntaje.

    Las propiedades del modelo sirven para una fila; esto sirve para filtrar,
    ordenar, sumar y exportar sin traer las metas a Python.

    El sufijo `_meta` en los alias no es adorno: un alias de `annotate` que se
    llame igual que uno de `aggregate` hace que Django lo resuelva contra sí
    mismo y devuelva cero sin avisar.
    """
    anotaciones = {'dinero_meta': F('meta_cantidad') * F('id_producto__precio_venta_coltrade')}
    if con_puntos:
        anotaciones['puntos_meta'] = F('meta_cantidad') * Coalesce('id_producto__puntaje', Value(0))
    return anotaciones


class Campana(TimeStampedModel):
    """
    Una campaña de tickets: el concurso que premia cumplir la meta diaria.

    Las reglas son datos y no código porque cambian en cada campaña: las
    fechas, cuántas ventas vale un ticket, qué productos dan doble y cuántas
    ventas totales hay que hacer para entrar al sorteo. Dejarlas fijas en el
    programa obligaría a un despliegue cada mes.

    Los productos que dan premio tampoco se deducen del nombre ni de la marca:
    se eligen a mano, porque «Bluelight» o «cargador» son categorías del
    concurso, no del catálogo.
    """

    id_campana = models.AutoField('id de la campaña', primary_key=True)
    nombre = models.CharField('nombre', max_length=120)
    desde = models.DateField('vigente desde')
    hasta = models.DateField('vigente hasta')
    activa = models.BooleanField('activa', default=True)

    # ── Condición para participar ──────────────────────────────────────────
    ventas_minimas = models.PositiveIntegerField(
        'ventas totales mínimas', default=120,
        help_text='Unidades vendidas en toda la campaña para poder participar.',
    )
    tickets_minimos = models.PositiveIntegerField(
        'tickets mínimos', default=3,
        help_text='Tickets acumulados para entrar al sorteo.',
    )

    # ── Doble ticket por productos foco ────────────────────────────────────
    productos_foco = models.ManyToManyField(
        Producto, related_name='campanas_foco', blank=True,
        verbose_name='productos que dan doble ticket',
    )
    foco_minimo = models.PositiveIntegerField(
        'mínimo de productos foco al día', default=5,
        help_text='Unidades de producto foco en un día para duplicar los tickets. 0 lo apaga.',
    )

    # ── Bono por venta alta con cargadores ─────────────────────────────────
    productos_cargador = models.ManyToManyField(
        Producto, related_name='campanas_cargador', blank=True,
        verbose_name='productos que cuentan como cargador',
    )
    bono_ventas = models.PositiveIntegerField('ventas del día para el bono', default=20)
    bono_cargadores = models.PositiveIntegerField('cargadores del día para el bono', default=5)
    bono_tickets = models.PositiveIntegerField(
        'tickets del bono', default=3,
        help_text='Se suman a los de la escala, no la reemplazan. 0 lo apaga.',
    )

    class Meta:
        db_table = 'bi_trade_campanas'
        verbose_name = 'campaña'
        verbose_name_plural = 'campañas'
        ordering = ('-desde', 'nombre')

    def __str__(self) -> str:
        return f'{self.nombre} ({self.desde} a {self.hasta})'

    def clean(self):
        from django.core.exceptions import ValidationError

        if self.desde and self.hasta and self.hasta < self.desde:
            raise ValidationError({'hasta': 'La fecha final no puede ser anterior a la inicial.'})


class EscalaTicket(models.Model):
    """
    Cuántos tickets da un día según las unidades vendidas.

    Se aplica la escala más alta que alcance: con 13 ventas y escalas de
    10, 12 y 15, se ganan los tickets de la de 12.
    """

    id_escala = models.AutoField('id de la escala', primary_key=True)
    campana = models.ForeignKey(
        Campana, on_delete=models.CASCADE, related_name='escalas', verbose_name='campaña'
    )
    ventas = models.PositiveIntegerField('ventas del día')
    tickets = models.PositiveIntegerField('tickets que otorga')

    class Meta:
        db_table = 'bi_trade_escalas_ticket'
        verbose_name = 'escala de tickets'
        verbose_name_plural = 'escalas de tickets'
        unique_together = ('campana', 'ventas')
        ordering = ('campana', 'ventas')

    def __str__(self) -> str:
        return f'{self.ventas} ventas = {self.tickets} ticket(s)'


class Acelerador(models.Model):
    """
    Tickets extra por día cumplido cuando el total de la campaña es alto.

    No premia el día sino el acumulado: al pasar el umbral de ventas totales,
    cada día que ya había ganado tickets suma los del acelerador.
    """

    id_acelerador = models.AutoField('id del acelerador', primary_key=True)
    campana = models.ForeignKey(
        Campana, on_delete=models.CASCADE, related_name='aceleradores', verbose_name='campaña'
    )
    ventas_totales = models.PositiveIntegerField('ventas totales de la campaña')
    tickets_por_dia = models.PositiveIntegerField('tickets extra por día cumplido')

    class Meta:
        db_table = 'bi_trade_aceleradores'
        verbose_name = 'acelerador'
        verbose_name_plural = 'aceleradores'
        unique_together = ('campana', 'ventas_totales')
        ordering = ('campana', 'ventas_totales')

    def __str__(self) -> str:
        return f'{self.ventas_totales} ventas = +{self.tickets_por_dia} por día'


class CanalEnlace(models.TextChoices):
    """Qué tablero abre un enlace público."""

    CLARO = 'claro', 'Claro'
    HC = 'hc', 'Homecenter'
    FALABELLA = 'falabella', 'Falabella'
    TMK = 'tmk', 'Tmk Ecommerce Claro'


class EnlacePublico(TimeStampedModel):
    """
    Un enlace para ver el tablero sin cuenta, protegido con contraseña.

    Son dos secretos que no viajan juntos: el `token` va en la URL y dice qué
    enlace es; la contraseña se entrega aparte y prueba que quien lo abre tiene
    permiso. La contraseña se guarda solo como hash —como la de una cuenta—,
    así que se muestra una vez al crear el enlace y nunca más.

    `version` sube cada vez que se regenera la contraseña: los accesos ya
    emitidos llevan la versión con la que se firmaron y dejan de valer.
    """

    id_enlace = models.AutoField('id del enlace', primary_key=True)
    nombre = models.CharField(
        'nombre', max_length=120,
        help_text='Para quién es: «Gerencia Claro», «Regional Norte».',
    )
    token = models.CharField('token de la URL', max_length=64, unique=True)
    clave_hash = models.CharField('hash de la contraseña', max_length=128)
    version = models.PositiveIntegerField('versión de la contraseña', default=1)
    activo = models.BooleanField('activo', default=True)
    expira = models.DateTimeField('expira', null=True, blank=True)
    creado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='enlaces_bi_trade',
        verbose_name='creado por',
    )
    accesos = models.PositiveIntegerField('accesos', default=0)
    ultimo_acceso = models.DateTimeField('último acceso', null=True, blank=True)
    #: Qué tablero abre: Claro, Homecenter, Falabella o Tmk Ecommerce Claro.
    canal = models.CharField(
        'canal', max_length=10, choices=CanalEnlace.choices, default=CanalEnlace.CLARO
    )

    class Meta:
        db_table = 'bi_trade_enlaces_publicos'
        verbose_name = 'enlace público'
        verbose_name_plural = 'enlaces públicos'
        ordering = ('-created_at',)

    def __str__(self) -> str:
        return f'{self.nombre} ({"activo" if self.activo else "revocado"})'

    @property
    def vigente(self) -> bool:
        """Si todavía abre: activo y sin vencer."""
        from django.utils import timezone

        return self.activo and (self.expira is None or self.expira > timezone.now())


# ── Homecenter ─────────────────────────────────────────────────────────────
#
# Homecenter es un canal aparte: sus propias tablas, sin nada compartido con
# Claro. En la base todo lo suyo termina en `_hc`: las tablas y las columnas
# de llave (`id_punto_venta_hc`, `id_producto_hc`, `id_venta_hc`…).
#
# En Python los atributos de llave se llaman igual que en Claro —`id_producto`,
# `id_punto_venta`— y el nombre `_hc` lo pone `db_column`. No es un descuido:
# así el mismo cálculo del tablero, los mismos filtros y las mismas pantallas
# sirven a los dos canales, y lo que se corrija en uno queda corregido en el
# otro. Copiar ese código con otros nombres sería tener dos tableros que con
# el tiempo dejan de dar lo mismo.


class PuntoVentaHc(TimeStampedModel):
    """Una tienda Homecenter. Su código viene del negocio, no lo genera la base."""

    id_punto_venta = models.CharField(
        'código del punto de venta',
        max_length=60,
        primary_key=True,
        db_column='id_punto_venta_hc',
    )
    nombre_pdv = models.CharField('nombre del punto de venta', max_length=100)
    regional = models.CharField(  # noqa: DJ001 — nulable a propósito: "sin dato" ≠ ""
        'regional', max_length=100, choices=RegionalHc.choices, null=True, blank=True
    )
    materiales = models.CharField(  # noqa: DJ001 — nulable a propósito: "sin dato" ≠ ""
        'materiales', max_length=100, choices=Materiales.choices, null=True, blank=True
    )

    class Meta:
        db_table = 'bi_trade_puntos_venta_hc'
        verbose_name = 'punto de venta Homecenter'
        verbose_name_plural = 'puntos de venta Homecenter'
        ordering = ('nombre_pdv',)

    def __str__(self) -> str:
        return f'{self.id_punto_venta} · {self.nombre_pdv}'


class ProductoHc(TimeStampedModel):
    """Producto del catálogo Homecenter, con su precio en Homecenter y en Coltrade."""

    id_producto = models.CharField(
        'código del producto', max_length=60, primary_key=True, db_column='id_producto_hc'
    )
    nombre_producto = models.CharField('nombre del producto', max_length=60)
    marca = models.CharField('marca', max_length=60)
    precio_venta_hc = models.PositiveIntegerField(
        'precio de venta Homecenter', validators=[MaxValueValidator(PRECIO_MAXIMO)]
    )
    precio_venta_coltrade = models.PositiveIntegerField(
        'precio de venta Coltrade', validators=[MaxValueValidator(PRECIO_MAXIMO)]
    )

    class Meta:
        db_table = 'bi_trade_productos_hc'
        verbose_name = 'producto Homecenter'
        verbose_name_plural = 'productos Homecenter'
        ordering = ('nombre_producto',)

    def __str__(self) -> str:
        return f'{self.id_producto} · {self.nombre_producto}'


class VentaHc(TimeStampedModel):
    """Una venta en una tienda Homecenter."""

    id_venta = models.AutoField('id de la venta', primary_key=True, db_column='id_venta_hc')
    id_producto = models.ForeignKey(
        ProductoHc,
        on_delete=models.PROTECT,
        db_column='id_producto_hc',
        related_name='ventas',
        verbose_name='producto',
    )
    id_punto_venta = models.ForeignKey(
        PuntoVentaHc,
        on_delete=models.PROTECT,
        db_column='id_punto_venta_hc',
        related_name='ventas',
        verbose_name='punto de venta',
    )
    fecha_venta = models.DateField('fecha de la venta')
    cantidad_vendida = models.PositiveIntegerField('cantidad vendida')

    class Meta:
        db_table = 'bi_trade_ventas_hc'
        verbose_name = 'venta Homecenter'
        verbose_name_plural = 'ventas Homecenter'
        ordering = ('-fecha_venta', '-id_venta')

    def __str__(self) -> str:
        return f'{self.fecha_venta} · {self.id_producto_id} × {self.cantidad_vendida}'

    @property
    def total_coltrade(self) -> int:
        """Lo que factura la venta al precio Coltrade."""
        return self.cantidad_vendida * self.id_producto.precio_venta_coltrade


class InventarioHc(TimeStampedModel):
    """Existencias de un producto en una tienda Homecenter: el stock de hoy."""

    id_inventario = models.AutoField(
        'id de inventario', primary_key=True, db_column='id_inventario_hc'
    )
    id_producto = models.ForeignKey(
        ProductoHc,
        on_delete=models.PROTECT,
        db_column='id_producto_hc',
        related_name='inventarios',
        verbose_name='producto',
    )
    id_punto_venta = models.ForeignKey(
        PuntoVentaHc,
        on_delete=models.PROTECT,
        db_column='id_punto_venta_hc',
        related_name='inventarios',
        verbose_name='punto de venta',
    )
    cantidad_inventario = models.PositiveIntegerField('cantidad en inventario')

    class Meta:
        db_table = 'bi_trade_inventario_hc'
        verbose_name = 'inventario Homecenter'
        verbose_name_plural = 'inventarios Homecenter'
        unique_together = ('id_producto', 'id_punto_venta')
        ordering = ('id_punto_venta__nombre_pdv', 'id_producto__nombre_producto')

    def __str__(self) -> str:
        return f'{self.id_punto_venta_id} · {self.id_producto_id} = {self.cantidad_inventario}'


class MetaComercialHc(TimeStampedModel):
    """Meta de un producto en una tienda Homecenter, en unidades.

    Igual que en Claro, solo se guardan las unidades: el dinero sale del precio
    Coltrade del producto. Este canal no mide en puntos.
    """

    id_meta = models.AutoField('id de la meta', primary_key=True, db_column='id_meta_hc')
    id_producto = models.ForeignKey(
        ProductoHc,
        on_delete=models.PROTECT,
        db_column='id_producto_hc',
        related_name='metas',
        verbose_name='producto',
    )
    id_punto_venta = models.ForeignKey(
        PuntoVentaHc,
        on_delete=models.PROTECT,
        db_column='id_punto_venta_hc',
        related_name='metas',
        verbose_name='punto de venta',
    )
    fecha_meta = models.DateField('fecha de la meta')
    meta_cantidad = models.PositiveIntegerField('meta de unidades')

    class Meta:
        db_table = 'bi_trade_metas_hc'
        verbose_name = 'meta Homecenter'
        verbose_name_plural = 'metas Homecenter'
        unique_together = ('id_producto', 'id_punto_venta', 'fecha_meta')
        ordering = ('-fecha_meta', 'id_punto_venta__nombre_pdv', 'id_producto__nombre_producto')

    def __str__(self) -> str:
        return (
            f'{self.id_punto_venta_id} · {self.id_producto_id} · {self.fecha_meta} '
            f'→ {self.meta_cantidad} u.'
        )

    @property
    def meta_dinero(self) -> int:
        return self.meta_cantidad * self.id_producto.precio_venta_coltrade


# ── Falabella ──────────────────────────────────────────────────────────────
#
# Otro canal aparte, igual que Homecenter: sus propias tablas, sin nada
# compartido con los demás. En la base todo lo suyo termina en `_falabella`:
# las tablas y las columnas de llave (`id_punto_venta_falabella`,
# `id_producto_falabella`, `id_venta_falabella`…).
#
# Los atributos de Python se llaman igual que en Claro por la misma razón que
# en Homecenter: un solo cálculo, unos solos filtros y unas solas pantallas.


class PuntoVentaFalabella(TimeStampedModel):
    """Una tienda Falabella. Su código viene del negocio, no lo genera la base."""

    id_punto_venta = models.CharField(
        'código del punto de venta',
        max_length=60,
        primary_key=True,
        db_column='id_punto_venta_falabella',
    )
    nombre_pdv = models.CharField('nombre del punto de venta', max_length=100)
    regional = models.CharField(  # noqa: DJ001 — nulable a propósito: "sin dato" ≠ ""
        'regional', max_length=100, choices=RegionalFalabella.choices, null=True, blank=True
    )
    materiales = models.CharField(  # noqa: DJ001 — nulable a propósito: "sin dato" ≠ ""
        'materiales', max_length=100, choices=Materiales.choices, null=True, blank=True
    )

    class Meta:
        db_table = 'bi_trade_puntos_venta_falabella'
        verbose_name = 'punto de venta Falabella'
        verbose_name_plural = 'puntos de venta Falabella'
        ordering = ('nombre_pdv',)

    def __str__(self) -> str:
        return f'{self.id_punto_venta} · {self.nombre_pdv}'


class ProductoFalabella(TimeStampedModel):
    """Producto del catálogo Falabella, con su precio en Falabella y en Coltrade."""

    id_producto = models.CharField(
        'código del producto', max_length=60, primary_key=True, db_column='id_producto_falabella'
    )
    nombre_producto = models.CharField('nombre del producto', max_length=60)
    marca = models.CharField('marca', max_length=60)
    precio_venta_falabella = models.PositiveIntegerField(
        'precio de venta Falabella', validators=[MaxValueValidator(PRECIO_MAXIMO)]
    )
    precio_venta_coltrade = models.PositiveIntegerField(
        'precio de venta Coltrade', validators=[MaxValueValidator(PRECIO_MAXIMO)]
    )

    class Meta:
        db_table = 'bi_trade_productos_falabella'
        verbose_name = 'producto Falabella'
        verbose_name_plural = 'productos Falabella'
        ordering = ('nombre_producto',)

    def __str__(self) -> str:
        return f'{self.id_producto} · {self.nombre_producto}'


class VentaFalabella(TimeStampedModel):
    """Una venta en una tienda Falabella."""

    id_venta = models.AutoField(
        'id de la venta', primary_key=True, db_column='id_venta_falabella'
    )
    id_producto = models.ForeignKey(
        ProductoFalabella,
        on_delete=models.PROTECT,
        db_column='id_producto_falabella',
        related_name='ventas',
        verbose_name='producto',
    )
    id_punto_venta = models.ForeignKey(
        PuntoVentaFalabella,
        on_delete=models.PROTECT,
        db_column='id_punto_venta_falabella',
        related_name='ventas',
        verbose_name='punto de venta',
    )
    fecha_venta = models.DateField('fecha de la venta')
    cantidad_vendida = models.PositiveIntegerField('cantidad vendida')

    class Meta:
        db_table = 'bi_trade_ventas_falabella'
        verbose_name = 'venta Falabella'
        verbose_name_plural = 'ventas Falabella'
        ordering = ('-fecha_venta', '-id_venta')

    def __str__(self) -> str:
        return f'{self.fecha_venta} · {self.id_producto_id} × {self.cantidad_vendida}'

    @property
    def total_coltrade(self) -> int:
        """Lo que factura la venta al precio Coltrade."""
        return self.cantidad_vendida * self.id_producto.precio_venta_coltrade


class InventarioFalabella(TimeStampedModel):
    """Existencias de un producto en una tienda Falabella: el stock de hoy."""

    id_inventario = models.AutoField(
        'id de inventario', primary_key=True, db_column='id_inventario_falabella'
    )
    id_producto = models.ForeignKey(
        ProductoFalabella,
        on_delete=models.PROTECT,
        db_column='id_producto_falabella',
        related_name='inventarios',
        verbose_name='producto',
    )
    id_punto_venta = models.ForeignKey(
        PuntoVentaFalabella,
        on_delete=models.PROTECT,
        db_column='id_punto_venta_falabella',
        related_name='inventarios',
        verbose_name='punto de venta',
    )
    cantidad_inventario = models.PositiveIntegerField('cantidad en inventario')

    class Meta:
        db_table = 'bi_trade_inventario_falabella'
        verbose_name = 'inventario Falabella'
        verbose_name_plural = 'inventarios Falabella'
        unique_together = ('id_producto', 'id_punto_venta')
        ordering = ('id_punto_venta__nombre_pdv', 'id_producto__nombre_producto')

    def __str__(self) -> str:
        return f'{self.id_punto_venta_id} · {self.id_producto_id} = {self.cantidad_inventario}'


class MetaComercialFalabella(TimeStampedModel):
    """Meta de un producto en una tienda Falabella, en unidades.

    Igual que en Claro, solo se guardan las unidades: el dinero sale del precio
    Coltrade del producto. Este canal no mide en puntos.
    """

    id_meta = models.AutoField('id de la meta', primary_key=True, db_column='id_meta_falabella')
    id_producto = models.ForeignKey(
        ProductoFalabella,
        on_delete=models.PROTECT,
        db_column='id_producto_falabella',
        related_name='metas',
        verbose_name='producto',
    )
    id_punto_venta = models.ForeignKey(
        PuntoVentaFalabella,
        on_delete=models.PROTECT,
        db_column='id_punto_venta_falabella',
        related_name='metas',
        verbose_name='punto de venta',
    )
    fecha_meta = models.DateField('fecha de la meta')
    meta_cantidad = models.PositiveIntegerField('meta de unidades')

    class Meta:
        db_table = 'bi_trade_metas_falabella'
        verbose_name = 'meta Falabella'
        verbose_name_plural = 'metas Falabella'
        unique_together = ('id_producto', 'id_punto_venta', 'fecha_meta')
        ordering = ('-fecha_meta', 'id_punto_venta__nombre_pdv', 'id_producto__nombre_producto')

    def __str__(self) -> str:
        return (
            f'{self.id_punto_venta_id} · {self.id_producto_id} · {self.fecha_meta} '
            f'→ {self.meta_cantidad} u.'
        )

    @property
    def meta_dinero(self) -> int:
        return self.meta_cantidad * self.id_producto.precio_venta_coltrade


# ── Tmk Ecommerce Claro ──────────────────────────────────────────────────────────────
#
# Otro canal aparte, igual que Homecenter: sus propias tablas, sin nada
# compartido con los demás. En la base todo lo suyo termina en `_tmk`:
# las tablas y las columnas de llave (`id_punto_venta_tmk`,
# `id_producto_tmk`, `id_venta_tmk`…).
#
# Los atributos de Python se llaman igual que en Claro por la misma razón que
# en Homecenter: un solo cálculo, unos solos filtros y unas solas pantallas.


class PuntoVentaTmk(TimeStampedModel):
    """Una tienda Tmk Ecommerce Claro. Su código viene del negocio, no lo genera la base."""

    id_punto_venta = models.CharField(
        'código del punto de venta',
        max_length=60,
        primary_key=True,
        db_column='id_punto_venta_tmk',
    )
    nombre_pdv = models.CharField('nombre del punto de venta', max_length=100)
    regional = models.CharField(  # noqa: DJ001 — nulable a propósito: "sin dato" ≠ ""
        'regional', max_length=100, choices=RegionalTmk.choices, null=True, blank=True
    )
    materiales = models.CharField(  # noqa: DJ001 — nulable a propósito: "sin dato" ≠ ""
        'materiales', max_length=100, choices=Materiales.choices, null=True, blank=True
    )

    class Meta:
        db_table = 'bi_trade_puntos_venta_tmk'
        verbose_name = 'punto de venta Tmk Ecommerce Claro'
        verbose_name_plural = 'puntos de venta Tmk Ecommerce Claro'
        ordering = ('nombre_pdv',)

    def __str__(self) -> str:
        return f'{self.id_punto_venta} · {self.nombre_pdv}'


class ProductoTmk(TimeStampedModel):
    """Producto del catálogo Tmk Ecommerce Claro, con su precio en Tmk y en Coltrade."""

    id_producto = models.CharField(
        'código del producto', max_length=60, primary_key=True, db_column='id_producto_tmk'
    )
    nombre_producto = models.CharField('nombre del producto', max_length=60)
    marca = models.CharField('marca', max_length=60)
    precio_venta_tmk = models.PositiveIntegerField(
        'precio de venta Tmk Ecommerce Claro', validators=[MaxValueValidator(PRECIO_MAXIMO)]
    )
    precio_venta_coltrade = models.PositiveIntegerField(
        'precio de venta Coltrade', validators=[MaxValueValidator(PRECIO_MAXIMO)]
    )

    class Meta:
        db_table = 'bi_trade_productos_tmk'
        verbose_name = 'producto Tmk Ecommerce Claro'
        verbose_name_plural = 'productos Tmk Ecommerce Claro'
        ordering = ('nombre_producto',)

    def __str__(self) -> str:
        return f'{self.id_producto} · {self.nombre_producto}'


class VentaTmk(TimeStampedModel):
    """Una venta en una tienda Tmk Ecommerce Claro."""

    id_venta = models.AutoField(
        'id de la venta', primary_key=True, db_column='id_venta_tmk'
    )
    id_producto = models.ForeignKey(
        ProductoTmk,
        on_delete=models.PROTECT,
        db_column='id_producto_tmk',
        related_name='ventas',
        verbose_name='producto',
    )
    id_punto_venta = models.ForeignKey(
        PuntoVentaTmk,
        on_delete=models.PROTECT,
        db_column='id_punto_venta_tmk',
        related_name='ventas',
        verbose_name='punto de venta',
    )
    fecha_venta = models.DateField('fecha de la venta')
    cantidad_vendida = models.PositiveIntegerField('cantidad vendida')

    class Meta:
        db_table = 'bi_trade_ventas_tmk'
        verbose_name = 'venta Tmk Ecommerce Claro'
        verbose_name_plural = 'ventas Tmk Ecommerce Claro'
        ordering = ('-fecha_venta', '-id_venta')

    def __str__(self) -> str:
        return f'{self.fecha_venta} · {self.id_producto_id} × {self.cantidad_vendida}'

    @property
    def total_coltrade(self) -> int:
        """Lo que factura la venta al precio Coltrade."""
        return self.cantidad_vendida * self.id_producto.precio_venta_coltrade


class InventarioTmk(TimeStampedModel):
    """Existencias de un producto en una tienda Tmk Ecommerce Claro: el stock de hoy."""

    id_inventario = models.AutoField(
        'id de inventario', primary_key=True, db_column='id_inventario_tmk'
    )
    id_producto = models.ForeignKey(
        ProductoTmk,
        on_delete=models.PROTECT,
        db_column='id_producto_tmk',
        related_name='inventarios',
        verbose_name='producto',
    )
    id_punto_venta = models.ForeignKey(
        PuntoVentaTmk,
        on_delete=models.PROTECT,
        db_column='id_punto_venta_tmk',
        related_name='inventarios',
        verbose_name='punto de venta',
    )
    cantidad_inventario = models.PositiveIntegerField('cantidad en inventario')

    class Meta:
        db_table = 'bi_trade_inventario_tmk'
        verbose_name = 'inventario Tmk Ecommerce Claro'
        verbose_name_plural = 'inventarios Tmk Ecommerce Claro'
        unique_together = ('id_producto', 'id_punto_venta')
        ordering = ('id_punto_venta__nombre_pdv', 'id_producto__nombre_producto')

    def __str__(self) -> str:
        return f'{self.id_punto_venta_id} · {self.id_producto_id} = {self.cantidad_inventario}'


class MetaComercialTmk(TimeStampedModel):
    """Meta de un producto en una tienda Tmk Ecommerce Claro, en unidades.

    Igual que en Claro, solo se guardan las unidades: el dinero sale del precio
    Coltrade del producto. Este canal no mide en puntos.
    """

    id_meta = models.AutoField('id de la meta', primary_key=True, db_column='id_meta_tmk')
    id_producto = models.ForeignKey(
        ProductoTmk,
        on_delete=models.PROTECT,
        db_column='id_producto_tmk',
        related_name='metas',
        verbose_name='producto',
    )
    id_punto_venta = models.ForeignKey(
        PuntoVentaTmk,
        on_delete=models.PROTECT,
        db_column='id_punto_venta_tmk',
        related_name='metas',
        verbose_name='punto de venta',
    )
    fecha_meta = models.DateField('fecha de la meta')
    meta_cantidad = models.PositiveIntegerField('meta de unidades')

    class Meta:
        db_table = 'bi_trade_metas_tmk'
        verbose_name = 'meta Tmk Ecommerce Claro'
        verbose_name_plural = 'metas Tmk Ecommerce Claro'
        unique_together = ('id_producto', 'id_punto_venta', 'fecha_meta')
        ordering = ('-fecha_meta', 'id_punto_venta__nombre_pdv', 'id_producto__nombre_producto')

    def __str__(self) -> str:
        return (
            f'{self.id_punto_venta_id} · {self.id_producto_id} · {self.fecha_meta} '
            f'→ {self.meta_cantidad} u.'
        )

    @property
    def meta_dinero(self) -> int:
        return self.meta_cantidad * self.id_producto.precio_venta_coltrade
