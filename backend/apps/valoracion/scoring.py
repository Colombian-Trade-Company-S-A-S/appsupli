"""
Motor de cálculo de la valoración.

Dos niveles de consolidación, y el orden importa:

1. `recompute_result()` — dentro de UN ciclo. Reúne todas las calificaciones
   que recibió una persona, las promedia por rol del evaluador (jefe / equipo /
   autoevaluación) y las pondera según los pesos del ciclo. La persona queda
   con un solo `Result` por ciclo, nunca con una fila por evaluador.

2. `consolidate_people()` — ENTRE ciclos. Pondera los resultados de cada ciclo
   por la cantidad de calificaciones que aportó, de modo que una persona
   evaluada en varios ciclos ve un único porcentaje consolidado. Ejemplo: 1
   calificación al 60% y 4 al 90% → 84% con 5 calificaciones.

La autoevaluación se guarda como referencia y solo entra al puntaje cuando no
hay ninguna mirada externa.
"""
from collections import defaultdict

from django.db.models import Q

from .models import (
    LIKERT_LABELS,
    Answer,
    Assignment,
    AssignmentStatus,
    CycleStatus,
    EvaluationType,
    EvaluatorRole,
    Level,
    QuestionType,
    Result,
    level_for,
)


def average(values):
    return sum(values) / len(values) if values else None


def weighted_average(pairs) -> float:
    """Promedio ponderado sobre una lista de (valor, peso)."""
    total_weight = sum(weight for _v, weight in pairs)
    if not total_weight:
        values = [v for v, _w in pairs]
        return sum(values) / len(values) if values else 0.0
    return sum(value * weight for value, weight in pairs) / total_weight


def _round(value, digits=1):
    return round(value, digits) if value is not None else None


# ───────────────────────────────────────────────────────────────────────────
# Nivel 1: dentro de un ciclo
# ───────────────────────────────────────────────────────────────────────────

def assignment_score(assignment: Assignment) -> float:
    """Puntaje 0-100 de una asignación, ponderado por el peso de cada pregunta."""
    answers = Answer.objects.filter(assignment=assignment).select_related('question')
    weighted_sum = 0.0
    max_sum = 0.0
    for answer in answers:
        if answer.question.question_type != QuestionType.LIKERT or answer.value is None:
            continue
        weight = float(answer.question.weight or 1)
        weighted_sum += float(answer.value) * weight
        max_sum += 5.0 * weight
    if max_sum == 0:
        return 0.0
    return weighted_sum / max_sum * 100.0


