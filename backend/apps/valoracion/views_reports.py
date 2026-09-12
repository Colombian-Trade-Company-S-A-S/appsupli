"""
Informes de la valoración: dashboard, consolidado individual y exportes.

Todo aquí se calcula sobre el **consolidado** de cada persona, nunca sobre
calificaciones sueltas: una persona con 5 evaluadores es una fila, no cinco.
"""
import csv
from collections import Counter
from datetime import datetime, time

from django.contrib.auth import get_user_model
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from . import scoring
from .api_permissions import CanViewDashboard, HasValuationApp
from .models import ActionPlan, Cycle, EvaluationType, Level, Result, level_for
from .serializers import ActionPlanSerializer, ResultSerializer

User = get_user_model()

INFORMES = [HasValuationApp, CanViewDashboard]


def _parse_date(value: str, end_of_day: bool = False):
    """Convierte un `<input type="date">` (YYYY-MM-DD) en datetime aware."""
    if not value:
        return None
    try:
        dia = datetime.strptime(value, '%Y-%m-%d').date()
    except ValueError:
        return None
    momento = datetime.combine(dia, time.max if end_of_day else time.min)
    return timezone.make_aware(momento, timezone.get_current_timezone())


def filtered_results(request, base_qs=None):
    """Aplica toda la segmentación sobre los resultados.

    Segmenta por: ciclo, fechas, área, equipo (jefe directo), rol, cargo,
    persona, tipo de evaluación y semáforo consolidado. Devuelve
    `(resultados, consolidado, filtros)`.

    El semáforo se aplica al final, sobre el consolidado: filtrar antes
    dejaría fuera ciclos que sí forman parte del número que se muestra.
    """
    qs = base_qs if base_qs is not None else Result.objects.all()
    qs = qs.select_related('cycle', 'evaluatee', 'evaluatee__area', 'evaluatee__manager')

    params = request.query_params
    filtros = {
        clave: (params.get(clave) or '').strip()
        for clave in (
            'cycle',
            'area',
            'team',
            'kind',
            'position',
            'person',
            'evaluation_type',
            'level',
            'date_from',
            'date_to',
        )
    }

    if filtros['cycle'].isdigit():
        qs = qs.filter(cycle_id=int(filtros['cycle']))
    if filtros['area'].isdigit():
        qs = qs.filter(evaluatee__area_id=int(filtros['area']))
    if filtros['team'].isdigit():
        qs = qs.filter(evaluatee__manager_id=int(filtros['team']))
    if filtros['kind']:
        qs = qs.filter(evaluatee__kind=filtros['kind'])
    if filtros['position']:
        qs = qs.filter(evaluatee__position=filtros['position'])
    if filtros['person'].isdigit():
        qs = qs.filter(evaluatee_id=int(filtros['person']))
    if filtros['evaluation_type'] in EvaluationType.values:
        qs = qs.filter(evaluation_type=filtros['evaluation_type'])

    desde = _parse_date(filtros['date_from'])
    hasta = _parse_date(filtros['date_to'], end_of_day=True)
    if desde:
        qs = qs.filter(cycle__start_date__gte=desde)
    if hasta:
        qs = qs.filter(cycle__start_date__lte=hasta)

    if filtros['level'] not in Level.values:
        filtros['level'] = ''

    resultados = list(qs)
    consolidado = scoring.consolidate_people(resultados)

    if filtros['level']:
        consolidado = [c for c in consolidado if c['level'] == filtros['level']]
        vigentes = {c['person_id'] for c in consolidado}
        resultados = [r for r in resultados if r.evaluatee_id in vigentes]

    return resultados, consolidado, filtros


def _average(values):
    return round(sum(values) / len(values), 1) if values else 0.0


