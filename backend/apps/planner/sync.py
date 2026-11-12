"""
La lectura de Planner: toma la foto de la semana de cada plan relacionado.

    sincronizar('diaria')      → 02:00 COT, cada noche. Foto «actual».
    sincronizar('linea_base')  → lunes 18:00 COT (martes si es festivo).
    sincronizar('cierre')      → domingo 23:59 COT.
    sincronizar('manual')      → el botón «Sincronizar ahora». Foto «actual».

Después de cada lectura se recalculan los resultados de la semana (y de la
anterior, que cierra cuando termina la ventana de validación del Hito), y se
actualiza el panel de calidad del dato.
"""
from __future__ import annotations

import logging
from datetime import datetime

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from .api_permissions import personas_medidas
from .calculo import recalcular_semana
from .graph import GraphClient, GraphError, rutas_de_plan
from .models import (
    Deposito,
    EstadoHito,
    IncidenciaCalidad,
    PlanPlanner,
    Sincronizacion,
    Snapshot,
    TareaSnapshot,
    ValidacionHito,
)
from .semanas import Semana, deposito_estandar, semana_de_deposito, semana_del_corte

logger = logging.getLogger(__name__)

ETIQUETAS_CLAVE = ('WEEKLY', 'DAILY', 'HITO')

TIPO_FOTO = {
    Sincronizacion.Tipo.DIARIA: Snapshot.Tipo.ACTUAL,
    Sincronizacion.Tipo.MANUAL: Snapshot.Tipo.ACTUAL,
    Sincronizacion.Tipo.LINEA_BASE: Snapshot.Tipo.LINEA_BASE,
    Sincronizacion.Tipo.CIERRE: Snapshot.Tipo.CIERRE,
}

Incidencia = tuple[str, str, str]  # (tipo, severidad, detalle)
I = IncidenciaCalidad  # noqa: E741


def sincronizar(
    tipo: str,
    ejecutada_por=None,
    semana: Semana | None = None,
    cliente: GraphClient | None = None,
    ahora: datetime | None = None,
    forzar: bool = False,
) -> Sincronizacion:
    """
    Lee los planes activos y guarda la foto de la semana.

    La línea base y el cierre se toman una sola vez: si ya existen, no se
    reemplazan salvo con `forzar` (así, correr el comando dos veces el jueves
    no mueve la línea base del lunes).
    """
    ahora = ahora or timezone.now()
    semana = semana or semana_del_corte(tipo, ahora)
    tipo_foto = TIPO_FOTO[tipo]
    registro = Sincronizacion.objects.create(
        tipo=tipo, anio=semana.anio, semana=semana.numero, ejecutada_por=ejecutada_por
    )
    cliente = cliente or GraphClient()
    planes = list(
        PlanPlanner.objects.filter(activo=True, colaborador__isnull=False).select_related('colaborador')
    )
    resumen = {'planes': len(planes), 'fotos': 0, 'omitidas': 0, 'inaccesibles': 0, 'tareas': 0}
    errores: list[dict] = []
    detectadas: list[tuple[PlanPlanner | None, object, Incidencia]] = []

    try:
        rutas = [ruta for plan in planes for ruta in rutas_de_plan(plan.plan_id)]
        respuestas = cliente.lote(rutas) if rutas else []
    except GraphError as e:
        registro.estado = Sincronizacion.Estado.ERROR
        registro.error = str(e)
        registro.terminada_at = timezone.now()
        registro.resumen = resumen
        registro.save()
        logger.warning('Lectura de Planner fallida: %s', e)
        return registro

    for i, plan in enumerate(planes):
        buckets, detalles, tareas = respuestas[3 * i:3 * i + 3]
        fallida = next((r for r in (buckets, detalles, tareas) if not r.ok), None)
        if fallida is not None:
            plan.accesible = False
            plan.error_lectura = fallida.error[:255]
            plan.save(update_fields=['accesible', 'error_lectura', 'updated_at'])
            resumen['inaccesibles'] += 1
            errores.append({'plan': plan.titulo, 'error': fallida.error})
            detectadas.append((plan, plan.colaborador, (
                I.Tipo.PLAN_INACCESIBLE, I.Severidad.CRITICA,
                f'No se pudo leer «{plan.titulo}» ({fallida.status}). No entra en el cálculo hasta corregirlo.',
            )))
            continue
        try:
            with transaction.atomic():
                tomada, incidencias, n_tareas = _guardar_plan(
                    plan, semana, tipo_foto, registro, buckets.cuerpo['value'],
                    detalles.cuerpo, tareas.cuerpo['value'], ahora, forzar,
                )
        except Exception as e:  # un plan raro no tumba la lectura de los demás
            logger.exception('Error guardando el plan %s', plan.plan_id)
            errores.append({'plan': plan.titulo, 'error': str(e)[:300]})
            continue
        resumen['fotos' if tomada else 'omitidas'] += 1
        resumen['tareas'] += n_tareas
        detectadas += [(plan, plan.colaborador, inc) for inc in incidencias]

    # Quien debería medirse y no tiene plan relacionado.
    con_plan = {p.colaborador_id for p in planes}
    for persona in personas_medidas().exclude(pk__in=con_plan):
        detectadas.append((None, persona, (
            I.Tipo.SIN_PLAN, I.Severidad.CRITICA,
            'Persona sin plan relacionado. No entra en el cálculo.',
        )))

    _registrar_incidencias(detectadas, semana)
    recalcular_semana(semana, ahora)
    recalcular_semana(semana.anterior(), ahora)

    registro.planes_leidos = len(planes) - resumen['inaccesibles']
    registro.resumen = resumen
    registro.errores = errores
    registro.estado = (
        Sincronizacion.Estado.OK if not errores
        else Sincronizacion.Estado.PARCIAL if registro.planes_leidos
        else Sincronizacion.Estado.ERROR
    )
    registro.terminada_at = timezone.now()
    registro.save()
    return registro