def item_detail(cycle, evaluatee, assignments=None):
    """Detalle ítem por ítem de un evaluado en un ciclo.

    Devuelve `(items, competencies)`:
      · items — una fila por pregunta con el promedio global, el desagregado
        por rol del evaluador y la distribución de calificaciones recibidas.
      · competencies — el promedio agrupado por competencia.
    """
    if assignments is None:
        assignments = list(
            Assignment.objects.filter(
                cycle=cycle,
                evaluatee=evaluatee,
                status=AssignmentStatus.COMPLETED,
                is_active=True,
            ).select_related('evaluator')
        )
    if not assignments:
        return [], []

    role_by_assignment = {a.id: a.evaluator_role for a in assignments}
    answers = Answer.objects.filter(assignment__in=assignments).select_related(
        'question', 'question__competency'
    )

    acc: dict[int, dict] = {}
    for answer in answers:
        if answer.question.question_type != QuestionType.LIKERT or answer.value is None:
            continue
        bucket = acc.setdefault(
            answer.question_id,
            {
                'question': answer.question,
                'all': [],
                'manager': [],
                'team': [],
                'self': [],
                'dist': {1: 0, 2: 0, 3: 0, 4: 0, 5: 0},
            },
        )
        value = int(answer.value)
        bucket['all'].append(value)
        bucket['dist'][value] = bucket['dist'].get(value, 0) + 1
        role = role_by_assignment.get(answer.assignment_id)
        if role == EvaluatorRole.MANAGER:
            bucket['manager'].append(value)
        elif role == EvaluatorRole.TEAM:
            bucket['team'].append(value)
        elif role == EvaluatorRole.SELF:
            bucket['self'].append(value)

    items = []
    for bucket in acc.values():
        question = bucket['question']
        avg = average(bucket['all']) or 0.0
        avg_manager = average(bucket['manager'])
        avg_team = average(bucket['team'])
        avg_self = average(bucket['self'])
        external = average(bucket['manager'] + bucket['team'])
        # Brecha de autopercepción: cuánto se sobre/subvalora frente al resto.
        self_gap = (
            round(avg_self - external, 2) if avg_self is not None and external is not None else None
        )
        percentage = avg / 5.0 * 100.0
        level = level_for(percentage)
        items.append(
            {
                'question_id': question.id,
                'competency_code': question.competency.code,
                'competency_name': question.competency.name,
                'competency_label': question.competency.label,
                'competency_order': question.competency.order,
                'order': question.order,
                'statement': question.statement,
                'weight': float(question.weight or 1),
                'answers_count': len(bucket['all']),
                'average': round(avg, 2),
                'percentage': round(percentage, 1),
                'level': level,
                'level_label': Level(level).label,
                'scale_label': LIKERT_LABELS.get(int(round(avg)), ''),
                'manager_average': _round(avg_manager, 2),
                'team_average': _round(avg_team, 2),
                'self_average': _round(avg_self, 2),
                'manager_count': len(bucket['manager']),
                'team_count': len(bucket['team']),
                'self_count': len(bucket['self']),
                'self_gap': self_gap,
                'distribution': [
                    {'value': v, 'label': LIKERT_LABELS[v], 'count': bucket['dist'].get(v, 0)}
                    for v in (5, 4, 3, 2, 1)
                ],
            }
        )
    items.sort(
        key=lambda i: (i['competency_order'], i['competency_code'], i['order'], i['question_id'])
    )

    grouped: dict[str, dict] = {}
    for item in items:
        bucket = grouped.setdefault(
            item['competency_label'],
            {
                'code': item['competency_code'],
                'name': item['competency_name'],
                'label': item['competency_label'],
                'order': item['competency_order'],
                'sum': 0.0,
                'weight': 0.0,
                'items': 0,
                'answers': 0,
            },
        )
        bucket['sum'] += item['average'] * item['weight']
        bucket['weight'] += item['weight']
        bucket['items'] += 1
        bucket['answers'] += item['answers_count']

    competencies = []
    for bucket in grouped.values():
        avg = bucket['sum'] / bucket['weight'] if bucket['weight'] else 0.0
        percentage = avg / 5.0 * 100.0
        level = level_for(percentage)
        competencies.append(
            {
                'code': bucket['code'],
                'name': bucket['name'],
                'label': bucket['label'],
                'order': bucket['order'],
                'average': round(avg, 2),
                'percentage': round(percentage, 1),
                'level': level,
                'level_label': Level(level).label,
                'items': bucket['items'],
                'answers': bucket['answers'],
            }
        )
    competencies.sort(key=lambda c: (c['order'], c['code']))
    return items, competencies


