"""
Reglas de negocio de Challenge que se preguntan desde varios lados.

Están acá y no repartidas entre vistas y serializers porque son las que
definen el juego: quién puede pedir una revisión, cómo se recalcula un puntaje
cuando llega una valoración nueva y a quién le toca ser jurado.
"""
import random

from django.db.models import Q

from .models import (
    EVALUADORES_POR_PARTICIPACION,
    NIVEL_MAXIMO_PARA_REVISION,
    EstadoParticipacion,
    JuradoReto,
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
    tocadas = resolver_ganador(hermanas)
    for fila in tocadas:
        fila.save(update_fields=['es_ganador', 'bonus', 'puntaje_desempate', 'updated_at'])
    # La instancia en memoria pudo quedar desactualizada por el paso anterior.
    participacion.refresh_from_db()
    return participacion


def evaluadores_esperados(participacion) -> int:
    """
    Cuántas valoraciones necesita una participación para quedar valorada.

    Son tres —dos de Supli y el jurado del reto (B9)—, salvo que el jurado
    sorteado sea justamente quien participa: nadie se valora a sí mismo, así
    que en ese caso la entrega se cierra con las otras dos.
    """
    esperados = EVALUADORES_POR_PARTICIPACION
    if participacion.reto.jurados.filter(usuario_id=participacion.participante_id).exists():
        esperados -= 1
    return esperados


def sortear_jurado(reto, elegibles) -> JuradoReto | None:
    """
    Escoge al azar el jurado del reto (B9).

    Se sortea una sola vez, al publicar: si cambiara en cada valoración no
    sería «el jurado del reto», sería un evaluador distinto cada vez. Se
    prefiere a quien ya valora en Supli —es quien conoce la rúbrica— y se
    excluye a quien creó el reto.
    """
    from .api_permissions import es_evaluador

    candidatos = list(
        elegibles.filter(is_active=True)
        .exclude(pk=reto.creado_por_id)
        .filter(~Q(jurados_challenge__reto=reto))
    )
    evaluadores = [usuario for usuario in candidatos if es_evaluador(usuario)]
    sorteables = evaluadores or candidatos
    if not sorteables:
        return None
    return JuradoReto.objects.create(reto=reto, usuario=random.choice(sorteables))
