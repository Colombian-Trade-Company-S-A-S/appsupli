"""
Supli Challenge: retos de cultura y participación.

Es la sección B del documento de definiciones que cerró People. Las reglas que
mandan sobre el modelo son estas:

    B1 · Al abrir el reto se bloquean sus reglas (criterios, puntaje, público y
         tipo de evidencia). Se puede corregir el texto y ampliar el plazo,
         nunca reducirlo, y todo cambio queda en un historial que el
         colaborador ve.
    B2 · Cinco criterios de 1 a 10 que promedian y se llevan a 0–100.
    B4 · Un solo ganador por reto. En empate se re-valoran tres criterios y el
         ganador recibe +20 puntos.
    B8 · Borrador → Publicado → Cerrado → Finalizado.
    B9 · Cada participación la califican tres evaluadores: dos de Supli y un
         jurado sorteado para ese reto. Si la evidencia no cumple el formato,
         la participación se descalifica con 0 y no se valoran los criterios.

    Reto          → el desafío y sus condiciones
    CriterioReto  → la rúbrica con la que se valora (5 por defecto)
    Participacion → la entrega de una persona, con su puntaje final
    Valoracion    → lo que puso un evaluador, criterio por criterio
"""
from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.core.models import TimeStampedModel


class Categoria(models.TextChoices):
    """Las seis categorías definitivas (B7)."""

    CULTURA = 'cultura', 'Cultura'
    RITMO = 'ritmo', 'Ritmo Supli'
    INFRAESTRUCTURA = 'infraestructura', 'Infraestructura tecnológica'
    KMS = 'kms', 'KMS'
    APRENDE = 'aprende', 'Supli aprende'
    IMPULSA = 'impulsa', 'Supli impulsa'


class EstadoReto(models.TextChoices):
    """El ciclo de vida del reto (B8). Lo gestiona People."""

    BORRADOR = 'borrador', 'Borrador'
    PUBLICADO = 'publicado', 'Abierto'
    CERRADO = 'cerrado', 'Cerrado'
    FINALIZADO = 'finalizado', 'Finalizado'


class Alcance(models.TextChoices):
    """A quién le aparece el reto."""

    TODOS = 'todos', 'Toda la empresa'
    AREAS = 'areas', 'Por área'
    PERSONAS = 'personas', 'Personas puntuales'


class VisibilidadEvidencia(models.TextChoices):
    """Quién puede ver los soportes que sube la gente (B6)."""

    LIDER_PEOPLE = 'lider_people', 'Solo el líder responsable y People'
    PARTICIPANTES = 'participantes', 'Líder, People y participantes del reto'
    ORGANIZACION = 'organizacion', 'Toda la organización'


class FormatoEvidencia(models.TextChoices):
    """
    Formatos aceptados (B5).

    El video va por enlace, con permiso de visualización: en el MVP no se sube
    el archivo, igual que las evidencias de Performance.
    """

    TEXTO = 'texto', 'Texto'
    IMAGEN = 'imagen', 'Imagen'
    PDF = 'pdf', 'PDF'
    ENLACE = 'enlace', 'Enlace (incluye video)'


class EstadoParticipacion(models.TextChoices):
    ENTREGADA = 'entregada', 'Entregada'
    VALORADA = 'valorada', 'Valorada'
    DESCALIFICADA = 'descalificada', 'No cumple'


#: La rúbrica base (B2). `desempate` marca los tres criterios con los que se
#: rompe un empate: conexión con el principio, valor generado y evidencia (B4).
CRITERIOS_BASE = (
    ('Conexión con el principio', True),
    ('Valor generado', True),
    ('Claridad', False),
    ('Evidencia', True),
    ('Aprendizaje', False),
)

#: Cada criterio se califica de 1 a 10 y el promedio se lleva a 0–100.
NIVEL_MINIMO = 1
NIVEL_MAXIMO = 10

#: Qué significa cada nivel. Va en la API para que el evaluador lo tenga a la
#: vista mientras califica, como en el prototipo.
SIGNIFICADO_NIVEL = {
    1: 'Muy limitado',
    2: 'Muy bajo',
    3: 'Bajo',
    4: 'Parcial',
    5: 'Cumple',
    6: 'Cumple y agrega valor',
    7: 'Supera lo esperado',
    8: 'Supera claramente lo esperado',
    9: 'Sobresale',
    10: 'Excepcional',
}

#: Dos miembros de Supli y un jurado sorteado para el reto (B9).
EVALUADORES_POR_PARTICIPACION = 3

#: Lo que suma quien gana un desempate (B4).
BONUS_DESEMPATE = 20

#: Solo se puede pedir revisión de un nivel de 7 o menos (B3).
NIVEL_MAXIMO_PARA_REVISION = 7