def recompute_result(cycle, evaluatee):
    """Calcula y guarda el `Result` de una persona en un ciclo.

    Si no queda ninguna evaluación completada, borra el resultado: un
    consolidado sin calificaciones detrás no debe seguir publicado.
    """
    assignments = list(
        Assignment.objects.filter(
            cycle=cycle, evaluatee=evaluatee, status=AssignmentStatus.COMPLETED, is_active=True
        ).select_related('evaluator')
    )
    if not assignments:
        Result.objects.filter(cycle=cycle, evaluatee=evaluatee).delete()
        return None

    types = {a.evaluation_type for a in assignments}
    evaluation_type = (
        EvaluationType.LEADER if EvaluationType.LEADER in types else next(iter(types))
    )

    manager_scores, team_scores, self_scores = [], [], []
    for assignment in assignments:
        score = assignment_score(assignment)
        if assignment.evaluator_role == EvaluatorRole.MANAGER:
            manager_scores.append(score)
        elif assignment.evaluator_role == EvaluatorRole.TEAM:
            team_scores.append(score)
        elif assignment.evaluator_role == EvaluatorRole.SELF:
            self_scores.append(score)

    avg_manager = average(manager_scores) or 0.0
    avg_team = average(team_scores) or 0.0
    avg_self = average(self_scores) or 0.0

    if evaluation_type == EvaluationType.LEADER and manager_scores and team_scores:
        # Liderazgo 180°: la mirada del jefe y la del equipo pesan distinto.
        percentage = (
            avg_manager * (cycle.manager_weight or 60) / 100.0
            + avg_team * (cycle.team_weight or 40) / 100.0
        )
    elif manager_scores and team_scores:
        percentage = (avg_manager + avg_team) / 2.0
    elif manager_scores:
        percentage = avg_manager
    elif team_scores:
        percentage = avg_team
    else:
        # Solo hay autoevaluación: se usa como referencia.
        percentage = avg_self

    percentage = round(percentage, 2)
    items, competencies = item_detail(cycle, evaluatee, assignments)

    strengths = [
        item['statement'][:120]
        for item in sorted(items, key=lambda i: i['average'], reverse=True)
        if item['average'] >= 4
    ][:5]
    gaps = [
        item['statement'][:120]
        for item in sorted(items, key=lambda i: i['average'])
        if item['average'] <= 2.5
    ][:5]

    result, _ = Result.objects.update_or_create(
        cycle=cycle,
        evaluatee=evaluatee,
        defaults={
            'evaluation_type': evaluation_type,
            'score': round(percentage / 100.0 * 5.0, 2),
            'percentage': percentage,
            'level': level_for(percentage),
            'manager_score': round(avg_manager, 2),
            'team_score': round(avg_team, 2),
            'self_score': round(avg_self, 2),
            'evaluators_total': len(assignments),
            'evaluators_manager': len(manager_scores),
            'evaluators_team': len(team_scores),
            'evaluators_self': len(self_scores),
            'competency_detail': competencies,
            'strengths': strengths,
            'gaps': gaps,
        },
    )
    return result


def recompute_cycle(cycle) -> int:
    """Recalcula el resultado de todas las personas evaluadas en el ciclo."""
    evaluatee_ids = (
        Assignment.objects.filter(
            cycle=cycle, status=AssignmentStatus.COMPLETED, is_active=True
        )
        .values_list('evaluatee_id', flat=True)
        .distinct()
    )
    from django.contrib.auth import get_user_model

    procesados = 0
    for evaluatee in get_user_model().objects.filter(id__in=list(evaluatee_ids)):
        if recompute_result(cycle, evaluatee):
            procesados += 1
    return procesados


# ───────────────────────────────────────────────────────────────────────────
# Nivel 2: entre ciclos
# ───────────────────────────────────────────────────────────────────────────

def _person_row(person):
    """Datos de segmentación de una persona (área, cargo, rol, equipo)."""
    return {
        'person_id': person.pk,
        'person': person.full_name,
        'email': person.email,
        'area': person.area.name if person.area_id else 'Sin área',
        'area_id': person.area_id,
        'position': person.position or 'Sin cargo',
        'kind': person.kind,
        'kind_label': person.get_kind_display(),
        'manager': person.manager.full_name if person.manager_id else 'Sin jefe',
        'manager_id': person.manager_id,
    }


