"""
El cálculo de la ejecución semanal (guía, paso 6, y prototipo «Cómo se calcula»).

    % Weekly = tareas WEEKLY completadas al cierre ÷ línea base × 100
    % Daily  = ítems de checklist DAILY marcados ÷ ítems totales × 100
    Hito     = 100 si está Cumplido o Sin validar; 0 en otro caso
    Índice   = mín(100; pW·W + pD·D + pH·H), con pesos de Parámetros

Reglas que todavía debe confirmar People (ver Novedades_y_pendientes):

- Decisión 2: las tareas agregadas después de la línea base no cuentan ni en
  el numerador ni en el denominador; las movidas a otro depósito siguen
  contando en la semana de su línea base. Se implementa así, que es la
  propuesta del plan.
- Fila 11: una semana sin Weekly o sin checklist cuenta ese componente como 0,
  igual que en el prototipo, y queda la alerta en el panel de calidad.
"""
from __future__ import annotations

from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction

from .models import (
    HITO_SUMA,
    EstadoHito,
    Parametros,
    PlanPlanner,
    ResultadoSemana,
    Snapshot,
    ValidacionHito,
)
from .semanas import Semana, semanas_del_mes

CIEN = Decimal('100')
CERO = Decimal('0')


def redondear(valor: Decimal | None, decimales: str = '0.01') -> Decimal | None:
    return None if valor is None else valor.quantize(Decimal(decimales), rounding=ROUND_HALF_UP)


def porcentaje(parte: int, total: int) -> Decimal | None:
    """parte ÷ total × 100, o None si no hay total (no se puede medir)."""
    if not total:
        return None
    return Decimal(parte) * CIEN / Decimal(total)


def indice(
    pct_weekly: Decimal | None,
    pct_daily: Decimal | None,
    hito: Decimal,
    parametros: Parametros,
) -> Decimal:
    """
    El Índice Planner semanal, de 0 a 100.

    Un componente que no se pudo medir (None) cuenta como 0, como en el
    prototipo. Con 5 de 6 Weekly, 7 de 10 ítems y el Hito cumplido da 81,3.
    """
    w = pct_weekly if pct_weekly is not None else CERO
    d = pct_daily if pct_daily is not None else CERO
    total = (parametros.peso_weekly * w + parametros.peso_daily * d + parametros.peso_hito * hito) / CIEN
    return min(CIEN, total)


def valor_hito(estado: str) -> Decimal:
    return CIEN if estado in HITO_SUMA else CERO


def semaforo(valor: Decimal | float | None, parametros: Parametros) -> str | None:
    """verde / ambar / rojo con los cortes vigentes, o None si no hay dato."""
    if valor is None:
        return None
    valor = Decimal(str(valor))
    if valor >= parametros.verde_desde:
        return 'verde'
    if valor >= parametros.ambar_desde:
        return 'ambar'
    return 'rojo'


# ── Estado del Hito ───────────────────────────────────────────────────────


def cerrar_ventana(semana: Semana, ahora: datetime | None = None) -> int:
    """
    Al cerrar la ventana, lo que quedó pendiente pasa a «Sin validar».

    Cuenta como Cumplido (prototipo, paso 5 del ciclo). Devuelve cuántos cambió.
    """
    if not semana.ventana_cerrada(ahora):
        return 0
    return ValidacionHito.objects.filter(
        anio=semana.anio, semana=semana.numero, estado=EstadoHito.PENDIENTE
    ).update(estado=EstadoHito.SIN_VALIDAR)


# ── Resultado de una semana ───────────────────────────────────────────────


def _fotos(plan: PlanPlanner, semana: Semana) -> dict[str, Snapshot]:
    return {
        s.tipo: s
        for s in Snapshot.objects.filter(plan=plan, anio=semana.anio, semana=semana.numero)
        .prefetch_related('tareas')
    }


