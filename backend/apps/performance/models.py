"""
Objetivos y KPIs de Supli Performance.

El modelo es el de la especificación técnica INT-TEC-ET-001 §4, traído a las
convenciones de este proyecto: en vez de un esquema aparte con DDL a mano, son
modelos de Django en la misma base, con migraciones y con `TimeStampedModel`
para la auditoría de fechas.

    Periodo    → el mes de medición y su estado (definición → medición → cerrado)
    Objetivo   → lo que se define para una persona en un mes (Fase 1)
    Resultado  → lo ejecutado y su % de cumplimiento (Fase 2, modelado desde ya)
    Evidencia  → el soporte de ese resultado (Fase 2, modelado desde ya)

La jerarquía no se reconstruye: quién es jefe de quién sale de `User.manager`,
igual que en el módulo de valoración.
"""
from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models

from apps.core.models import TimeStampedModel


class EstadoPeriodo(models.TextChoices):
    DEFINICION = 'definicion', 'En definición'
    EN_MEDICION = 'en_medicion', 'En medición'
    CERRADO = 'cerrado', 'Cerrado'


class TipoMedicion(models.TextChoices):
    """Cómo se calcula el cumplimiento. Agregar uno es agregar un caso al motor."""

    BINARIO = 'binario', 'Binario — cumple / no cumple'
    PROPORCIONAL = 'proporcional', 'Proporcional — logrado ÷ meta'
    PROPORCIONAL_INVERSO = 'proporcional_inverso', 'Proporcional inverso — menos es mejor'
    FORMULA = 'formula', 'Fórmula personalizada'


class Unidad(models.TextChoices):
    UNIDADES = 'unidades', 'Unidades'
    PESOS = 'peso', '$ (pesos)'
    PORCENTAJE = 'porcentaje', '%'
    DIAS = 'dias', 'Días'
    SI_NO = 'si_no', 'Sí / No'


class EstadoObjetivo(models.TextChoices):
    BORRADOR = 'borrador', 'Borrador'
    ACTIVO = 'activo', 'Activo'
    CONGELADO = 'congelado', 'Congelado'


class EstadoValidacion(models.TextChoices):
    PENDIENTE = 'pendiente', 'Pendiente'
    VALIDADO = 'validado', 'Validado'
    RECHAZADO = 'rechazado', 'Rechazado'


class TipoEvidencia(models.TextChoices):
    ARCHIVO = 'archivo', 'Archivo'
    LINK = 'link', 'Enlace'
    ACTA = 'acta', 'Acta'
    REPORTE = 'reporte', 'Reporte'
    PROYECTO = 'proyecto', 'Proyecto'
    BASE_DATOS = 'base_datos', 'Base de datos'
    OTRO = 'otro', 'Otro'


#: Tope de objetivos por persona y mes (regla de negocio 2 de la especificación).
MAXIMO_OBJETIVOS = 6

#: La ponderación de una persona en un mes debe sumar esto para poder medir.
PONDERACION_COMPLETA = 100


class Periodo(TimeStampedModel):
    """
    El mes de medición.

    Controla el abrir y el congelar: mientras está en definición se editan los
    objetivos; al pasar a medición quedan congelados y ya no se tocan.
    """

    periodo = models.DateField('periodo', unique=True, help_text='Primer día del mes.')
    estado = models.CharField(
        'estado', max_length=20, choices=EstadoPeriodo.choices, default=EstadoPeriodo.DEFINICION
    )
    abierto_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='periodos_abiertos',
        verbose_name='abierto por',
    )
    fecha_apertura = models.DateTimeField('fecha de apertura', null=True, blank=True)
    fecha_cierre = models.DateTimeField('fecha de cierre', null=True, blank=True)

    class Meta:
        verbose_name = 'periodo'
        verbose_name_plural = 'periodos'
        ordering = ('-periodo',)

    def __str__(self) -> str:
        return self.periodo.strftime('%Y-%m')

    @property
    def en_definicion(self) -> bool:
        return self.estado == EstadoPeriodo.DEFINICION