def consolidate_people(results):
    """Un único consolidado por persona a partir de sus `Result` de varios ciclos."""
    groups = defaultdict(list)
    for result in results:
        groups[result.evaluatee_id].append(result)

    consolidated = []
    for rows in groups.values():
        rows.sort(key=lambda r: r.cycle.start_date)
        person = rows[0].evaluatee

        def weight_of(result):
            # Un ciclo pesa lo que pesan las calificaciones que lo respaldan.
            return max(int(result.evaluators_total or 0), 1)

        percentage = weighted_average([(float(r.percentage), weight_of(r)) for r in rows])

        pairs_manager = [
            (float(r.manager_score), int(r.evaluators_manager))
            for r in rows
            if (r.evaluators_manager or 0) > 0
        ]
        pairs_team = [
            (float(r.team_score), int(r.evaluators_team))
            for r in rows
            if (r.evaluators_team or 0) > 0
        ]
        pairs_self = [
            (float(r.self_score), int(r.evaluators_self))
            for r in rows
            if (r.evaluators_self or 0) > 0
        ]

        trend = 0.0
        if len(rows) >= 2:
            trend = round(float(rows[-1].percentage) - float(rows[-2].percentage), 1)

        # Competencias a lo largo de los ciclos, ponderadas igual que el total.
        by_competency: dict[str, dict] = {}
        for result in rows:
            for competency in result.competency_detail or []:
                key = competency.get('label') or competency.get('name') or ''
                bucket = by_competency.setdefault(
                    key,
                    {
                        'code': competency.get('code', ''),
                        'name': competency.get('name', ''),
                        'label': key,
                        'order': competency.get('order', 0),
                        'pairs': [],
                    },
                )
                bucket['pairs'].append((float(competency.get('average') or 0), weight_of(result)))

        competencies = []
        for bucket in by_competency.values():
            avg = weighted_average(bucket['pairs'])
            pct = avg / 5.0 * 100.0
            competencies.append(
                {
                    'code': bucket['code'],
                    'name': bucket['name'],
                    'label': bucket['label'],
                    'order': bucket['order'],
                    'average': round(avg, 2),
                    'percentage': round(pct, 1),
                    'level': level_for(pct),
                }
            )
        competencies.sort(key=lambda c: (c['order'], c['code']))

        last = rows[-1]
        level = level_for(percentage)
        consolidated.append(
            {
                **_person_row(person),
                'evaluation_type': last.evaluation_type,
                'cycles': len(rows),
                'cycle_names': ', '.join(r.cycle.name for r in rows),
                'last_cycle': last.cycle.name,
                'evaluations': sum(int(r.evaluators_total or 0) for r in rows),
                'percentage': round(percentage, 1),
                'score': round(percentage / 100.0 * 5.0, 2),
                'level': level,
                'level_label': Level(level).label,
                'manager_average': (
                    _round(weighted_average(pairs_manager)) if pairs_manager else None
                ),
                'team_average': _round(weighted_average(pairs_team)) if pairs_team else None,
                'self_average': _round(weighted_average(pairs_self)) if pairs_self else None,
                'manager_count': sum(int(r.evaluators_manager or 0) for r in rows),
                'team_count': sum(int(r.evaluators_team or 0) for r in rows),
                'self_count': sum(int(r.evaluators_self or 0) for r in rows),
                'trend': trend,
                'competencies': competencies,
                'result_ids': [r.id for r in rows],
                'history': [
                    {
                        'cycle': r.cycle.name,
                        'cycle_id': r.cycle_id,
                        'result_id': r.id,
                        'percentage': float(r.percentage),
                        'level': r.level,
                        'evaluators': r.evaluators_total,
                    }
                    for r in rows
                ],
            }
        )

    consolidated.sort(key=lambda c: c['percentage'], reverse=True)
    return consolidated


def group_consolidated(consolidated, key_field, label_field):
    """Promedio del consolidado individual agrupado por una dimensión."""
    acc = defaultdict(list)
    labels = {}
    for row in consolidated:
        acc[row[key_field]].append(row['percentage'])
        labels[row[key_field]] = row[label_field]

    groups = []
    for key, values in acc.items():
        avg = round(sum(values) / len(values), 1)
        groups.append(
            {
                'key': key,
                'label': labels.get(key) or 'Sin asignar',
                'average': avg,
                'count': len(values),
                'level': level_for(avg),
            }
        )
    groups.sort(key=lambda g: g['average'], reverse=True)
    return groups


def organizational_competencies(results):
    """Promedio por competencia sobre el conjunto filtrado de resultados."""
    acc: dict[str, dict] = {}
    for result in results:
        weight = max(int(result.evaluators_total or 0), 1)
        for competency in result.competency_detail or []:
            key = competency.get('label') or competency.get('name') or ''
            bucket = acc.setdefault(
                key,
                {
                    'label': key,
                    'code': competency.get('code', ''),
                    'name': competency.get('name', ''),
                    'order': competency.get('order', 0),
                    'pairs': [],
                    'people': set(),
                },
            )
            bucket['pairs'].append((float(competency.get('average') or 0), weight))
            bucket['people'].add(result.evaluatee_id)

    rows = []
    for bucket in acc.values():
        avg = weighted_average(bucket['pairs'])
        pct = avg / 5.0 * 100.0
        rows.append(
            {
                'label': bucket['label'],
                'code': bucket['code'],
                'name': bucket['name'],
                'average': round(avg, 2),
                'percentage': round(pct, 1),
                'level': level_for(pct),
                'people': len(bucket['people']),
            }
        )
    rows.sort(key=lambda r: r['percentage'], reverse=True)
    return rows


