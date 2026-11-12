"""
El calendario de la medición: semanas ISO, festivos de Colombia y los cortes.

Cada semana tiene cuatro momentos (guía, «Ciclo semanal»):

    1. Línea base: lunes 18:00 COT, o martes si el lunes es festivo.
    2. Ejecución: la sincronización nocturna lee Planner a las 02:00 COT.
    3. Cierre: domingo 23:59 COT.
    4. Validación del Hito: de lunes a miércoles de la semana siguiente. Si
       ese lunes es festivo, la ventana se corre un día (martes a jueves).

Las semanas se nombran como en Planner: «WEEK 46». Por dentro se guardan con
el año ISO para no confundir la WEEK 1 de dos años distintos.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from functools import lru_cache
from zoneinfo import ZoneInfo

COT = ZoneInfo('America/Bogota')

HORA_LINEA_BASE = time(18, 0)
HORA_CIERRE = time(23, 59)

#: Nombres de depósito que se reconocen como semana. El estándar es
#: «WEEK 45», pero hoy muchos planes usan «W45», «W 45», «Week 45» o solo «45»:
#: se aceptan y el panel de calidad los marca para que se corrijan.
_DEPOSITO_SEMANA = re.compile(r'^\s*(?:WEEK|W)?\s*(\d{1,2})\s*$', re.IGNORECASE)
_DEPOSITO_ESTANDAR = re.compile(r'^WEEK \d{1,2}$')


def semana_de_deposito(nombre: str) -> int | None:
    """El número de semana de un depósito («W45» → 45), o None si no es de semana."""
    coincide = _DEPOSITO_SEMANA.match(nombre or '')
    if not coincide:
        return None
    numero = int(coincide.group(1))
    return numero if 1 <= numero <= 53 else None


def deposito_estandar(nombre: str) -> bool:
    """Si el depósito se llama exactamente como pide el estándar: «WEEK 45»."""
    return bool(_DEPOSITO_ESTANDAR.match(nombre or ''))


# ── Festivos de Colombia (Ley 51 de 1983, «Ley Emiliani») ─────────────────


def _pascua(anio: int) -> date:
    """Domingo de Pascua (algoritmo anónimo gregoriano)."""
    a, b, c = anio % 19, anio // 100, anio % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7  # noqa: E741
    m = (a + 11 * h + 22 * l) // 451
    mes = (h + l - 7 * m + 114) // 31
    dia = (h + l - 7 * m + 114) % 31 + 1
    return date(anio, mes, dia)


def _al_lunes(dia: date) -> date:
    """La Ley Emiliani: si no cae lunes, el festivo pasa al lunes siguiente."""
    return dia + timedelta(days=(7 - dia.weekday()) % 7)


@lru_cache(maxsize=16)
def festivos(anio: int) -> frozenset[date]:
    fijos = [(1, 1), (5, 1), (7, 20), (8, 7), (12, 8), (12, 25)]
    trasladables = [(1, 6), (3, 19), (6, 29), (8, 15), (10, 12), (11, 1), (11, 11)]
    pascua = _pascua(anio)
    dias = {date(anio, m, d) for m, d in fijos}
    dias |= {_al_lunes(date(anio, m, d)) for m, d in trasladables}
    dias |= {
        pascua - timedelta(days=3),  # Jueves Santo
        pascua - timedelta(days=2),  # Viernes Santo
        pascua + timedelta(days=43),  # Ascensión (lunes)
        pascua + timedelta(days=64),  # Corpus Christi (lunes)
        pascua + timedelta(days=71),  # Sagrado Corazón (lunes)
    }
    return frozenset(dias)


def es_festivo(dia: date) -> bool:
    return dia in festivos(dia.year)


def _primer_dia_habil_desde(dia: date) -> date:
    while es_festivo(dia) or dia.weekday() >= 5:
        dia += timedelta(days=1)
    return dia


# ── La semana ─────────────────────────────────────────────────────────────


@dataclass(frozen=True, order=True)
class Semana:
    anio: int
    numero: int

    @classmethod
    def de_fecha(cls, dia: date) -> Semana:
        iso = dia.isocalendar()
        return cls(iso.year, iso.week)

    @classmethod
    def actual(cls, ahora: datetime | None = None) -> Semana:
        return cls.de_fecha(_local(ahora).date())

    @classmethod
    def desde_codigo(cls, codigo: str) -> Semana:
        """«2026-W46» → Semana(2026, 46). Lanza ValueError si no tiene ese formato."""
        coincide = re.fullmatch(r'(\d{4})-W(\d{1,2})', (codigo or '').strip())
        if not coincide:
            raise ValueError(f'Semana inválida: {codigo!r}. Usa el formato 2026-W46.')
        semana = cls(int(coincide.group(1)), int(coincide.group(2)))
        semana.lunes  # valida que exista (la WEEK 53 no existe todos los años)
        return semana

    @property
    def codigo(self) -> str:
        return f'{self.anio}-W{self.numero:02d}'

    @property
    def etiqueta(self) -> str:
        return f'WEEK {self.numero}'

    @property
    def lunes(self) -> date:
        return date.fromisocalendar(self.anio, self.numero, 1)

    @property
    def domingo(self) -> date:
        return self.lunes + timedelta(days=6)

    @property
    def rango(self) -> str:
        """«9–15 nov» o «28 sep–4 oct», como en el prototipo."""
        ini, fin = self.lunes, self.domingo
        if ini.month == fin.month:
            return f'{ini.day}–{fin.day} {_MES[fin.month]}'
        return f'{ini.day} {_MES[ini.month]}–{fin.day} {_MES[fin.month]}'

    @property
    def mes(self) -> tuple[int, int]:
        """El mes al que pertenece: el de su lunes (Índice mensual del plan)."""
        return self.lunes.year, self.lunes.month

    def siguiente(self) -> Semana:
        return Semana.de_fecha(self.lunes + timedelta(days=7))

    def anterior(self) -> Semana:
        return Semana.de_fecha(self.lunes - timedelta(days=7))

    # Cortes
    @property
    def dia_linea_base(self) -> date:
        """El lunes, o el siguiente día hábil si el lunes es festivo."""
        return _primer_dia_habil_desde(self.lunes)

    @property
    def linea_base(self) -> datetime:
        return datetime.combine(self.dia_linea_base, HORA_LINEA_BASE, tzinfo=COT)

    @property
    def cierre(self) -> datetime:
        return datetime.combine(self.domingo, HORA_CIERRE, tzinfo=COT)

    @property
    def ventana_hitos(self) -> tuple[date, date]:
        """Lunes a miércoles de la semana siguiente; un día después si ese lunes es festivo."""
        inicio = self.siguiente().dia_linea_base
        return inicio, inicio + timedelta(days=2)

    def ventana_abierta(self, ahora: datetime | None = None) -> bool:
        inicio, fin = self.ventana_hitos
        return inicio <= _local(ahora).date() <= fin

    def ventana_cerrada(self, ahora: datetime | None = None) -> bool:
        return _local(ahora).date() > self.ventana_hitos[1]

    def cerrada(self, ahora: datetime | None = None) -> bool:
        return _local(ahora) > self.cierre


_MES = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']


def _local(ahora: datetime | None) -> datetime:
    ahora = ahora or datetime.now(tz=COT)
    return ahora.astimezone(COT) if ahora.tzinfo else ahora.replace(tzinfo=COT)


def semanas_del_mes(anio: int, mes: int) -> list[Semana]:
    """Las semanas cuyo lunes cae en el mes: las que promedia el Índice mensual."""
    dia = date(anio, mes, 1)
    dia += timedelta(days=(7 - dia.weekday()) % 7)  # primer lunes
    semanas = []
    while dia.month == mes:
        semanas.append(Semana.de_fecha(dia))
        dia += timedelta(days=7)
    return semanas


def semana_del_corte(tipo: str, ahora: datetime | None = None) -> Semana:
    """
    A qué semana le toca un snapshot que se toma ahora.

    El cierre se programa el domingo a las 23:59, pero si la tarea corre tarde
    —ya el lunes de madrugada— sigue siendo el cierre de la semana anterior.
    """
    local = _local(ahora)
    semana = Semana.de_fecha(local.date())
    if tipo == 'cierre' and local.weekday() == 0 and local.hour < 12:
        return semana.anterior()
    return semana
