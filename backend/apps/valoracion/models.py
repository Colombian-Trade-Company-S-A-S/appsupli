"""
Valoración de desempeño (SUPLI PERFORMANCE).

    Competency  → categoría interna que agrupa preguntas (A. Cultura, B. …)
    Question    → ítem del banco de preguntas (liderazgo u operativo)
    Cycle       → periodo de evaluación con su ventana de fechas
    Assignment  → par evaluador → evaluado dentro de un ciclo
    Answer      → respuesta de una pregunta dentro de una asignación
    Result      → consolidado de una persona en un ciclo (lo calcula el motor)
    ActionPlan  → compromiso de mejora sobre un resultado
    Settings    → interruptor global que publica o bloquea los resultados

La jerarquía (quién evalúa a quién) sale de `User.manager`: este módulo no
duplica el organigrama, lo lee del modelo de accesos de la plataforma.
"""
from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.models import TimeStampedModel


class EvaluationType(models.TextChoices):
    LEADER = 'lider', 'Evaluación de liderazgo'
    OPERATIONAL = 'operativo', 'Evaluación operativa/táctica'


class QuestionType(models.TextChoices):
    LIKERT = 'likert', 'Escala 1-5'
    OPEN = 'abierta', 'Pregunta abierta'


class CycleStatus(models.TextChoices):
    SCHEDULED = 'programado', 'Programado'
    ACTIVE = 'activo', 'Activo'
    CLOSED = 'cerrado', 'Cerrado'
    CANCELLED = 'cancelado', 'Cancelado'
    FINISHED = 'finalizado', 'Finalizado'


class EvaluatorRole(models.TextChoices):
    MANAGER = 'jefe', 'Jefe inmediato'
    TEAM = 'equipo', 'Miembro del equipo'
    SELF = 'autoevaluacion', 'Autoevaluación'


class AssignmentStatus(models.TextChoices):
    PENDING = 'pendiente', 'Pendiente'
    IN_PROGRESS = 'en_progreso', 'En progreso'
    COMPLETED = 'completada', 'Completada'


class Level(models.TextChoices):
    """Semáforo organizacional. Es también la escala Likert de respuesta."""

    REFERENT = 'referente', 'Es un referente'
    CONSOLIDATED = 'consolidado', 'Está consolidado'
    DEVELOPING = 'desarrollo', 'En desarrollo'
    SUPPORT = 'acompanamiento', 'Requiere acompañamiento'
    INTERVENTION = 'intervencion', 'Requiere intervención inmediata'


class ActionPlanStatus(models.TextChoices):
    PENDING = 'pendiente', 'Pendiente'
    IN_PROGRESS = 'en_proceso', 'En proceso'
    DONE = 'cumplido', 'Cumplido'
    OVERDUE = 'vencido', 'Vencido'


# Escala oficial: el valor 1-5 que marca el evaluador y su significado.
LIKERT_SCALE = [
    (5, Level.REFERENT),
    (4, Level.CONSOLIDATED),
    (3, Level.DEVELOPING),
    (2, Level.SUPPORT),
    (1, Level.INTERVENTION),
]

LIKERT_LABELS = {valor: Level(nivel).label for valor, nivel in LIKERT_SCALE}

# Umbral inferior de cada nivel del semáforo, de mayor a menor.
LEVEL_THRESHOLDS = [
    (90, Level.REFERENT),
    (75, Level.CONSOLIDATED),
    (60, Level.DEVELOPING),
    (40, Level.SUPPORT),
    (0, Level.INTERVENTION),
]


def level_for(percentage: float | None) -> str:
    """Nivel del semáforo que corresponde a un porcentaje 0-100."""
    if percentage is None:
        return Level.INTERVENTION
    for umbral, nivel in LEVEL_THRESHOLDS:
        if percentage >= umbral:
            return nivel
    return Level.INTERVENTION


