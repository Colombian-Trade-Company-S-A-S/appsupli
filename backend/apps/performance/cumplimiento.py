"""
El % de cumplimiento: cómo se pondera y de qué color se pinta.

Desde octubre de 2026 el porcentaje ya no se calcula: lo registra el
colaborador (o su jefe, en el caso de asesores y promotores), de 0 a 100, con
la evidencia que lo soporta, y el jefe lo aprueba. Las métricas de cada
operación son distintas, así que un único criterio —el % de cumplimiento— es
lo que permite compararlas. Lo que queda acá es lo común a todos: la
ponderación por persona y los cortes del semáforo.
"""
from decimal import Decimal, InvalidOperation

from .models import Semaforo

#: Cortes del semáforo, cerrados por People (A2 del documento de definiciones):
#: verde desde 100, naranja de 85 a 99.9, rojo por debajo de 85. Están acá y no
#: repartidos por las vistas para que cambiarlos sea cambiar dos números.
SEMAFORO_VERDE = Decimal('100')
SEMAFORO_NARANJA = Decimal('85')


def _a_float(valor) -> float:
    try:
        return float(valor)
    except (TypeError, ValueError, InvalidOperation):
        return 0.0


def cumplimiento_total(pares) -> Decimal:
    """
    El cumplimiento de una persona en el mes: Σ (peso_i/100 × pct_i).

    `pares` son tuplas `(peso, porcentaje)`. Es lo que alimenta el ranking y el
    Top Performance de la Fase 2.
    """
    total = sum(_a_float(peso) / 100 * _a_float(pct) for peso, pct in pares)
    return Decimal(f'{total:.2f}')


def semaforo(porcentaje) -> str | None:
    """
    El color de un cumplimiento: verde ≥ 100, naranja 85–99.9, rojo < 85.

    Sin porcentaje no hay color: un objetivo sin resultado cargado no está en
    rojo, está sin medir, y pintarlo de rojo diría algo que no es.
    """
    if porcentaje is None:
        return None
    valor = Decimal(f'{_a_float(porcentaje):.2f}')
    if valor >= SEMAFORO_VERDE:
        return Semaforo.VERDE
    if valor >= SEMAFORO_NARANJA:
        return Semaforo.NARANJA
    return Semaforo.ROJO


def cortes_semaforo() -> dict:
    """Los cortes, para que el frontend pinte la leyenda con los mismos números."""
    return {
        'verde_desde': float(SEMAFORO_VERDE),
        'naranja_desde': float(SEMAFORO_NARANJA),
        'etiquetas': [
            {'value': valor, 'label': etiqueta} for valor, etiqueta in Semaforo.choices
        ],
    }