def _etiquetas(detalles: dict) -> dict[str, str]:
    """categoryN → nombre en mayúsculas, solo las que tienen nombre."""
    return {
        cat: str(nombre).strip().upper()
        for cat, nombre in (detalles.get('categoryDescriptions') or {}).items()
        if nombre and str(nombre).strip()
    }


def _fecha(valor: str | None):
    return parse_datetime(valor) if valor else None


def _guardar_plan(plan, semana, tipo_foto, registro, buckets, detalles, tareas, ahora, forzar):
    """Guarda depósitos, la foto de la semana y el Hito. Devuelve (tomada, incidencias, n.º tareas)."""
    incidencias: list[Incidencia] = []

    # Depósitos tal como están hoy.
    Deposito.objects.filter(plan=plan).delete()
    Deposito.objects.bulk_create([
        Deposito(
            plan=plan, bucket_id=b['id'], nombre=b['name'][:255],
            semana=semana_de_deposito(b['name']), estandar=deposito_estandar(b['name']),
        )
        for b in buckets
    ])
    de_la_semana = {b['id']: b['name'] for b in buckets if semana_de_deposito(b['name']) == semana.numero}
    if not de_la_semana:
        incidencias.append((I.Tipo.SIN_DEPOSITO, I.Severidad.CRITICA,
                            f'No hay depósito «{semana.etiqueta}» en el plan.'))
    for nombre in de_la_semana.values():
        if not deposito_estandar(nombre):
            incidencias.append((I.Tipo.DEPOSITO_NO_ESTANDAR, I.Severidad.ALERTA,
                                f'«{nombre.strip()}» no coincide con el estándar «{semana.etiqueta}». '
                                'Se lee igual; se corrige en Planner.'))

    etiquetas = _etiquetas(detalles)
    faltan = [e for e in ETIQUETAS_CLAVE if e not in etiquetas.values()]
    if faltan:
        incidencias.append((I.Tipo.ETIQUETAS_FALTANTES, I.Severidad.CRITICA,
                            f'El plan no tiene las etiquetas {", ".join(faltan)}.'))

    # Meta del plan (para el inventario y el panel).
    creadas = [t.get('createdDateTime') for t in tareas if t.get('createdDateTime')]
    plan.tareas = len(tareas)
    plan.ultima_tarea_creada = _fecha(max(creadas)).date() if creadas else None
    plan.accesible = True
    plan.error_lectura = ''
    plan.ultima_lectura_at = ahora
    plan.save(update_fields=['tareas', 'ultima_tarea_creada', 'accesible', 'error_lectura',
                             'ultima_lectura_at', 'updated_at'])

    existente = Snapshot.objects.filter(plan=plan, anio=semana.anio, semana=semana.numero, tipo=tipo_foto).first()
    if existente and tipo_foto != Snapshot.Tipo.ACTUAL and not forzar:
        return False, incidencias, 0

    # Las de la línea base que se movieron a otro depósito siguen contando
    # para el Weekly (decisión 2): se guardan, marcadas fuera de la semana.
    ids_base = set()
    if tipo_foto != Snapshot.Tipo.LINEA_BASE:
        ids_base = set(TareaSnapshot.objects.filter(
            snapshot__plan=plan, snapshot__anio=semana.anio, snapshot__semana=semana.numero,
            snapshot__tipo=Snapshot.Tipo.LINEA_BASE, es_weekly=True, en_semana=True,
        ).values_list('task_id', flat=True))

    filas, sin_etiqueta, sin_checklist, hitos = [], 0, 0, []
    for t in tareas:
        en_semana = t.get('bucketId') in de_la_semana
        if not en_semana and t['id'] not in ids_base:
            continue
        nombres = sorted({etiquetas[c] for c, puesta in (t.get('appliedCategories') or {}).items()
                          if puesta and c in etiquetas})
        es_w, es_d, es_h = ('WEEKLY' in nombres), ('DAILY' in nombres), ('HITO' in nombres)
        total = t.get('checklistItemCount') or 0
        activos = t.get('activeChecklistItemCount') or 0
        if en_semana:
            if not (es_w or es_d or es_h):
                sin_etiqueta += 1
            if es_d and not total:
                sin_checklist += 1
            if es_h:
                hitos.append(t)
        filas.append(TareaSnapshot(
            task_id=t['id'], titulo=(t.get('title') or '')[:500], bucket_id=t.get('bucketId') or '',
            en_semana=en_semana, etiquetas=nombres, es_weekly=es_w, es_daily=es_d, es_hito=es_h,
            completada=t.get('percentComplete') == 100,
            checklist_total=total, checklist_marcados=max(0, total - activos),
            creada_at=_fecha(t.get('createdDateTime')), completada_at=_fecha(t.get('completedDateTime')),
        ))

    if existente:
        existente.delete()
    foto = Snapshot.objects.create(
        plan=plan, anio=semana.anio, semana=semana.numero, tipo=tipo_foto,
        tomado_at=ahora, sincronizacion=registro,
    )
    for fila in filas:
        fila.snapshot = foto
    TareaSnapshot.objects.bulk_create(filas)

    if sin_etiqueta:
        incidencias.append((I.Tipo.SIN_ETIQUETA, I.Severidad.ALERTA,
                            f'{sin_etiqueta} tarea(s) de {semana.etiqueta} sin WEEKLY, DAILY ni HITO. Excluidas.'))
    if sin_checklist:
        incidencias.append((I.Tipo.SIN_CHECKLIST, I.Severidad.ALERTA,
                            f'{sin_checklist} tarea(s) DAILY sin ítems: no cuentan para % Daily.'))
    if len(hitos) > 1:
        incidencias.append((I.Tipo.VARIOS_HITOS, I.Severidad.ALERTA,
                            f'{len(hitos)} tareas HITO en {semana.etiqueta}: se valida una sola por semana.'))
    if de_la_semana and not hitos:
        incidencias.append((I.Tipo.SIN_HITO, I.Severidad.ALERTA, f'Sin tarea HITO en {semana.etiqueta}.'))

    _actualizar_hito(plan.colaborador, semana, hitos)
    return True, incidencias, len(filas)


