"""
Ejecución Planner: las tablas del paso 6 de la guía.

    planner_plan          → PlanPlanner          (relación plan–persona)
    planner_bucket        → Deposito             (depósitos de cada plan)
    planner_task_snapshot → Snapshot + TareaSnapshot
    week_result           → ResultadoSemana
    (Hitos de la semana)  → HitoPlanner          (sin validación: decisión 3)
    (trazabilidad)        → TareaMedicion + MovimientoTarea (decisión 2)
    param_set             → Parametros           (versionados por vigencia)
    (auditoría)           → RecalculoPlanner
    data_quality_issue    → IncidenciaCalidad
    sync_run              → Sincronizacion

appSupli solo lee Planner: nada de esto se escribe de vuelta. El plan se
relaciona por su ID, no por su nombre, porque los nombres cambian.
"""

from datetime import date
from decimal import Decimal

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.core.models import TimeStampedModel

PORCENTAJE = [MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('100'))]

#: Desde cuándo rige la primera versión de parámetros.
VIGENCIA_INICIAL = date(2026, 1, 1)


class PlanPlanner(TimeStampedModel):
    """
    Un plan de Planner y la persona a la que pertenece.

    Sale de la URL de Planner de la persona (Gestión de usuarios): no se edita
    aquí. El nombre y el grupo los trae cada lectura.
    """

    plan_id = models.CharField('ID del plan', max_length=64, unique=True)
    titulo = models.CharField('nombre del plan', max_length=255)
    grupo_id = models.CharField('ID del grupo', max_length=64, blank=True)
    grupo_nombre = models.CharField('grupo de Microsoft 365', max_length=255, blank=True)
    colaborador = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='planes_planner',
        verbose_name='persona',
    )
    activo = models.BooleanField(
        'se mide',
        default=True,
        help_text='Solo se leen los planes activos que tengan persona relacionada.',
    )
    accesible = models.BooleanField('se puede leer', default=True)
    error_lectura = models.CharField('último error de lectura', max_length=255, blank=True)
    ultima_tarea_creada = models.DateField('última tarea creada', null=True, blank=True)
    tareas = models.PositiveIntegerField('tareas', default=0)
    ultima_lectura_at = models.DateTimeField('última lectura', null=True, blank=True)

    class Meta:
        verbose_name = 'plan de Planner'
        verbose_name_plural = 'planes de Planner'
        ordering = ('titulo',)
        constraints = [
            # Una persona se mide con un solo plan a la vez.
            models.UniqueConstraint(
                fields=('colaborador',),
                condition=models.Q(activo=True, colaborador__isnull=False),
                name='planner_un_plan_activo_por_persona',
            ),
        ]

    def __str__(self) -> str:
        return self.titulo


class Deposito(models.Model):
    """Un depósito (bucket) de un plan, tal como estaba en la última lectura."""

    plan = models.ForeignKey(PlanPlanner, on_delete=models.CASCADE, related_name='depositos')
    bucket_id = models.CharField('ID del depósito', max_length=64)
    nombre = models.CharField('nombre', max_length=255)
    semana = models.PositiveSmallIntegerField('semana', null=True, blank=True)
    estandar = models.BooleanField('nombre estándar (WEEK NN)', default=False)

    class Meta:
        verbose_name = 'depósito'
        verbose_name_plural = 'depósitos'
        unique_together = ('plan', 'bucket_id')

    def __str__(self) -> str:
        return self.nombre