@api_view(['GET'])
@permission_classes(INFORMES)
def dashboard(request):
    """Foto de la compañía: promedio, semáforo, evolución y segmentación."""
    resultados, consolidado, filtros = filtered_results(request)

    promedio = _average([c['percentage'] for c in consolidado])
    # Líder = quien fue evaluado con el modelo de liderazgo, no el tipo de
    # usuario de su cuenta: así lo contaba el módulo anterior.
    lideres = [c for c in consolidado if c['evaluation_type'] == EvaluationType.LEADER]

    conteo = Counter(c['level'] for c in consolidado)
    base = len(consolidado)
    distribucion = [
        {
            'level': nivel,
            'label': etiqueta,
            'count': conteo.get(nivel, 0),
            'percentage': round(conteo.get(nivel, 0) / base * 100) if base else 0,
        }
        for nivel, etiqueta in Level.choices
    ]

    # Evolución histórica: promedio de cada ciclo, en orden cronológico.
    por_ciclo: dict[int, dict] = {}
    for resultado in resultados:
        fila = por_ciclo.setdefault(
            resultado.cycle_id,
            {'cycle': resultado.cycle.name, 'date': resultado.cycle.start_date, 'values': []},
        )
        fila['values'].append(float(resultado.percentage))
    evolucion = sorted(
        (
            {
                'cycle': fila['cycle'],
                'date': fila['date'],
                'average': _average(fila['values']),
                'count': len(fila['values']),
            }
            for fila in por_ciclo.values()
        ),
        key=lambda e: e['date'],
    )
    tendencia = (
        round(evolucion[-1]['average'] - evolucion[-2]['average'], 1)
        if len(evolucion) >= 2
        else 0.0
    )

    fortalezas, brechas = Counter(), Counter()
    for resultado in resultados:
        fortalezas.update(resultado.strengths or [])
        brechas.update(resultado.gaps or [])

    return Response(
        {
            'filters': filtros,
            'totals': {
                'results': len(resultados),
                'people': len(consolidado),
                'ratings': sum(c['evaluations'] for c in consolidado),
                'cycles': len(por_ciclo),
            },
            'company_average': promedio,
            'company_level': level_for(promedio),
            'company_level_label': Level(level_for(promedio)).label,
            'leaders_average': _average([c['percentage'] for c in lideres]),
            'leaders_count': len(lideres),
            'trend': tendencia,
            'distribution': distribucion,
            'by_area': scoring.group_consolidated(consolidado, 'area_id', 'area'),
            'by_kind': scoring.group_consolidated(consolidado, 'kind', 'kind_label'),
            'by_team': scoring.group_consolidated(consolidado, 'manager_id', 'manager'),
            'by_position': scoring.group_consolidated(consolidado, 'position', 'position'),
            'competencies': scoring.organizational_competencies(resultados),
            'evolution': evolucion,
            'top_performers': consolidado[:8],
            'lowest_performers': list(reversed(consolidado[-8:])) if consolidado else [],
            'top_strengths': [
                {'statement': texto, 'count': veces} for texto, veces in fortalezas.most_common(6)
            ],
            'top_gaps': [
                {'statement': texto, 'count': veces} for texto, veces in brechas.most_common(6)
            ],
        }
    )


@api_view(['GET'])
@permission_classes(INFORMES)
def consolidated(request):
    """Tabla completa: una fila por persona con su consolidado."""
    resultados, consolidado, filtros = filtered_results(request)
    return Response(
        {
            'filters': filtros,
            'items': consolidado,
            'total': len(consolidado),
            'average': _average([c['percentage'] for c in consolidado]),
            'competencies': scoring.organizational_competencies(resultados),
        }
    )


@api_view(['GET'])
@permission_classes(INFORMES)
def consolidated_items(request):
    """Detalle ítem por ítem: una fila por persona y pregunta."""
    resultados, _consolidado, filtros = filtered_results(request)
    filas = scoring.consolidated_items(resultados)
    return Response({'filters': filtros, 'items': filas, 'total': len(filas)})


@api_view(['GET'])
@permission_classes(INFORMES)
def person_dashboard(request, pk: int):
    """Ficha individual: evolución, competencias, ítems y planes de acción."""
    persona = get_object_or_404(User, pk=pk)
    base = Result.objects.filter(evaluatee=persona)
    resultados, consolidado, filtros = filtered_results(request, base)

    if not consolidado:
        return Response(
            {
                'person': {
                    'id': persona.pk,
                    'full_name': persona.full_name,
                    'position': persona.position,
                    'area': persona.area.name if persona.area_id else '',
                    'manager': persona.manager.full_name if persona.manager_id else '',
                },
                'filters': filtros,
                'consolidated': None,
                'results': [],
                'items': [],
                'action_plans': [],
            }
        )

    fila = consolidado[0]
    items = scoring.consolidated_items(resultados)
    ordenados = sorted(items, key=lambda i: i['average'], reverse=True)
    planes = ActionPlan.objects.filter(result__evaluatee=persona).select_related(
        'result', 'result__cycle', 'result__evaluatee', 'owner', 'created_by'
    )

    return Response(
        {
            'person': {
                'id': persona.pk,
                'full_name': persona.full_name,
                'position': persona.position,
                'area': persona.area.name if persona.area_id else '',
                'manager': persona.manager.full_name if persona.manager_id else '',
                'kind': persona.kind,
                'email': persona.email,
            },
            'filters': filtros,
            'consolidated': fila,
            'results': ResultSerializer(
                sorted(resultados, key=lambda r: r.cycle.start_date, reverse=True), many=True
            ).data,
            'items': items,
            'best_items': ordenados[:5],
            'worst_items': list(reversed(ordenados[-5:])) if ordenados else [],
            'action_plans': ActionPlanSerializer(planes, many=True).data,
        }
    )