def _actualizar_hito(colaborador, semana: Semana, hitos: list[dict]) -> None:
    """Deja registrado el Hito de la semana para que el líder lo valide."""
    validacion, _ = ValidacionHito.objects.get_or_create(
        colaborador=colaborador, anio=semana.anio, semana=semana.numero,
        defaults={'estado': EstadoHito.PENDIENTE if hitos else EstadoHito.SIN_REGISTRAR},
    )
    validacion.texto = ' · '.join((h.get('title') or '').strip() for h in hitos)[:500]
    validacion.task_ids = [h['id'] for h in hitos]
    # Lo ya validado no se toca; solo se mueve entre «pendiente» y «sin registrar».
    if validacion.estado == EstadoHito.SIN_REGISTRAR and hitos:
        validacion.estado = EstadoHito.PENDIENTE
    elif validacion.estado == EstadoHito.PENDIENTE and not hitos:
        validacion.estado = EstadoHito.SIN_REGISTRAR
    validacion.save()


def _registrar_incidencias(detectadas, semana: Semana) -> None:
    """
    Abre lo que se detectó y cierra lo que ya no aparece.

    Una incidencia es la misma si coincide en tipo, plan, persona, semana y
    detalle: así no se duplica cada noche.
    """
    ahora = timezone.now()
    vistas = set()
    for plan, persona, (tipo, severidad, detalle) in detectadas:
        incidencia, _ = IncidenciaCalidad.objects.get_or_create(
            tipo=tipo, plan=plan, colaborador=persona, anio=semana.anio, semana=semana.numero,
            detalle=detalle[:500], abierta=True, defaults={'severidad': severidad},
        )
        vistas.add(incidencia.pk)
    # Los planes duplicados los detecta el inventario, no la lectura semanal.
    IncidenciaCalidad.objects.filter(abierta=True).exclude(pk__in=vistas).exclude(
        tipo=IncidenciaCalidad.Tipo.PLAN_DUPLICADO
    ).update(abierta=False, resuelta_at=ahora)