class Sincronizacion(models.Model):
    """Bitácora de cada lectura de Planner (sync_run)."""

    class Tipo(models.TextChoices):
        DIARIA = 'diaria', 'Lectura nocturna'
        LINEA_BASE = 'linea_base', 'Línea base'
        CIERRE = 'cierre', 'Cierre de semana'
        MANUAL = 'manual', 'Manual'
        INVENTARIO = 'inventario', 'Inventario de planes'

    class Estado(models.TextChoices):
        OK = 'ok', 'Correcta'
        PARCIAL = 'parcial', 'Con errores en algunos planes'
        ERROR = 'error', 'Con error'
        DETENIDA = 'detenida', 'Detenida'

    tipo = models.CharField('tipo', max_length=12, choices=Tipo.choices)
    anio = models.PositiveSmallIntegerField('año ISO', null=True, blank=True)
    semana = models.PositiveSmallIntegerField('semana', null=True, blank=True)
    iniciada_at = models.DateTimeField('iniciada el', auto_now_add=True)
    terminada_at = models.DateTimeField('terminada el', null=True, blank=True)
    ejecutada_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sincronizaciones_planner',
        help_text='Vacío cuando la corre la tarea programada.',
    )
    estado = models.CharField('estado', max_length=10, choices=Estado.choices, default=Estado.OK)
    planes_leidos = models.PositiveIntegerField('planes leídos', default=0)
    resumen = models.JSONField('resumen', default=dict, blank=True)
    errores = models.JSONField('errores', default=list, blank=True)
    error = models.TextField('error', blank=True)
    # «Detener actualización»: la lectura lo revisa antes de cada plan y se
    # detiene. Va en la base porque la lectura corre en otro hilo (o en el
    # proceso de la tarea programada).
    detener_at = models.DateTimeField('detener pedido el', null=True, blank=True)
    # La lectura viva lo anota cada pocos segundos (antes de cada plan y de
    # cada tanda de Graph). Sin latido reciente, ya no corre: se reinició el
    # servidor a mitad de camino.
    latido_at = models.DateTimeField('último latido', null=True, blank=True)
    detenida_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
        verbose_name='detenida por',
    )

    class Meta:
        verbose_name = 'lectura de Planner'
        verbose_name_plural = 'lecturas de Planner'
        ordering = ('-iniciada_at',)

    def __str__(self) -> str:
        return f'{self.get_tipo_display()} del {self.iniciada_at:%Y-%m-%d %H:%M}'


class Snapshot(models.Model):
    """
    La foto de un plan en una semana.

    `linea_base` y `cierre` se toman una vez y no se reemplazan. `actual` es
    la de la lectura nocturna: se sobreescribe cada noche y es la que se ve
    mientras la semana no ha cerrado.
    """

    class Tipo(models.TextChoices):
        LINEA_BASE = 'linea_base', 'Línea base'
        ACTUAL = 'actual', 'Lectura más reciente'
        CIERRE = 'cierre', 'Cierre'

    plan = models.ForeignKey(PlanPlanner, on_delete=models.CASCADE, related_name='snapshots')
    anio = models.PositiveSmallIntegerField('año ISO')
    semana = models.PositiveSmallIntegerField('semana')
    tipo = models.CharField('tipo', max_length=12, choices=Tipo.choices)
    tomado_at = models.DateTimeField('tomado el')
    sincronizacion = models.ForeignKey(
        Sincronizacion, on_delete=models.SET_NULL, null=True, blank=True, related_name='snapshots'
    )

    class Meta:
        verbose_name = 'snapshot de Planner'
        verbose_name_plural = 'snapshots de Planner'
        unique_together = ('plan', 'anio', 'semana', 'tipo')
        ordering = ('-anio', '-semana')

    def __str__(self) -> str:
        return f'{self.plan} · WEEK {self.semana} · {self.get_tipo_display()}'


class TareaSnapshot(models.Model):
    """Una tarea del depósito de la semana, como estaba en esa foto."""

    snapshot = models.ForeignKey(Snapshot, on_delete=models.CASCADE, related_name='tareas')
    task_id = models.CharField('ID de la tarea', max_length=64)
    titulo = models.CharField('título', max_length=500)
    bucket_id = models.CharField('ID del depósito', max_length=64)
    en_semana = models.BooleanField(
        'en el depósito de la semana',
        default=True,
        help_text='Falso si estaba en la línea base y después se movió a otro depósito: '
        'se guarda para saber si se completó.',
    )
    etiquetas = models.JSONField('etiquetas', default=list, blank=True)
    es_weekly = models.BooleanField(default=False)
    es_daily = models.BooleanField(default=False)
    es_hito = models.BooleanField(default=False)
    completada = models.BooleanField('completada', default=False)
    checklist_total = models.PositiveSmallIntegerField('ítems de checklist', default=0)
    checklist_marcados = models.PositiveSmallIntegerField('ítems marcados', default=0)
    creada_at = models.DateTimeField('creada el', null=True, blank=True)
    completada_at = models.DateTimeField('completada el', null=True, blank=True)

    class Meta:
        verbose_name = 'tarea de snapshot'
        verbose_name_plural = 'tareas de snapshot'
        unique_together = ('snapshot', 'task_id')

    def __str__(self) -> str:
        return self.titulo