class Competency(TimeStampedModel):
    """Categoría interna de las preguntas. El evaluador nunca la ve."""

    code = models.CharField('código', max_length=10, help_text='Ej: A, B, C')
    name = models.CharField('nombre', max_length=200, help_text='Ej: CULTURA')
    description = models.TextField('descripción', blank=True)
    order = models.PositiveIntegerField('orden', default=0)
    is_active = models.BooleanField('activa', default=True)

    class Meta:
        verbose_name = 'competencia'
        verbose_name_plural = 'competencias'
        ordering = ('order', 'code')

    def __str__(self) -> str:
        return f'{self.code}. {self.name}'

    @property
    def label(self) -> str:
        return f'{self.code}. {self.name}'


class Question(TimeStampedModel):
    """Ítem del banco de preguntas. Se reutiliza en todos los ciclos."""

    competency = models.ForeignKey(
        Competency, on_delete=models.PROTECT, related_name='questions', verbose_name='competencia'
    )
    statement = models.TextField('enunciado')
    evaluation_type = models.CharField(
        'tipo de evaluación', max_length=20, choices=EvaluationType.choices
    )
    question_type = models.CharField(
        'tipo de pregunta', max_length=20, choices=QuestionType.choices, default=QuestionType.LIKERT
    )
    weight = models.DecimalField(
        'peso',
        max_digits=5,
        decimal_places=2,
        default=1,
        help_text='Peso relativo dentro de la competencia.',
    )
    order = models.PositiveIntegerField('orden', default=0)
    is_required = models.BooleanField('obligatoria', default=True)
    is_active = models.BooleanField('activa', default=True)

    class Meta:
        verbose_name = 'pregunta'
        verbose_name_plural = 'preguntas'
        ordering = ('competency__order', 'order', 'id')

    def __str__(self) -> str:
        return f'[{self.get_evaluation_type_display()}] {self.statement[:60]}'


class Cycle(TimeStampedModel):
    """Periodo de evaluación: fechas, reglas de peso y participantes."""

    TYPE_CHOICES = EvaluationType.choices + [('mixta', 'Mixta')]

    name = models.CharField('nombre', max_length=200)
    description = models.TextField('descripción', blank=True)
    evaluation_type = models.CharField(
        'tipo', max_length=20, choices=TYPE_CHOICES, default='mixta'
    )
    start_date = models.DateTimeField('fecha de inicio')
    end_date = models.DateTimeField('fecha de cierre')
    status = models.CharField(
        'estado', max_length=20, choices=CycleStatus.choices, default=CycleStatus.SCHEDULED
    )
    is_anonymous = models.BooleanField(
        'anonimato', default=False, help_text='El evaluado no ve quién lo calificó.'
    )
    comments_required = models.BooleanField('comentarios obligatorios', default=False)
    manager_weight = models.PositiveSmallIntegerField(
        'peso del jefe (%)', default=60, help_text='Solo aplica en evaluaciones de liderazgo.'
    )
    team_weight = models.PositiveSmallIntegerField('peso del equipo (%)', default=40)
    excluded_questions = models.JSONField(
        'preguntas excluidas',
        default=list,
        blank=True,
        help_text='IDs de preguntas que no se aplican en este ciclo.',
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='valuation_cycles_created',
        verbose_name='creado por',
    )

    class Meta:
        verbose_name = 'ciclo de evaluación'
        verbose_name_plural = 'ciclos de evaluación'
        ordering = ('-start_date',)

    def __str__(self) -> str:
        return f'{self.name} ({self.get_status_display()})'

    @staticmethod
    def open_filter(prefix: str = '', now=None) -> models.Q:
        """Filtro de los ciclos que admiten respuestas ahora mismo.

        `status='activo'` por sí solo no basta: hay que cruzarlo con la ventana
        de fechas. `prefix` permite usarlo desde otro modelo (p. ej. 'cycle__').
        """
        now = now or timezone.now()
        return models.Q(
            **{
                f'{prefix}status': CycleStatus.ACTIVE,
                f'{prefix}start_date__lte': now,
                f'{prefix}end_date__gte': now,
            }
        )

    def unavailable_reason(self, now=None) -> str | None:
        """None si el ciclo admite respuestas; si no, el motivo en texto."""
        now = now or timezone.now()
        if self.status != CycleStatus.ACTIVE:
            return (
                f'Este ciclo está en estado «{self.get_status_display()}». '
                'Solo los ciclos activos admiten respuestas.'
            )
        if now < self.start_date:
            return (
                'Este ciclo aún no ha iniciado. Abre el '
                f'{timezone.localtime(self.start_date):%d/%m/%Y %H:%M}.'
            )
        if now > self.end_date:
            return (
                f'Este ciclo cerró el {timezone.localtime(self.end_date):%d/%m/%Y %H:%M}. '
                'Pide al administrador que amplíe la fecha de cierre para reabrirlo.'
            )
        return None

    def is_open(self, now=None) -> bool:
        return self.unavailable_reason(now) is None

    @property
    def effective_status(self) -> str:
        """Estado real cruzando `status` con la ventana de fechas.

        El campo por sí solo miente: un ciclo marcado 'activo' cuya fecha de
        cierre ya pasó seguiría apareciendo como Activo en los listados.
        """
        if self.status != CycleStatus.ACTIVE:
            return self.status
        now = timezone.now()
        if now < self.start_date:
            return CycleStatus.SCHEDULED
        if now > self.end_date:
            return 'vencido'
        return CycleStatus.ACTIVE

    @property
    def effective_status_display(self) -> str:
        if self.effective_status == 'vencido':
            return 'Vencido'
        return CycleStatus(self.effective_status).label


