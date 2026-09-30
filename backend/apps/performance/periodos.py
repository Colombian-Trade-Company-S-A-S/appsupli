"""
Los cortes de tiempo y el congelamiento del mes.

Dos reglas cerradas por People en el documento de definiciones:

    A8 · Los objetivos se acumulan en cuatro cortes: mes, Q (trimestre, tres
         meses), semestre y año. El «Q de cuatro meses» del framework viejo
         quedó corregido: el Q es trimestral.

    A9 · Los objetivos de un mes se editan hasta el último día del mes
         anterior. Cuando el mes empieza quedan congelados solos, sin que
         nadie oprima nada. People puede reabrir la edición en un caso
         excepcional autorizado por el CEO, y eso queda registrado.

Vive aparte de las vistas porque las dos reglas se preguntan desde varios
lados —el serializer al guardar, la vista al borrar, la portada para avisar—
y una regla de negocio repetida en tres lugares se desincroniza sola.
"""
from datetime import date, timedelta

from .models import EstadoPeriodo

#: Meses de cada corte, por tipo.
MESES_POR_CORTE = {'mes': 1, 'trimestre': 3, 'semestre': 6, 'anio': 12}

#: Cómo se nombra cada corte en pantalla.
ETIQUETA_CORTE = {
    'mes': 'Mensual',
    'trimestre': 'Q · trimestral',
    'semestre': 'Semestral',
    'anio': 'Anual',
}

MESES = (
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
)


def primer_dia(fecha: date) -> date:
    """El periodo siempre es el primer día del mes: así lo guarda y lo compara."""
    return fecha.replace(day=1)


def mes_siguiente(momento: date) -> date:
    return date(momento.year + (momento.month == 12), momento.month % 12 + 1, 1)


# ── Congelamiento (A9) ─────────────────────────────────────────────────────


def puede_editarse(periodo: date, registro, hoy: date) -> tuple[bool, str]:
    """
    Si los objetivos de ese mes se pueden tocar, y por qué no cuando no.

    Devuelve `(puede, motivo)`. El motivo es el texto que ve la persona, así
    que dice qué pasó y qué se puede hacer, no solo que está bloqueado.
    """
    if registro is not None and registro.estado == EstadoPeriodo.CERRADO:
        return False, f'{etiqueta_mes(periodo)} está cerrado: sus objetivos ya no se modifican.'

    if registro is not None and registro.edicion_habilitada:
        return True, ''

    if primer_dia(hoy) >= periodo:
        return False, (
            f'Los objetivos de {etiqueta_mes(periodo)} quedaron congelados: se editan hasta el '
            'último día del mes anterior. People puede habilitar la edición en casos '
            'excepcionales autorizados por el CEO.'
        )

    if registro is not None and registro.estado == EstadoPeriodo.EN_MEDICION:
        return False, f'{etiqueta_mes(periodo)} ya está en medición: sus objetivos se congelaron.'

    return True, ''


def ultimo_dia_para_editar(periodo: date) -> date:
    """El último día en que se pueden tocar los objetivos de ese mes: el día anterior."""
    return periodo - timedelta(days=1)


# ── Cortes de tiempo (A8) ──────────────────────────────────────────────────


def rango(tipo: str, anio: int, indice: int = 1) -> tuple[date, date]:
    """
    Los meses que cubre un corte: `(primer mes, último mes)`, ambos incluidos.

    `indice` es el número del corte dentro del año: el trimestre 1 a 4, el
    semestre 1 o 2, el mes 1 a 12. El año lo ignora.
    """
    largo = MESES_POR_CORTE.get(tipo)
    if largo is None:
        raise ValueError(f'Corte desconocido: {tipo}')
    if largo == 12:
        return date(anio, 1, 1), date(anio, 12, 1)
    cortes_en_el_anio = 12 // largo
    numero = min(max(int(indice or 1), 1), cortes_en_el_anio)
    primer_mes = (numero - 1) * largo + 1
    return date(anio, primer_mes, 1), date(anio, primer_mes + largo - 1, 1)


def meses_del_rango(desde: date, hasta: date) -> list[date]:
    meses = [desde]
    while meses[-1] < hasta:
        meses.append(mes_siguiente(meses[-1]))
    return meses


def etiqueta_mes(periodo: date) -> str:
    return f'{MESES[periodo.month - 1]} {periodo.year}'


def etiqueta_corte(tipo: str, anio: int, indice: int = 1) -> str:
    """`trimestre 3 de 2026` → `3Q · Jul–Sep 2026`, como en el prototipo."""
    desde, hasta = rango(tipo, anio, indice)
    if tipo == 'mes':
        return etiqueta_mes(desde)
    if tipo == 'anio':
        return f'Año {anio}'
    corto = f'{MESES[desde.month - 1][:3]}–{MESES[hasta.month - 1][:3]}'
    numero = (desde.month - 1) // MESES_POR_CORTE[tipo] + 1
    prefijo = f'{numero}Q' if tipo == 'trimestre' else f'{numero}S'
    return f'{prefijo} · {corto} {anio}'


def cortes_del_anio(anio: int) -> list[dict]:
    """Todos los cortes de un año, para el selector de periodo del tablero."""
    opciones = []
    for tipo, largo in MESES_POR_CORTE.items():
        for numero in range(1, 12 // largo + 1):
            desde, hasta = rango(tipo, anio, numero)
            opciones.append(
                {
                    'tipo': tipo,
                    'tipo_label': ETIQUETA_CORTE[tipo],
                    'indice': numero,
                    'anio': anio,
                    'label': etiqueta_corte(tipo, anio, numero),
                    'desde': desde,
                    'hasta': hasta,
                }
            )
    return opciones