class Reto(TimeStampedModel):
    """Un desafío con sus condiciones. Las reglas se congelan al publicarlo."""

    titulo = models.CharField('nombre del reto', max_length=200)
    descripcion = models.TextField('descripción / instrucciones')
    categoria = models.CharField('categoría', max_length=20, choices=Categoria.choices)
    estado = models.CharField(
        'estado', max_length=20, choices=EstadoReto.choices, default=EstadoReto.BORRADOR
    )
    cuenta_para_desempeno = models.BooleanField(
        'cuenta para desempeño',
        default=False,
        help_text='Los retos de cultura no cuentan para el Performance.',
    )

    # ── Público ──────────────────────────────────────────────────────────
    alcance = models.CharField(
        'público objetivo', max_length=20, choices=Alcance.choices, default=Alcance.TODOS
    )
    areas = models.ManyToManyField(
        'accounts.Area', blank=True, related_name='retos', verbose_name='áreas'
    )
    personas = models.ManyToManyField(
        settings.AUTH_USER_MODEL, blank=True, related_name='retos_invitado', verbose_name='personas'
    )
    pais = models.CharField(
        'país', max_length=80, blank=True, help_text='Vacío = sin filtrar por país.'
    )

    # ── Plazo y evidencia ────────────────────────────────────────────────
    cierra_el = models.DateField('cierra el')
    formatos_evidencia = models.JSONField(
        'formatos de evidencia', default=list, help_text='texto, imagen, pdf, enlace.'
    )
    visibilidad_evidencia = models.CharField(
        'visibilidad de la evidencia',
        max_length=20,
        choices=VisibilidadEvidencia.choices,
        default=VisibilidadEvidencia.LIDER_PEOPLE,
    )

    creado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='retos_creados',
        verbose_name='creado por',
    )
    publicado_en = models.DateTimeField('publicado el', null=True, blank=True)
    cerrado_en = models.DateTimeField('cerrado el', null=True, blank=True)
    finalizado_en = models.DateTimeField('finalizado el', null=True, blank=True)

    class Meta:
        verbose_name = 'reto'
        verbose_name_plural = 'retos'
        ordering = ('-created_at',)

    def __str__(self) -> str:
        return self.titulo

    @property
    def abierto(self) -> bool:
        return self.estado == EstadoReto.PUBLICADO

    @property
    def reglas_bloqueadas(self) -> bool:
        """Publicado el reto, sus reglas ya no se tocan (B1)."""
        return self.estado != EstadoReto.BORRADOR


class CriterioReto(TimeStampedModel):
    """
    Un criterio de la rúbrica del reto.

    Los cinco de la definición son el punto de partida, pero pueden variar por
    reto: por eso son filas y no una lista fija en el código.
    """

    reto = models.ForeignKey(
        Reto, on_delete=models.CASCADE, related_name='criterios', verbose_name='reto'
    )
    nombre = models.CharField('criterio', max_length=120)
    orden = models.PositiveSmallIntegerField('orden', default=0)
    desempate = models.BooleanField(
        'entra en el desempate',
        default=False,
        help_text='Los tres criterios con los que se rompe un empate.',
    )

    class Meta:
        verbose_name = 'criterio del reto'
        verbose_name_plural = 'criterios del reto'
        ordering = ('orden', 'id')
        unique_together = ('reto', 'nombre')

    def __str__(self) -> str:
        return self.nombre


class JuradoReto(TimeStampedModel):
    """El jurado sorteado para un reto: la tercera valoración de cada entrega."""

    reto = models.ForeignKey(
        Reto, on_delete=models.CASCADE, related_name='jurados', verbose_name='reto'
    )
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='jurados_challenge',
        verbose_name='jurado',
    )

    class Meta:
        verbose_name = 'jurado del reto'
        verbose_name_plural = 'jurados del reto'
        unique_together = ('reto', 'usuario')

    def __str__(self) -> str:
        return f'{self.usuario} · {self.reto}'


class CambioReto(TimeStampedModel):
    """
    Historial de cambios de un reto ya publicado (B1).

    El colaborador lo ve: si le corrigieron el texto o le ampliaron el plazo
    después de haber participado, tiene que poder enterarse.
    """

    reto = models.ForeignKey(
        Reto, on_delete=models.CASCADE, related_name='cambios', verbose_name='reto'
    )
    autor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='cambios_retos',
        verbose_name='autor',
    )
    descripcion = models.TextField('qué cambió')

    class Meta:
        verbose_name = 'cambio del reto'
        verbose_name_plural = 'cambios del reto'
        ordering = ('-created_at',)

    def __str__(self) -> str:
        return self.descripcion[:60]