class Assignment(TimeStampedModel):
    """Quién evalúa a quién dentro de un ciclo."""

    cycle = models.ForeignKey(
        Cycle, on_delete=models.CASCADE, related_name='assignments', verbose_name='ciclo'
    )
    evaluator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='valuations_to_do',
        verbose_name='evaluador',
    )
    evaluatee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='valuations_received',
        verbose_name='evaluado',
    )
    evaluator_role = models.CharField(
        'rol del evaluador', max_length=20, choices=EvaluatorRole.choices
    )
    evaluation_type = models.CharField(
        'tipo de evaluación', max_length=20, choices=EvaluationType.choices
    )
    status = models.CharField(
        'estado', max_length=20, choices=AssignmentStatus.choices, default=AssignmentStatus.PENDING
    )
    is_active = models.BooleanField(
        'activa', default=True, help_text='Si se desactiva, no aplica para responder ni consolidar.'
    )
    agreements = models.TextField(
        'observaciones y acuerdos', blank=True, help_text='Campo libre; no califica.'
    )
    started_at = models.DateTimeField('primera respuesta', null=True, blank=True)
    completed_at = models.DateTimeField('enviada el', null=True, blank=True)

    class Meta:
        verbose_name = 'asignación'
        verbose_name_plural = 'asignaciones'
        unique_together = ('cycle', 'evaluator', 'evaluatee')
        ordering = ('cycle', 'evaluatee_id')

    def __str__(self) -> str:
        return f'{self.evaluator} → {self.evaluatee} ({self.cycle.name})'


class Answer(TimeStampedModel):
    """Respuesta de una pregunta dentro de una asignación."""

    assignment = models.ForeignKey(
        Assignment, on_delete=models.CASCADE, related_name='answers', verbose_name='asignación'
    )
    question = models.ForeignKey(
        Question, on_delete=models.PROTECT, related_name='answers', verbose_name='pregunta'
    )
    value = models.PositiveSmallIntegerField(
        'valor', null=True, blank=True, help_text='1-5 en preguntas tipo escala.'
    )
    text = models.TextField('respuesta abierta', blank=True)
    answered_at = models.DateTimeField('respondida el', default=timezone.now)

    class Meta:
        verbose_name = 'respuesta'
        verbose_name_plural = 'respuestas'
        unique_together = ('assignment', 'question')

    def __str__(self) -> str:
        return f'Pregunta {self.question_id} → {self.value or "—"}'