# ── Exportes ───────────────────────────────────────────────────────────────

def _csv_response(nombre: str, encabezados: list[str], filas) -> HttpResponse:
    """CSV con BOM para que Excel respete los acentos."""
    marca = timezone.localtime().strftime('%Y%m%d-%H%M')
    respuesta = HttpResponse(content_type='text/csv; charset=utf-8-sig')
    respuesta['Content-Disposition'] = f'attachment; filename="{nombre}-{marca}.csv"'
    respuesta.write('﻿')
    escritor = csv.writer(respuesta, delimiter=';')
    escritor.writerow(encabezados)
    escritor.writerows(filas)
    return respuesta


@api_view(['GET'])
@permission_classes(INFORMES)
def export_consolidated(request):
    """El consolidado por persona, con la segmentación aplicada."""
    _resultados, consolidado, _filtros = filtered_results(request)
    filas = (
        [
            fila['person'],
            fila['email'],
            fila['area'],
            fila['position'],
            fila['kind_label'],
            fila['manager'],
            fila['cycles'],
            fila['evaluations'],
            str(fila['percentage']).replace('.', ','),
            str(fila['score']).replace('.', ','),
            Level(fila['level']).label,
            fila['manager_average'] or '',
            fila['team_average'] or '',
            fila['self_average'] or '',
            fila['trend'],
            fila['cycle_names'],
        ]
        for fila in consolidado
    )
    return _csv_response(
        'valoracion-consolidado',
        [
            'Persona',
            'Correo',
            'Área',
            'Cargo',
            'Rol',
            'Jefe directo',
            'Ciclos',
            'Calificaciones',
            '% consolidado',
            'Puntaje (5)',
            'Semáforo',
            'Prom. jefe',
            'Prom. equipo',
            'Autoevaluación',
            'Tendencia',
            'Ciclos incluidos',
        ],
        filas,
    )


@api_view(['GET'])
@permission_classes(INFORMES)
def export_items(request):
    """El detalle ítem por ítem, con la segmentación aplicada."""
    resultados, _consolidado, _filtros = filtered_results(request)
    filas = (
        [
            fila['person'],
            fila['area'],
            fila['position'],
            fila['manager'],
            fila['cycle'],
            fila['competency'],
            fila['statement'],
            fila['answers_count'],
            str(fila['average']).replace('.', ','),
            str(fila['percentage']).replace('.', ','),
            Level(fila['level']).label,
            fila['manager_average'] or '',
            fila['team_average'] or '',
            fila['self_average'] or '',
        ]
        for fila in scoring.consolidated_items(resultados)
    )
    return _csv_response(
        'valoracion-items',
        [
            'Persona',
            'Área',
            'Cargo',
            'Jefe directo',
            'Ciclo',
            'Competencia',
            'Ítem',
            'Calificaciones',
            'Promedio (5)',
            'Porcentaje',
            'Semáforo',
            'Prom. jefe',
            'Prom. equipo',
            'Autoevaluación',
        ],
        filas,
    )


@api_view(['GET'])
@permission_classes(INFORMES)
def cycles_summary(request):
    """Resumen por ciclo para el selector de informes."""
    filas = []
    for ciclo in Cycle.objects.order_by('-start_date'):
        resultados = list(ciclo.results.all())
        filas.append(
            {
                'id': ciclo.id,
                'name': ciclo.name,
                'status': ciclo.effective_status,
                'status_label': ciclo.effective_status_display,
                'start_date': ciclo.start_date,
                'end_date': ciclo.end_date,
                'people': len(resultados),
                'average': _average([float(r.percentage) for r in resultados]),
            }
        )
    return Response({'items': filas, 'total': len(filas)})