class Participacion(TimeStampedModel):
    """
    La entrega de una persona en un reto.

    Entregar la evidencia pedida **es** participar (B9): no hay un paso de
    inscripción aparte.
    """

    reto = models.ForeignKey(
        Reto, on_delete=models.CASCADE, related_name='participaciones', verbose_name='reto'
    )
    participante = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='participaciones_challenge',
        verbose_name='participante',
    )
    formato = models.CharField(
        'formato de la evidencia', max_length=20, choices=FormatoEvidencia.choices
    )
    entrega_texto = models.TextField('evidencia en texto', blank=True)
    entrega_link = models.URLField('enlace de la evidencia', max_length=500, blank=True)
    estado = models.CharField(
        'estado',
        max_length=20,
        choices=EstadoParticipacion.choices,
        default=EstadoParticipacion.ENTREGADA,
    )

    # ── Resultado ────────────────────────────────────────────────────────
    puntaje_final = models.DecimalField(
        'puntaje final', max_digits=6, decimal_places=2, null=True, blank=True
    )
    puntaje_desempate = models.DecimalField(
        'puntaje del desempate', max_digits=6, decimal_places=2, null=True, blank=True
    )
    bonus = models.PositiveSmallIntegerField('bonus por desempate', default=0)
    es_ganador = models.BooleanField('ganador del reto', default=False)
    motivo_descalificacion = models.TextField('motivo de la descalificación', blank=True)

    class Meta:
        verbose_name = 'participación'
        verbose_name_plural = 'participaciones'
        ordering = ('-created_at',)
        unique_together = ('reto', 'participante')

    def __str__(self) -> str:
        return f'{self.participante} · {self.reto}'

    @property
    def puntaje_con_bonus(self):
        """Lo que se muestra en el ranking: el puntaje más el bonus del desempate."""
        if self.puntaje_final is None:
            return None
        return self.puntaje_final + self.bonus


class Valoracion(TimeStampedModel):
    """
    Lo que puso un evaluador sobre una participación.

    Tres por participación: dos miembros de Supli y el jurado del reto. Si el
    evaluador marca «no cumple», la participación queda descalificada con cero
    y no se valoran los criterios (B9).
    """

    participacion = models.ForeignKey(
        Participacion,
        on_delete=models.CASCADE,
        related_name='valoraciones',
        verbose_name='participación',
    )
    evaluador = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='valoraciones_challenge',
        verbose_name='evaluador',
    )
    es_jurado = models.BooleanField('es el jurado del reto', default=False)
    comentario = models.TextField('comentario para el colaborador', blank=True)
    no_cumple = models.BooleanField('la evidencia no cumple', default=False)
    puntaje = models.DecimalField(
        'puntaje (0–100)', max_digits=6, decimal_places=2, null=True, blank=True
    )

    class Meta:
        verbose_name = 'valoración'
        verbose_name_plural = 'valoraciones'
        ordering = ('created_at',)
        unique_together = ('participacion', 'evaluador')

    def __str__(self) -> str:
        return f'{self.evaluador} → {self.participacion_id}'


class PuntajeCriterio(TimeStampedModel):
    """El nivel de 1 a 10 que un evaluador le puso a un criterio."""

    valoracion = models.ForeignKey(
        Valoracion, on_delete=models.CASCADE, related_name='puntajes', verbose_name='valoración'
    )
    criterio = models.ForeignKey(
        CriterioReto, on_delete=models.CASCADE, related_name='puntajes', verbose_name='criterio'
    )
    nivel = models.PositiveSmallIntegerField(
        'nivel',
        validators=[MinValueValidator(NIVEL_MINIMO), MaxValueValidator(NIVEL_MAXIMO)],
    )

    class Meta:
        verbose_name = 'puntaje por criterio'
        verbose_name_plural = 'puntajes por criterio'
        unique_together = ('valoracion', 'criterio')

    def __str__(self) -> str:
        return f'{self.criterio} = {self.nivel}'


class EstadoRevision(models.TextChoices):
    PENDIENTE = 'pendiente', 'Pendiente'
    ATENDIDA = 'atendida', 'Atendida'


class SolicitudRevision(TimeStampedModel):
    """
    La revisión que pide un colaborador sobre su valoración (B3).

    Solo se habilita cuando algún criterio quedó en 7 o menos: del 8 para
    arriba se considera una valoración alta y no se revisa.
    """

    participacion = models.ForeignKey(
        Participacion,
        on_delete=models.CASCADE,
        related_name='revisiones',
        verbose_name='participación',
    )
    solicitante = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='revisiones_challenge',
        verbose_name='solicitante',
    )
    motivo = models.TextField('motivo')
    estado = models.CharField(
        'estado', max_length=20, choices=EstadoRevision.choices, default=EstadoRevision.PENDIENTE
    )
    respuesta = models.TextField('respuesta', blank=True)
    atendida_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='revisiones_atendidas',
        verbose_name='atendida por',
    )

    class Meta:
        verbose_name = 'solicitud de revisión'
        verbose_name_plural = 'solicitudes de revisión'
        ordering = ('-created_at',)

    def __str__(self) -> str:
        return f'Revisión de {self.participacion_id}'
