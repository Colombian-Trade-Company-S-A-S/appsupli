"""
Calendario laboral colombiano.

La meta diaria sale de repartir la meta del mes entre los días en que de
verdad se vende, y en Colombia eso es «todos menos los domingos y los
festivos»: el sábado sí cuenta. Los festivos se calculan, no se cargan a
mano, porque son deterministas: unos son de fecha fija, otros se corren al
lunes siguiente por la Ley 51 de 1983 —la «Ley Emiliani»— y los de Semana
Santa cuelgan de la Pascua.
"""
from calendar import monthrange
from datetime import date, timedelta
from functools import lru_cache

#: Festivos de fecha fija: nunca se trasladan.
_FIJOS = (
    (1, 1),    # Año Nuevo
    (5, 1),    # Día del Trabajo
    (7, 20),   # Grito de Independencia
    (8, 7),    # Batalla de Boyacá
    (12, 8),   # Inmaculada Concepción
    (12, 25),  # Navidad
)

#: Festivos que la Ley Emiliani corre al lunes siguiente.
_TRASLADABLES = (
    (1, 6),    # Reyes Magos
    (3, 19),   # San José
    (6, 29),   # San Pedro y San Pablo
    (8, 15),   # Asunción de la Virgen
    (10, 12),  # Día de la Raza
    (11, 1),   # Todos los Santos
    (11, 11),  # Independencia de Cartagena
)

#: Días desde la Pascua. Jueves y Viernes Santo caen donde caen; los otros
#: tres ya vienen corridos al lunes (Ascensión 39→43, Corpus 60→64,
#: Sagrado Corazón 68→71).
_DESDE_PASCUA = (-3, -2, 43, 64, 71)


def pascua(anio: int) -> date:
    """Domingo de Pascua del año, por el algoritmo gregoriano de Meeus."""
    a = anio % 19
    b, c = divmod(anio, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    el = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * el) // 451
    mes, dia = divmod(h + el - 7 * m + 114, 31)
    return date(anio, mes, dia + 1)


def _lunes_siguiente(dia: date) -> date:
    """El lunes de la misma semana o el siguiente. Si ya es lunes, no se mueve."""
    return dia + timedelta(days=(7 - dia.weekday()) % 7)


@lru_cache(maxsize=32)
def festivos(anio: int) -> frozenset[date]:
    """Los 18 festivos colombianos del año."""
    domingo = pascua(anio)
    return frozenset(
        [date(anio, mes, dia) for mes, dia in _FIJOS]
        + [_lunes_siguiente(date(anio, mes, dia)) for mes, dia in _TRASLADABLES]
        + [domingo + timedelta(days=delta) for delta in _DESDE_PASCUA]
    )


def dias_del_mes(anio: int, mes: int) -> list[date]:
    """Todos los días del mes, del 1 al último."""
    _, ultimo = monthrange(anio, mes)
    return [date(anio, mes, dia) for dia in range(1, ultimo + 1)]


def es_habil(dia: date) -> bool:
    """Se vende de lunes a sábado: fuera quedan el domingo y los festivos."""
    return dia.weekday() != 6 and dia not in festivos(dia.year)


def dias_habiles(anio: int, mes: int) -> list[date]:
    """Los días del mes en que se vende, en orden."""
    return [dia for dia in dias_del_mes(anio, mes) if es_habil(dia)]