class Parametros(models.Model):
    """
    Pesos del índice y cortes del semáforo (param_set). Los define People.

    Cada versión rige desde una semana (`vigente_desde`, un lunes) hasta el día
    antes de la siguiente versión. Los cambios rigen solo para semanas futuras:
    una semana ya empezada siempre se calcula con la versión que tenía, y cada
    resultado guarda con cuál se calculó. Recalcular el pasado es una excepción
    que queda en la bitácora (`RecalculoPlanner`).
    """

    peso_weekly = models.DecimalField(
        'peso Weekly (%)',
        max_digits=5,
        decimal_places=2,
        default=Decimal('40'),
        validators=PORCENTAJE,
    )
    peso_daily = models.DecimalField(
        'peso Daily (%)',
        max_digits=5,
        decimal_places=2,
        default=Decimal('40'),
        validators=PORCENTAJE,
    )
    peso_hito = models.DecimalField(
        'peso Hito (%)',
        max_digits=5,
        decimal_places=2,
        default=Decimal('20'),
        validators=PORCENTAJE,
    )
    verde_desde = models.DecimalField(
        'verde desde', max_digits=5, decimal_places=2, default=Decimal('80'), validators=PORCENTAJE
    )
    ambar_desde = models.DecimalField(
        'ámbar desde', max_digits=5, decimal_places=2, default=Decimal('60'), validators=PORCENTAJE
    )
    vigente_desde = models.DateField(
        'vigente desde', default=VIGENCIA_INICIAL, help_text='Un lunes.'
    )
    vigente_hasta = models.DateField(
        'vigente hasta', null=True, blank=True, help_text='Vacío: rige hasta que haya otra versión.'
    )
    creado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+'
    )
    created_at = models.DateTimeField('guardada el', auto_now_add=True)

    class Meta:
        verbose_name = 'versión de parámetros'
        verbose_name_plural = 'versiones de parámetros'
        ordering = ('-vigente_desde', '-id')

    def __str__(self) -> str:
        return f'Versión {self.pk}: {self.peso_weekly}/{self.peso_daily}/{self.peso_hito}'

    @classmethod
    def para_fecha(cls, dia) -> 'Parametros':
        """La versión que rige ese día; sin ninguna, el estándar del plan (40/40/20, 80/60)."""
        version = (
            cls.objects.filter(vigente_desde__lte=dia)
            .filter(models.Q(vigente_hasta__isnull=True) | models.Q(vigente_hasta__gte=dia))
            .order_by('-vigente_desde', '-id')
            .first()
        )
        return version or cls.objects.order_by('vigente_desde').first() or cls.objects.create()

    @classmethod
    def vigentes(cls) -> 'Parametros':
        """La versión que rige hoy."""
        from django.utils import timezone

        return cls.para_fecha(timezone.localdate())


class HitoPlanner(models.Model):
    """
    Una tarea HITO de una persona en una semana (decisiones 3, 6, 10 y 13).

    El Hito no se valida: queda registrado si la tarea está en el depósito de
    la semana y su checklist tiene al menos un ítem. No hace falta completarla
    ni marcar los ítems. Se guardan los ítems para mostrarlos. Puede haber más
    de uno por semana (decisión 12).
    """

    colaborador = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='hitos_planner'
    )
    plan = models.ForeignKey(PlanPlanner, on_delete=models.CASCADE, related_name='hitos')
    anio = models.PositiveSmallIntegerField('año ISO')
    semana = models.PositiveSmallIntegerField('semana')
    task_id = models.CharField('ID de la tarea', max_length=64)
    titulo = models.CharField('título', max_length=500)
    items = models.JSONField('ítems de la checklist', default=list, blank=True)
    total_items = models.PositiveSmallIntegerField('ítems', default=0)
    actualizado_at = models.DateTimeField('actualizado el', auto_now=True)

    class Meta:
        verbose_name = 'Hito de la semana'
        verbose_name_plural = 'Hitos de la semana'
        unique_together = ('colaborador', 'anio', 'semana', 'task_id')
        ordering = ('-anio', '-semana', 'titulo')

    def __str__(self) -> str:
        return f'{self.colaborador} · WEEK {self.semana} · {self.titulo}'

    @property
    def registrado(self) -> bool:
        return self.total_items > 0


