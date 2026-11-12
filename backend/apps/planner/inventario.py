"""
Inventario de planes (paso 3 de la guía): descubre todos los planes de la
empresa y propone a quién pertenece cada uno.

Recorre los grupos de Microsoft 365, guarda cada plan con su ID y su grupo, y
relaciona con su persona los que tienen el nombre de alguien («Laura
Ayala-2026»): nadie se asigna las tareas de su propio plan, así que el nombre
es la única pista. People revisa y corrige la relación desde la pantalla.

Nunca cambia una relación que ya existe.
"""
from __future__ import annotations

import re
import unicodedata
from collections import defaultdict

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.accounts.models import User
from apps.performance.api_permissions import asesores_y_promotores

from .graph import GraphClient, GraphError
from .models import IncidenciaCalidad, PlanPlanner, Sincronizacion

RELLENO = {'copia', 'de', 'del', 'la', 'plan', 'lo', '2025', '2026', '2027', '2028'}


def _normalizar(texto: str) -> str:
    texto = unicodedata.normalize('NFKD', texto or '').encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9 ]', ' ', texto)


def fichas(texto: str) -> set[str]:
    """Las palabras que identifican a alguien: sin tildes, años ni relleno."""
    return {t for t in _normalizar(texto).split() if len(t) > 1 and t not in RELLENO}


def persona_del_titulo(titulo: str, personas: list[User]) -> tuple[User | None, str]:
    """
    A quién pertenece un plan por su nombre.

    Exacta: todas las palabras del título están en el nombre de una sola
    persona y son al menos dos («Laura Ayala» → Laura Catalina Ayala Parra).
    Con una sola palabra o varias personas posibles, no se relaciona.
    """
    palabras = fichas(titulo)
    if len(palabras) < 2:
        return None, 'Sin coincidencia' if not palabras else 'Solo un nombre'
    candidatos = [p for p in personas if palabras <= fichas(f'{p.first_name} {p.last_name}')]
    if len(candidatos) == 1:
        return candidatos[0], 'Exacta'
    return None, 'Ambigua' if candidatos else 'Sin coincidencia'


def descubrir_planes(cliente: GraphClient | None = None, ejecutada_por=None,
                     vincular: bool = True, simular: bool = False) -> Sincronizacion:
    cliente = cliente or GraphClient()
    registro = Sincronizacion(tipo=Sincronizacion.Tipo.INVENTARIO, ejecutada_por=ejecutada_por)
    if not simular:
        registro.save()
    try:
        grupos = cliente.grupos()
        respuestas = cliente.lote([f"/groups/{g['id']}/planner/plans" for g in grupos])
    except GraphError as e:
        registro.estado = Sincronizacion.Estado.ERROR
        registro.error = str(e)
        registro.terminada_at = timezone.now()
        if not simular:
            registro.save()
        return registro

    encontrados, errores = [], []
    for grupo, respuesta in zip(grupos, respuestas):
        if not respuesta.ok:
            errores.append({'grupo': grupo['displayName'], 'error': respuesta.error})
            continue
        for plan in respuesta.cuerpo.get('value', []):
            encontrados.append((grupo, plan))

    personas = list(
        User.objects.filter(is_active=True).exclude(asesores_y_promotores())
        .only('id', 'first_name', 'last_name')
    )
    propuestas: dict[int, list[str]] = defaultdict(list)
    resumen = {'grupos': len(grupos), 'planes': len(encontrados), 'nuevos': 0, 'vinculados': 0,
               'personas_con_varios': 0}

    with transaction.atomic():
        existentes = {p.plan_id: p for p in PlanPlanner.objects.all()}
        for grupo, datos in encontrados:
            plan = existentes.get(datos['id'])
            if plan is None:
                plan = PlanPlanner(plan_id=datos['id'], activo=True)
                resumen['nuevos'] += 1
            plan.titulo = (datos.get('title') or '').strip()[:255] or '(sin nombre)'
            plan.grupo_id = grupo['id']
            plan.grupo_nombre = grupo['displayName'][:255]
            if not simular:
                plan.save()
            existentes[datos['id']] = plan
            if vincular and plan.colaborador_id is None:
                persona, _ = persona_del_titulo(plan.titulo, personas)
                if persona:
                    propuestas[persona.id].append(plan.plan_id)

        if vincular and not simular:
            # Cada inventario vuelve a calcular los duplicados desde cero.
            IncidenciaCalidad.objects.filter(
                tipo=IncidenciaCalidad.Tipo.PLAN_DUPLICADO, abierta=True
            ).update(abierta=False, resuelta_at=timezone.now())
        if vincular:
            con_plan = set(
                PlanPlanner.objects.filter(activo=True, colaborador__isnull=False)
                .values_list('colaborador_id', flat=True)
            )
            for persona_id, plan_ids in propuestas.items():
                if persona_id in con_plan:
                    continue
                elegido = _el_mas_reciente(cliente, plan_ids)
                if len(plan_ids) > 1:
                    resumen['personas_con_varios'] += 1
                    if not simular:
                        _avisar_duplicado(persona_id, plan_ids, elegido, existentes)
                if not simular:
                    PlanPlanner.objects.filter(plan_id=elegido).update(colaborador_id=persona_id)
                resumen['vinculados'] += 1

    registro.resumen = resumen
    registro.errores = errores
    registro.planes_leidos = len(encontrados)
    registro.estado = Sincronizacion.Estado.PARCIAL if errores else Sincronizacion.Estado.OK
    registro.terminada_at = timezone.now()
    if not simular:
        registro.save()
    return registro


def _el_mas_reciente(cliente: GraphClient, plan_ids: list[str]) -> str:
    """Entre varios planes de la misma persona, el que tiene la tarea creada más recientemente."""
    if len(plan_ids) == 1:
        return plan_ids[0]
    respuestas = cliente.lote([f'/planner/plans/{p}/tasks?$select=createdDateTime' for p in plan_ids])
    mejor, fecha_mejor = plan_ids[0], None
    for plan_id, respuesta in zip(plan_ids, respuestas):
        fechas = [parse_datetime(t['createdDateTime']) for t in respuesta.cuerpo.get('value', [])
                  if respuesta.ok and t.get('createdDateTime')]
        ultima = max(fechas) if fechas else None
        if ultima and (fecha_mejor is None or ultima > fecha_mejor):
            mejor, fecha_mejor = plan_id, ultima
    return mejor


def _avisar_duplicado(persona_id, plan_ids, elegido, existentes) -> None:
    nombres = [existentes[p].titulo for p in plan_ids]
    IncidenciaCalidad.objects.get_or_create(
        tipo=IncidenciaCalidad.Tipo.PLAN_DUPLICADO,
        colaborador_id=persona_id,
        abierta=True,
        defaults={
            'severidad': IncidenciaCalidad.Severidad.ALERTA,
            'plan': existentes[elegido],
            'detalle': (f'{len(plan_ids)} planes para la misma persona ({", ".join(nombres)}). '
                        f'Se relacionó «{existentes[elegido].titulo}», el de uso más reciente.')[:500],
        },
    )