def consolidated_items(results):
    """Detalle ítem por ítem del conjunto filtrado: una fila por persona/pregunta.

    Se resuelve en pocas consultas para que la exportación no degrade.
    """
    pairs = {(r.cycle_id, r.evaluatee_id) for r in results}
    if not pairs:
        return []

    assignments = [
        a
        for a in Assignment.objects.filter(
            cycle_id__in={c for c, _e in pairs},
            evaluatee_id__in={e for _c, e in pairs},
            status=AssignmentStatus.COMPLETED,
            is_active=True,
        ).select_related('cycle', 'evaluatee', 'evaluatee__area', 'evaluatee__manager')
        if (a.cycle_id, a.evaluatee_id) in pairs
    ]
    if not assignments:
        return []

    info = {a.id: (a.cycle, a.evaluatee, a.evaluator_role) for a in assignments}
    answers = Answer.objects.filter(assignment_id__in=info.keys()).select_related(
        'question', 'question__competency'
    )

    acc: dict[tuple, dict] = {}
    for answer in answers:
        if answer.question.question_type != QuestionType.LIKERT or answer.value is None:
            continue
        cycle, evaluatee, role = info[answer.assignment_id]
        bucket = acc.setdefault(
            (evaluatee.pk, cycle.pk, answer.question_id),
            {
                'evaluatee': evaluatee,
                'cycle': cycle,
                'question': answer.question,
                'all': [],
                'manager': [],
                'team': [],
                'self': [],
            },
        )
        value = int(answer.value)
        bucket['all'].append(value)
        if role == EvaluatorRole.MANAGER:
            bucket['manager'].append(value)
        elif role == EvaluatorRole.TEAM:
            bucket['team'].append(value)
        elif role == EvaluatorRole.SELF:
            bucket['self'].append(value)

    rows = []
    for bucket in acc.values():
        avg = average(bucket['all']) or 0.0
        pct = avg / 5.0 * 100.0
        rows.append(
            {
                **_person_row(bucket['evaluatee']),
                'cycle': bucket['cycle'].name,
                'competency': bucket['question'].competency.label,
                'statement': bucket['question'].statement,
                'answers_count': len(bucket['all']),
                'average': round(avg, 2),
                'percentage': round(pct, 1),
                'level': level_for(pct),
                'manager_average': _round(average(bucket['manager']), 2),
                'team_average': _round(average(bucket['team']), 2),
                'self_average': _round(average(bucket['self']), 2),
            }
        )
    rows.sort(key=lambda r: (r['person'], r['competency'], r['statement']))
    return rows


def answered_count(assignment) -> int:
    """Preguntas con contenido dentro de una asignación (valor o texto)."""
    return Answer.objects.filter(
        Q(value__isnull=False) | ~Q(text=''), assignment=assignment
    ).count()


def progress_snapshot() -> dict:
    """Avance de respuestas de los ciclos en curso.

    Incluye los ciclos vencidos que siguen marcados 'activo' — es justo cuando
    hace falta ver el avance para decidir si se publican los resultados — y
    excluye los que aún no arrancan, que solo diluirían el porcentaje.
    """
    from django.utils import timezone

    qs = Assignment.objects.filter(
        is_active=True, cycle__status=CycleStatus.ACTIVE, cycle__start_date__lte=timezone.now()
    )
    total = qs.count()
    completed = qs.filter(status=AssignmentStatus.COMPLETED).count()
    return {
        'total': total,
        'completed': completed,
        'pending': total - completed,
        'percentage': round(completed * 100.0 / total, 1) if total else 0.0,
        'complete': total > 0 and completed == total,
    }