class TareaMedicion(models.Model):
    """
    La trazabilidad de una tarea en la medición de una semana (decisión 2).

    Cuándo se creó en Planner, cuándo entró a la medición (en la línea base o
    después del corte), y en qué depósito está. Sus cambios de depósito
    quedan en `MovimientoTarea`.
    """

    plan = models.ForeignKey(PlanPlanner, on_delete=models.CASCADE, related_name='tareas_medidas')
    anio = models.PositiveSmallIntegerField('año ISO')
    semana = models.PositiveSmallIntegerField('semana')
    task_id = models.CharField('ID de la tarea', max_length=64)
    titulo = models.CharField('título', max_length=500)
    etiquetas = models.JSONField('etiquetas', default=list, blank=True)
    creada_at = models.DateTimeField('creada en Planner', null=True, blank=True)
    entro_at = models.DateTimeField('entró a la medición')
    en_linea_base = models.BooleanField('estaba en la línea base', default=False)
    bucket_id = models.CharField('depósito actual', max_length=64, blank=True)
    bucket_nombre = models.CharField('nombre del depósito actual', max_length=255, blank=True)
    completada = models.BooleanField('completada', default=False)

    class Meta:
        verbose_name = 'tarea medida'
        verbose_name_plural = 'tareas medidas'
        unique_together = ('plan', 'anio', 'semana', 'task_id')
        ordering = ('entro_at', 'titulo')

    def __str__(self) -> str:
        return f'{self.titulo} · WEEK {self.semana}'


class MovimientoTarea(models.Model):
    """Un cambio de depósito de una tarea medida, tal como lo vio una lectura."""

    tarea = models.ForeignKey(TareaMedicion, on_delete=models.CASCADE, related_name='movimientos')
    desde_bucket = models.CharField('desde', max_length=255)
    hacia_bucket = models.CharField('hacia', max_length=255)
    detectado_at = models.DateTimeField('detectado el')

    class Meta:
        verbose_name = 'movimiento de tarea'
        verbose_name_plural = 'movimientos de tareas'
        ordering = ('detectado_at',)

    def __str__(self) -> str:
        return f'{self.desde_bucket} → {self.hacia_bucket}'


class RecalculoPlanner(models.Model):
    """
    Bitácora de los recálculos excepcionales (decisión 7).

    Los parámetros rigen hacia adelante; recalcular una semana ya cerrada es una
    excepción que hace People con un motivo, y queda registrada.
    """

    anio = models.PositiveSmallIntegerField('año ISO')
    semana = models.PositiveSmallIntegerField('semana')
    motivo = models.TextField('motivo')
    parametros = models.ForeignKey(
        Parametros, on_delete=models.PROTECT, related_name='+', verbose_name='versión aplicada'
    )
    resultados = models.PositiveIntegerField('resultados recalculados', default=0)
    autorizado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='+'
    )
    hecho_at = models.DateTimeField('hecho el', auto_now_add=True)

    class Meta:
        verbose_name = 'recálculo excepcional'
        verbose_name_plural = 'recálculos excepcionales'
        ordering = ('-hecho_at',)

    def __str__(self) -> str:
        return f'Recálculo de WEEK {self.semana} ({self.hecho_at:%Y-%m-%d})'