class Objetivo(TimeStampedModel):
    """
    Un objetivo con su KPI, para una persona y un mes.

    Objetivo y KPI viven en la misma fila, como en la especificación y en el
    mockup aprobado: un objetivo se mide con un indicador. El peso pondera la
    fila, y la suma de los pesos de una persona en un mes debe dar 100.
    """

    colaborador = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='objetivos',
        verbose_name='colaborador',
    )
    registrado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='objetivos_registrados',
        verbose_name='registrado por',
        help_text='El jefe o People: el colaborador nunca define su objetivo.',
    )
    periodo = models.DateField('periodo', help_text='Primer día del mes.')
    objetivo = models.TextField('objetivo')
    kpi = models.TextField('KPI / indicador')
    peso = models.DecimalField(
        'peso (%)', max_digits=5, decimal_places=2, validators=[MinValueValidator(0.01)]
    )
    tipo_medicion = models.CharField(
        'tipo de medición', max_length=30, choices=TipoMedicion.choices
    )
    unidad = models.CharField('unidad', max_length=20, choices=Unidad.choices, blank=True)
    meta_valor = models.DecimalField(
        'meta', max_digits=14, decimal_places=2, null=True, blank=True,
        help_text='Obligatoria salvo en los objetivos binarios.',
    )
    umbral_cumplimiento = models.DecimalField(
        'umbral de cumplimiento', max_digits=14, decimal_places=2, null=True, blank=True,
        help_text='Desde dónde cuenta como cumplido. Alimenta el semáforo.',
    )
    permite_sobrecumplimiento = models.BooleanField('permite superar el 100%', default=False)
    tope_cumplimiento = models.DecimalField(
        'tope de cumplimiento', max_digits=6, decimal_places=2, default=100,
        help_text='Se aplica cuando el objetivo no permite sobrecumplimiento.',
    )
    formula = models.TextField(
        'fórmula', blank=True, help_text='Solo cuando el tipo de medición es «fórmula».'
    )
    fuente_datos = models.TextField('fuente de los datos', blank=True)
    responsable_resultado = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='objetivos_a_cargo',
        verbose_name='responsable del resultado',
        help_text='Por defecto el colaborador; para asesores y promotores, su Trade Leader.',
    )
    estado = models.CharField(
        'estado', max_length=20, choices=EstadoObjetivo.choices, default=EstadoObjetivo.BORRADOR
    )

    class Meta:
        verbose_name = 'objetivo'
        verbose_name_plural = 'objetivos'
        ordering = ('-periodo', 'colaborador_id', '-peso')
        indexes = [models.Index(fields=('colaborador', 'periodo'), name='ix_obj_colab_periodo')]

    def __str__(self) -> str:
        return f'{self.objetivo[:40]} · {self.periodo:%Y-%m}'

    @property
    def congelado(self) -> bool:
        return self.estado == EstadoObjetivo.CONGELADO


class Resultado(TimeStampedModel):
    """
    Lo ejecutado del objetivo. **Fase 2**: la tabla queda lista desde ahora.

    `porcentaje_cumplimiento` nunca se digita: lo calcula el motor de cálculo a
    partir del tipo de medición del objetivo.
    """

    objetivo = models.OneToOneField(
        Objetivo, on_delete=models.CASCADE, related_name='resultado', verbose_name='objetivo'
    )
    resultado_ejecutado = models.DecimalField(
        'resultado ejecutado', max_digits=14, decimal_places=2, null=True, blank=True
    )
    porcentaje_cumplimiento = models.DecimalField(
        '% de cumplimiento', max_digits=8, decimal_places=2, null=True, blank=True
    )
    cargado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='resultados_cargados',
        verbose_name='cargado por',
    )
    fecha_carga = models.DateTimeField('fecha de carga', null=True, blank=True)
    estado_validacion = models.CharField(
        'estado de validación',
        max_length=20,
        choices=EstadoValidacion.choices,
        default=EstadoValidacion.PENDIENTE,
    )
    validado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='resultados_validados',
        verbose_name='validado por',
    )
    fecha_validacion = models.DateTimeField('fecha de validación', null=True, blank=True)
    observacion = models.TextField('observación', blank=True)

    class Meta:
        verbose_name = 'resultado'
        verbose_name_plural = 'resultados'

    def __str__(self) -> str:
        return f'Resultado de {self.objetivo_id}'


class Evidencia(TimeStampedModel):
    """
    El soporte del resultado. **Fase 2**: la tabla queda lista desde ahora.

    Por ahora es un enlace (`link_soporte`), como define la especificación: el
    disco de Render es efímero y los soportes de la compañía ya viven en Drive
    y SharePoint.
    """

    resultado = models.ForeignKey(
        Resultado, on_delete=models.CASCADE, related_name='evidencias', verbose_name='resultado'
    )
    tipo = models.CharField('tipo', max_length=20, choices=TipoEvidencia.choices, blank=True)
    nombre = models.CharField('nombre', max_length=200, blank=True)
    link_soporte = models.URLField('enlace del soporte', max_length=500, blank=True)

    class Meta:
        verbose_name = 'evidencia'
        verbose_name_plural = 'evidencias'
        ordering = ('-created_at',)

    def __str__(self) -> str:
        return self.nombre or self.link_soporte