class Result(TimeStampedModel):
    """Consolidado de una persona en un ciclo. Lo escribe el motor de cálculo."""

    cycle = models.ForeignKey(
        Cycle, on_delete=models.CASCADE, related_name='results', verbose_name='ciclo'
    )
    evaluatee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='valuation_results',
        verbose_name='evaluado',
    )
    evaluation_type = models.CharField(
        'tipo de evaluación', max_length=20, choices=EvaluationType.choices
    )
    score = models.DecimalField('puntaje (sobre 5)', max_digits=6, decimal_places=2, default=0)
    percentage = models.DecimalField('porcentaje', max_digits=5, decimal_places=2, default=0)
    level = models.CharField(
        'semáforo', max_length=20, choices=Level.choices, default=Level.INTERVENTION
    )

    manager_score = models.DecimalField(
        'puntaje del jefe', max_digits=6, decimal_places=2, default=0
    )
    team_score = models.DecimalField(
        'puntaje del equipo', max_digits=6, decimal_places=2, default=0
    )
    self_score = models.DecimalField('autoevaluación', max_digits=6, decimal_places=2, default=0)

    evaluators_total = models.PositiveIntegerField(
        'calificaciones consolidadas', default=0, help_text='Evaluaciones completadas que entraron.'
    )
    evaluators_manager = models.PositiveIntegerField('calificaciones del jefe', default=0)
    evaluators_team = models.PositiveIntegerField('calificaciones del equipo', default=0)
    evaluators_self = models.PositiveIntegerField('autoevaluaciones', default=0)

    competency_detail = models.JSONField(
        'detalle por competencia',
        default=list,
        blank=True,
        help_text='[{code, name, label, average, percentage, level, items}]',
    )
    strengths = models.JSONField('fortalezas', default=list, blank=True)
    gaps = models.JSONField('brechas', default=list, blank=True)
    computed_at = models.DateTimeField('calculado el', auto_now=True)

    class Meta:
        verbose_name = 'resultado'
        verbose_name_plural = 'resultados'
        unique_together = ('cycle', 'evaluatee')
        ordering = ('-percentage',)

    def __str__(self) -> str:
        return f'{self.evaluatee} · {self.cycle.name} ({self.percentage}%)'


class ActionPlan(TimeStampedModel):
    """Compromiso de mejora asociado a un resultado."""

    result = models.ForeignKey(
        Result, on_delete=models.CASCADE, related_name='action_plans', verbose_name='resultado'
    )
    description = models.TextField('descripción')
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='valuation_action_plans',
        verbose_name='responsable',
    )
    due_date = models.DateField('fecha de compromiso')
    status = models.CharField(
        'estado', max_length=20, choices=ActionPlanStatus.choices, default=ActionPlanStatus.PENDING
    )
    evidence_url = models.URLField('evidencia', blank=True)
    notes = models.TextField('observaciones', blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='valuation_action_plans_created',
        verbose_name='creado por',
    )

    class Meta:
        verbose_name = 'plan de acción'
        verbose_name_plural = 'planes de acción'
        ordering = ('status', 'due_date')

    def __str__(self) -> str:
        return f'{self.description[:50]} ({self.get_status_display()})'

    @property
    def is_overdue(self) -> bool:
        return self.status != ActionPlanStatus.DONE and self.due_date < timezone.localdate()


class ValuationSettings(TimeStampedModel):
    """Interruptor global del módulo (fila única, pk=1).

    Mientras `results_published` esté en False, «Mis resultados» y «Planes de
    acción» quedan bloqueados para todo el equipo. Solo quien tenga el permiso
    `valoracion:results:publish` puede abrirlos, idealmente cuando el avance de
    respuestas llegue al 100%.
    """

    results_published = models.BooleanField(
        'resultados publicados',
        default=False,
        help_text='Si está activo, el equipo ve sus resultados y planes de acción.',
    )
    published_at = models.DateTimeField('publicado el', null=True, blank=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='valuation_settings_updates',
        verbose_name='actualizado por',
    )

    class Meta:
        verbose_name = 'configuración del módulo'
        verbose_name_plural = 'configuración del módulo'

    def __str__(self) -> str:
        return f'Resultados {"publicados" if self.results_published else "bloqueados"}'

    @classmethod
    def load(cls) -> 'ValuationSettings':
        """Devuelve (creando si hace falta) la única fila de configuración."""
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