class ResultadoSemana(models.Model):
    """El resultado de una persona en una semana (week_result)."""

    colaborador = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='resultados_planner'
    )
    plan = models.ForeignKey(
        PlanPlanner, on_delete=models.SET_NULL, null=True, blank=True, related_name='+'
    )
    anio = models.PositiveSmallIntegerField('año ISO')
    semana = models.PositiveSmallIntegerField('semana')
    weekly_base = models.PositiveSmallIntegerField('Weekly en la línea base', default=0)
    weekly_agregadas = models.PositiveSmallIntegerField(
        'Weekly agregadas después del corte',
        default=0,
        help_text='Entran en la medición de la semana (decisión 2).',
    )
    weekly_total = models.PositiveSmallIntegerField('Weekly medidas', default=0)
    weekly_completadas = models.PositiveSmallIntegerField('Weekly completadas', default=0)
    daily_items = models.PositiveSmallIntegerField('ítems Daily', default=0)
    daily_marcados = models.PositiveSmallIntegerField('ítems Daily marcados', default=0)
    pct_weekly = models.DecimalField(
        '% Weekly', max_digits=6, decimal_places=2, null=True, blank=True
    )
    pct_daily = models.DecimalField(
        '% Daily', max_digits=6, decimal_places=2, null=True, blank=True
    )
    hito = models.DecimalField('Hito', max_digits=6, decimal_places=2, default=Decimal('0'))
    hitos_registrados = models.PositiveSmallIntegerField('Hitos registrados', default=0)
    indice = models.DecimalField(
        'índice',
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Vacío si la semana no tuvo Weekly ni Daily que medir.',
    )
    final = models.BooleanField(
        'final', default=False, help_text='La semana ya cerró: se tomó su foto de cierre.'
    )
    base_aproximada = models.BooleanField(
        'línea base aproximada',
        default=False,
        help_text='No hubo foto del lunes: se tomó la primera lectura de la semana.',
    )
    parametros = models.ForeignKey(Parametros, on_delete=models.PROTECT, related_name='+')
    calculado_at = models.DateTimeField('calculado el', auto_now=True)

    class Meta:
        verbose_name = 'resultado semanal'
        verbose_name_plural = 'resultados semanales'
        unique_together = ('colaborador', 'anio', 'semana')
        ordering = ('-anio', '-semana')

    def __str__(self) -> str:
        return f'{self.colaborador} · WEEK {self.semana}: {self.indice}'


class IncidenciaCalidad(models.Model):
    """Algo fuera del estándar que impide medir bien (data_quality_issue)."""

    class Tipo(models.TextChoices):
        SIN_PLAN = 'sin_plan', 'Sin plan'
        PLAN_INACCESIBLE = 'plan_inaccesible', 'Plan inaccesible'
        PLAN_DUPLICADO = 'plan_duplicado', 'Plan duplicado'
        SIN_DEPOSITO = 'sin_deposito', 'Sin depósito de la semana'
        DEPOSITO_NO_ESTANDAR = 'deposito_no_estandar', 'Depósito fuera del estándar'
        ETIQUETAS_FALTANTES = 'etiquetas_faltantes', 'Faltan etiquetas'
        SIN_ETIQUETA = 'sin_etiqueta', 'Sin etiqueta'
        SIN_CHECKLIST = 'sin_checklist', 'Sin checklist'
        HITO_SIN_CHECKLIST = 'hito_sin_checklist', 'Hito sin ítems'
        SIN_HITO = 'sin_hito', 'Sin Hito'
        COMPONENTE_SIN_DATO = 'componente_sin_dato', 'Semana sin Weekly o sin Daily'

    class Severidad(models.TextChoices):
        CRITICA = 'critica', 'Crítica'
        ALERTA = 'alerta', 'Alerta'

    tipo = models.CharField('tipo', max_length=24, choices=Tipo.choices)
    severidad = models.CharField('severidad', max_length=8, choices=Severidad.choices)
    plan = models.ForeignKey(
        PlanPlanner, on_delete=models.CASCADE, null=True, blank=True, related_name='incidencias'
    )
    colaborador = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='incidencias_planner',
    )
    anio = models.PositiveSmallIntegerField('año ISO', null=True, blank=True)
    semana = models.PositiveSmallIntegerField('semana', null=True, blank=True)
    detalle = models.CharField('detalle', max_length=500)
    abierta = models.BooleanField('abierta', default=True)
    detectada_at = models.DateTimeField('detectada el', auto_now_add=True)
    resuelta_at = models.DateTimeField('resuelta el', null=True, blank=True)

    class Meta:
        verbose_name = 'incidencia de calidad'
        verbose_name_plural = 'incidencias de calidad'
        # Abiertas primero y, entre ellas, las críticas («critica» > «alerta»).
        ordering = ('-abierta', '-severidad', '-detectada_at')

    def __str__(self) -> str:
        return f'{self.get_tipo_display()}: {self.detalle}'
