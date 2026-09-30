"""
Cómo se convierte una valoración en puntaje, y cómo sale el ganador.

Las tres reglas de la sección B del documento de definiciones:

    B2 · (criterio₁ + … + criterioₙ) ÷ n × 10 → 0–100.
         Con los cinco criterios base: 8+9+7+8+9 = 41; 41 ÷ 5 = 8,2; × 10 = 82.
    B9 · El puntaje final de una participación es el promedio de sus tres
         valoraciones. Si alguna marca «no cumple», la participación se
         descalifica con 0 y no se promedia nada.
    B4 · Un solo ganador: el de mayor puntaje. En empate se comparan los tres
         criterios de desempate y el ganador recibe +20.

Vive aparte de los modelos y de las vistas porque es lo único que hay que leer
para entender cómo se califica, y porque así se prueba sin base de datos.
"""
from decimal import Decimal

from .models import BONUS_DESEMPATE, EstadoParticipacion


def _decimal(valor) -> Decimal:
    return Decimal(f'{float(valor):.2f}')


def puntaje_de_niveles(niveles) -> Decimal:
    """El promedio de los criterios llevado a 0–100 (B2)."""
    niveles = list(niveles)
    if not niveles:
        return Decimal('0.00')
    return _decimal(sum(niveles) / len(niveles) * 10)


def puntaje_final(puntajes) -> Decimal | None:
    """
    El promedio de las valoraciones de una participación (B9).

    Sin ninguna valoración todavía no hay puntaje: `None` significa «sin
    valorar», que no es lo mismo que cero.
    """
    puntajes = [p for p in puntajes if p is not None]
    if not puntajes:
        return None
    return _decimal(sum(float(p) for p in puntajes) / len(puntajes))


def puntaje_de_desempate(participacion) -> Decimal:
    """
    Lo acumulado en los criterios de desempate: conexión, valor y evidencia.

    Se suman los niveles que pusieron todos los evaluadores en esos tres
    criterios. Es una comparación entre empatados, no una nota que se muestre.
    """
    total = 0
    for valoracion in participacion.valoraciones.all():
        for puntaje in valoracion.puntajes.all():
            if puntaje.criterio.desempate:
                total += puntaje.nivel
    return _decimal(total)


def resolver_ganador(participaciones) -> list:
    """
    Marca al ganador del reto y deja a los demás sin la marca (B4).

    Devuelve las participaciones tocadas, para guardarlas de una sola vez. Las
    descalificadas y las que aún no tienen puntaje no compiten: un cero por no
    cumplir no puede ganar, y una sin valorar todavía no se puede comparar.
    """
    candidatas = [
        p
        for p in participaciones
        if p.estado != EstadoParticipacion.DESCALIFICADA and p.puntaje_final is not None
    ]
    tocadas = []
    for participacion in participaciones:
        if participacion.es_ganador or participacion.bonus:
            participacion.es_ganador = False
            participacion.bonus = 0
            participacion.puntaje_desempate = None
            tocadas.append(participacion)

    if not candidatas:
        return tocadas

    mejor = max(float(p.puntaje_final) for p in candidatas)
    empatadas = [p for p in candidatas if float(p.puntaje_final) == mejor]

    if len(empatadas) == 1:
        ganadora = empatadas[0]
    else:
        # Empate: se compara lo acumulado en los tres criterios de desempate y
        # el ganador recibe el bonus. Si ni así se rompe, gana quien entregó
        # primero: el reto no admite dos ganadores.
        for participacion in empatadas:
            participacion.puntaje_desempate = puntaje_de_desempate(participacion)
            if participacion not in tocadas:
                tocadas.append(participacion)
        ganadora = max(
            empatadas, key=lambda p: (float(p.puntaje_desempate or 0), -p.created_at.timestamp())
        )
        ganadora.bonus = BONUS_DESEMPATE

    ganadora.es_ganador = True
    if ganadora not in tocadas:
        tocadas.append(ganadora)
    return tocadas
