"""
Reglas de negocio de Challenge que se preguntan desde varios lados.

Están acá y no repartidas entre vistas y serializers porque son las que
definen el juego: quién puede pedir una revisión, cómo se recalcula un puntaje
cuando llega una valoración nueva y a quién le toca ser jurado.
"""

from django.utils import timezone

from .models import (
    EVALUADORES_POR_PARTICIPACION,
    NIVEL_MAXIMO_PARA_REVISION,
    EstadoParticipacion,
    Participacion,
)
from .puntajes import puntaje_final, resolver_ganador


def puede_pedir_revision(usuario, participacion) -> bool:
    """
    La revisión se habilita solo cuando algún nivel quedó en 7 o menos (B3).

    Del 8 para arriba People considera que la valoración es alta y no se
    revisa; y solo la pide el dueño de la entrega, no cualquiera que la vea.
    """
    if usuario is None or not usuario.is_authenticated:
        return False
    if participacion.participante_id != usuario.id:
        return False
    if participacion.estado == EstadoParticipacion.DESCALIFICADA:
        return True
    return any(
        puntaje.nivel <= NIVEL_MAXIMO_PARA_REVISION
        for valoracion in participacion.valoraciones.all()
        for puntaje in valoracion.puntajes.all()
    )


def recalcular(participacion) -> Participacion:
    """
    Vuelve a sacar el puntaje de una participación y el ganador del reto.

    Se llama después de cada valoración. Si alguien marcó «no cumple», la
    participación queda descalificada con cero sin promediar nada (B9).
    """
    valoraciones = list(participacion.valoraciones.all())
    descalificada = any(valoracion.no_cumple for valoracion in valoraciones)

    if descalificada:
        participacion.estado = EstadoParticipacion.DESCALIFICADA
        participacion.puntaje_final = 0
    else:
        participacion.puntaje_final = puntaje_final([v.puntaje for v in valoraciones])
        completa = len(valoraciones) >= evaluadores_esperados(participacion)
        participacion.estado = (
            EstadoParticipacion.VALORADA if completa else EstadoParticipacion.ENTREGADA
        )
    participacion.save(
        update_fields=['estado', 'puntaje_final', 'updated_at']
    )

    hermanas = list(
        Participacion.objects.filter(reto_id=participacion.reto_id).prefetch_related(
            'valoraciones__puntajes__criterio'
        )
    )
    guardar_ganador(resolver_ganador(hermanas))
    # La instancia en memoria pudo quedar desactualizada por el paso anterior.
    participacion.refresh_from_db()
    return participacion


def guardar_ganador(tocadas) -> None:
    """
    Guarda de una vez lo que cambió `resolver_ganador`.

    En un empate se tocan todas las empatadas (su puntaje de desempate): una
    por una serían tantas consultas como entregas.
    """
    if not tocadas:
        return
    ahora = timezone.now()
    for fila in tocadas:
        fila.updated_at = ahora
    Participacion.objects.bulk_update(
        tocadas, ['es_ganador', 'bonus', 'puntaje_desempate', 'updated_at']
    )


def evaluadores_esperados(participacion) -> int:
    """
    Cuántas valoraciones necesita una participación para quedar valorada.

    Califica solo People, así que basta una. Ya no hay jurado sorteado: era
    alguien fuera de People calificando, y eso es justo lo que no se quiere.
    """
    return EVALUADORES_POR_PARTICIPACION