def calcular_resultado(plan: PlanPlanner, semana: Semana, parametros: Parametros,
                       ahora: datetime | None = None) -> ResultadoSemana | None:
    """Calcula y guarda el resultado de la persona del plan. None si todavía no hay fotos."""
    fotos = _fotos(plan, semana)
    if not fotos:
        return None
    base = fotos.get(Snapshot.Tipo.LINEA_BASE)
    final = fotos.get(Snapshot.Tipo.CIERRE) or fotos.get(Snapshot.Tipo.ACTUAL)
    base_aproximada = base is None
    if base is None:
        # Sin foto del lunes (la semana empezó antes de la integración, o la
        # tarea programada falló): se toma la lectura que haya, y se avisa.
        base = final
    if final is None:
        final = base

    # Weekly: solo las de la línea base. Las agregadas después no cuentan; las
    # que se movieron a otro depósito siguen contando (la foto las guarda).
    ids_base = {t.task_id for t in base.tareas.all() if t.es_weekly and t.en_semana}
    estado_final = {t.task_id: t for t in final.tareas.all()}
    completadas = sum(1 for tid in ids_base if tid in estado_final and estado_final[tid].completada)

    # Daily: lo que está en el depósito de la semana al cierre (o hoy).
    dailies = [t for t in final.tareas.all() if t.es_daily and t.en_semana]
    items = sum(t.checklist_total for t in dailies)
    marcados = sum(t.checklist_marcados for t in dailies)

    validacion = ValidacionHito.objects.filter(
        colaborador=plan.colaborador, anio=semana.anio, semana=semana.numero
    ).first()
    estado = validacion.estado if validacion else EstadoHito.SIN_REGISTRAR

    pct_w = porcentaje(completadas, len(ids_base))
    pct_d = porcentaje(marcados, items)
    hito = valor_hito(estado)
    es_final = (
        Snapshot.Tipo.CIERRE in fotos
        and semana.ventana_cerrada(ahora)
        and estado != EstadoHito.PENDIENTE
    )
    resultado, _ = ResultadoSemana.objects.update_or_create(
        colaborador=plan.colaborador,
        anio=semana.anio,
        semana=semana.numero,
        defaults={
            'plan': plan,
            'weekly_base': len(ids_base),
            'weekly_completadas': completadas,
            'daily_items': items,
            'daily_marcados': marcados,
            'pct_weekly': redondear(pct_w),
            'pct_daily': redondear(pct_d),
            'hito': hito,
            'indice': redondear(indice(pct_w, pct_d, hito, parametros)),
            'final': es_final,
            'base_aproximada': base_aproximada,
            'parametros': parametros,
        },
    )
    return resultado


@transaction.atomic
def recalcular_semana(semana: Semana, ahora: datetime | None = None, forzar: bool = False) -> int:
    """
    Recalcula el resultado de todas las personas con plan activo en la semana.

    Los resultados finales no se tocan, salvo con `forzar` (por ejemplo, si
    People cambia los pesos y decide recalcular hacia atrás).
    """
    cerrar_ventana(semana, ahora)
    parametros = Parametros.vigentes()
    finales = set(
        ResultadoSemana.objects.filter(anio=semana.anio, semana=semana.numero, final=True)
        .values_list('colaborador_id', flat=True)
    )
    calculados = 0
    planes = PlanPlanner.objects.filter(activo=True, colaborador__isnull=False).select_related('colaborador')
    for plan in planes:
        if plan.colaborador_id in finales and not forzar:
            continue
        if calcular_resultado(plan, semana, parametros, ahora):
            calculados += 1
    return calculados


# ── Agregados ─────────────────────────────────────────────────────────────


def indice_mensual(colaborador_id: int, anio: int, mes: int) -> Decimal | None:
    """Promedio de los índices semanales cuyo lunes cae en el mes."""
    semanas = semanas_del_mes(anio, mes)
    valores = list(
        ResultadoSemana.objects.filter(
            colaborador_id=colaborador_id,
            anio__in={s.anio for s in semanas},
            semana__in={s.numero for s in semanas},
        ).values_list('indice', flat=True)
    )
    if not valores:
        return None
    return redondear(sum(valores) / len(valores))


def promedio(valores) -> Decimal | None:
    valores = [Decimal(v) for v in valores if v is not None]
    if not valores:
        return None
    return redondear(sum(valores) / len(valores))
