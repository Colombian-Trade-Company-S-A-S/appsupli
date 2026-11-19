"""
El cálculo de la ejecución semanal, con las decisiones de People (v3).

    % Weekly = tareas WEEKLY completadas al cierre ÷ tareas WEEKLY medidas × 100
    % Daily  = ítems de checklist DAILY marcados ÷ ítems totales × 100
    Hito     = 100 si hay al menos un Hito registrado; 0 si no
    Índice   = mín(100; pesos × componentes), con la versión de parámetros de la semana

Reglas:

- Decisión 2: las tareas WEEKLY medidas son las de la línea base más las
  creadas después del corte que estén en el depósito de la semana. Una de la
  línea base que se movió a otro depósito sigue contando en su semana (regla
  provisional, pendiente de confirmar).
- Decisión 3: el Hito queda registrado si hay una tarea HITO en el depósito de
  la semana con al menos un ítem en su checklist. No se valida ni hace falta
  completarla. Con varios, basta uno (decisión 12, provisional).
- Fila 11 (provisional): si la semana no tiene Weekly o no tiene ítems Daily,
  ese componente sale y su peso se reparte entre los otros. Sin Weekly ni
  Daily, la semana queda sin índice (no cuenta en los promedios).
- Decisión 7: cada semana se calcula con la versión de parámetros que regía en
  ella, y el resultado guarda cuál fue.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.utils import timezone

from .api_permissions import personas_medidas
from .models import Parametros, PlanPlanner, ResultadoSemana, Snapshot
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
) -> Decimal | None:
    """
    El Índice Planner semanal, de 0 a 100.

    Un componente que no se pudo medir (None) sale del cálculo y su peso se
    reparte entre los demás en proporción. Sin Weekly ni Daily no hay índice.
    Con todo medido: 5 de 6 Weekly, 7 de 10 ítems y Hito registrado dan 81,3.
    """
    if pct_weekly is None and pct_daily is None:
        return None
    partes = [(parametros.peso_hito, hito)]
    if pct_weekly is not None:
        partes.append((parametros.peso_weekly, pct_weekly))
    if pct_daily is not None:
        partes.append((parametros.peso_daily, pct_daily))
    pesos = sum(peso for peso, _ in partes)
    if not pesos:
        return None
    return min(CIEN, sum(peso * valor for peso, valor in partes) / pesos)


def semaforo(valor: Decimal | float | None, parametros: Parametros) -> str | None:
    """verde / ambar / rojo con los cortes de la versión, o None si no hay dato."""
    if valor is None:
        return None
    valor = Decimal(str(valor))
    if valor >= parametros.verde_desde:
        return 'verde'
    if valor >= parametros.ambar_desde:
        return 'ambar'
    return 'rojo'


def parametros_de(semana: Semana) -> Parametros:
    """La versión de parámetros que rige la semana: la vigente su lunes."""
    return Parametros.para_fecha(semana.lunes)


# ── Resultado de una semana ───────────────────────────────────────────────


def _fotos_de_la_semana(planes: list[PlanPlanner], semana: Semana) -> dict[int, dict]:
    """Las fotos de la semana de todos los planes, con sus tareas: {plan_id: {tipo: foto}}."""
    fotos: dict[int, dict[str, Snapshot]] = defaultdict(dict)
    for s in Snapshot.objects.filter(
        plan__in=planes, anio=semana.anio, semana=semana.numero
    ).prefetch_related('tareas'):
        fotos[s.plan_id][s.tipo] = s
    return fotos


def calcular_resultado(
    plan: PlanPlanner, fotos: dict[str, Snapshot], parametros: Parametros
) -> dict | None:
    """Los valores del resultado de la persona del plan. None si todavía no hay fotos."""
    if not fotos:
        return None
    base = fotos.get(Snapshot.Tipo.LINEA_BASE)
    final = fotos.get(Snapshot.Tipo.CIERRE) or fotos.get(Snapshot.Tipo.ACTUAL)
    base_aproximada = base is None
    if base is None:
        # Sin foto del corte (la semana empezó antes de la integración, o la
        # tarea programada falló): se toma la lectura que haya, y se avisa.
        base = final
    if final is None:
        final = base
    tareas_finales = list(final.tareas.all())

    # Weekly: las de la línea base más las agregadas después del corte que
    # están en el depósito de la semana (decisión 2).
    ids_base = {t.task_id for t in base.tareas.all() if t.es_weekly and t.en_semana}
    ids_agregadas = {t.task_id for t in tareas_finales if t.es_weekly and t.en_semana} - ids_base
    medidas = ids_base | ids_agregadas
    estado_final = {t.task_id: t for t in tareas_finales}
    completadas = sum(1 for tid in medidas if tid in estado_final and estado_final[tid].completada)

    # Daily: lo que está en el depósito de la semana al cierre (o hoy).
    dailies = [t for t in tareas_finales if t.es_daily and t.en_semana]
    items = sum(t.checklist_total for t in dailies)
    marcados = sum(t.checklist_marcados for t in dailies)

    # Hito: registrado si hay una tarea HITO en la semana con al menos un ítem.
    hitos = sum(1 for t in tareas_finales if t.es_hito and t.en_semana and t.checklist_total > 0)

    pct_w = porcentaje(completadas, len(medidas))
    pct_d = porcentaje(marcados, items)
    hito = CIEN if hitos else CERO
    return {
        'plan': plan,
        'weekly_base': len(ids_base),
        'weekly_agregadas': len(ids_agregadas),
        'weekly_total': len(medidas),
        'weekly_completadas': completadas,
        'daily_items': items,
        'daily_marcados': marcados,
        'pct_weekly': redondear(pct_w),
        'pct_daily': redondear(pct_d),
        'hito': hito,
        'hitos_registrados': hitos,
        'indice': redondear(indice(pct_w, pct_d, hito, parametros)),
        'final': Snapshot.Tipo.CIERRE in fotos,
        'base_aproximada': base_aproximada,
        'parametros': parametros,
    }


@transaction.atomic
def recalcular_semana(semana: Semana, ahora: datetime | None = None, forzar: bool = False) -> int:
    """
    Recalcula el resultado de todas las personas medidas en la semana.

    Los resultados finales (semana cerrada) no se tocan, salvo con `forzar`:
    es el recálculo excepcional, que People autoriza y queda en la bitácora.

    Se lee y se guarda por lotes (unas pocas consultas para toda la compañía):
    la base está en Render y cada consulta suelta cuesta.
    """
    parametros = parametros_de(semana)
    existentes = {
        r.colaborador_id: r
        for r in ResultadoSemana.objects.filter(anio=semana.anio, semana=semana.numero)
    }
    planes = [
        plan
        for plan in PlanPlanner.objects.filter(activo=True, colaborador__in=personas_medidas())
        if forzar
        or plan.colaborador_id not in existentes
        or not existentes[plan.colaborador_id].final
    ]
    fotos = _fotos_de_la_semana(planes, semana)
    momento = timezone.now()
    nuevos, cambiados = [], []
    for plan in planes:
        valores = calcular_resultado(plan, fotos.get(plan.id, {}), parametros)
        if valores is None:
            continue
        resultado = existentes.get(plan.colaborador_id)
        if resultado is None:
            nuevos.append(
                ResultadoSemana(
                    colaborador_id=plan.colaborador_id,
                    anio=semana.anio,
                    semana=semana.numero,
                    **valores,
                )
            )
            continue
        for campo, valor in valores.items():
            setattr(resultado, campo, valor)
        resultado.calculado_at = momento  # bulk_update no lo pone solo
        cambiados.append(resultado)
    ResultadoSemana.objects.bulk_create(nuevos)
    ResultadoSemana.objects.bulk_update(cambiados, [*CAMPOS_RESULTADO, 'calculado_at'])
    return len(nuevos) + len(cambiados)


CAMPOS_RESULTADO = (
    'plan',
    'weekly_base',
    'weekly_agregadas',
    'weekly_total',
    'weekly_completadas',
    'daily_items',
    'daily_marcados',
    'pct_weekly',
    'pct_daily',
    'hito',
    'hitos_registrados',
    'indice',
    'final',
    'base_aproximada',
    'parametros',
)


# ── Agregados ─────────────────────────────────────────────────────────────


def indice_mensual(colaborador_id: int, anio: int, mes: int) -> Decimal | None:
    """Promedio de los índices semanales cuyo lunes cae en el mes.

    Las semanas sin índice (sin Weekly ni Daily) no cuentan.
    """
    semanas = semanas_del_mes(anio, mes)
    valores = [
        v
        for (a, s, v) in ResultadoSemana.objects.filter(
            colaborador_id=colaborador_id,
            anio__in={s.anio for s in semanas},
            semana__in={s.numero for s in semanas},
            indice__isnull=False,
        ).values_list('anio', 'semana', 'indice')
        if Semana(a, s) in semanas
    ]
    if not valores:
        return None
    return redondear(sum(valores) / len(valores))


def promedio(valores) -> Decimal | None:
    valores = [Decimal(v) for v in valores if v is not None]
    if not valores:
        return None
    return redondear(sum(valores) / len(valores))
