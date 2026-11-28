"""
El plan de cada persona sale de su URL de Planner (Gestión de usuarios).

Ya no se descubren planes: People pega en la ficha de cada persona el enlace
de su plan y de ahí se saca el ID. Cambiar el enlace cambia el plan que se
mide; borrarlo deja a la persona sin plan.

Formatos que se reconocen:

    https://planner.cloud.microsoft/ui/web/plan/{id}/view/board?tid=…
    https://planner.cloud.microsoft/webui/plan/{id}/view/grid?tid=…
    https://tasks.office.com/{tenant}/Home/PlanViews/{id}?…
    https://tasks.office.com/{tenant}/es-ES/Home/Planner/#/plantaskboard?groupId=…&planId={id}
"""

from __future__ import annotations

import re

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.accounts.models import User

from .models import PlanPlanner

_ID = r'([A-Za-z0-9_-]{20,40})'
PATRONES = (
    re.compile(r'/plan/' + _ID + r'(?=[/?#]|$)'),
    re.compile(r'/PlanViews/' + _ID + r'(?=[/?#]|$)', re.IGNORECASE),
    re.compile(r'[?&#]planId=' + _ID, re.IGNORECASE),
)


def plan_id_de_url(url: str | None) -> str | None:
    """El ID del plan que hay en un enlace de Planner, o None si no se reconoce."""
    texto = (url or '').strip()
    for patron in PATRONES:
        coincide = patron.search(texto)
        if coincide:
            return coincide.group(1)
    return None


def duenos_de(plan_id: str, excepto: int | None = None):
    """Las personas activas que tienen ese plan en su URL."""
    return [
        u
        for u in User.objects.filter(is_active=True, planner_url__contains=plan_id).exclude(
            pk=excepto
        )
        if plan_id_de_url(u.planner_url) == plan_id
    ]


def vincular_plan(persona: User) -> PlanPlanner | None:
    """
    Deja como plan de la persona el de su URL. Sin URL (o inactiva), sin plan.

    El plan anterior queda inactivo: se conserva si ya tiene lecturas, para la
    historia. Si otra persona activa tiene el mismo enlace, no se relaciona.
    """
    plan_id = plan_id_de_url(persona.planner_url) if persona.is_active else None
    with transaction.atomic():
        anteriores = PlanPlanner.objects.filter(colaborador=persona, activo=True)
        if plan_id:
            anteriores = anteriores.exclude(plan_id=plan_id)
        anteriores.update(activo=False)
        if not plan_id:
            return None
        plan = PlanPlanner.objects.select_for_update().filter(plan_id=plan_id).first()
        if plan is None:
            plan = PlanPlanner(plan_id=plan_id, titulo='')
        elif plan.activo and plan.colaborador_id not in (None, persona.id):
            if any(u.id == plan.colaborador_id for u in duenos_de(plan_id, excepto=persona.id)):
                return None
        if plan.colaborador_id != persona.id or not plan.activo:
            plan.colaborador = persona
            plan.activo = True
            plan.accesible = True
            plan.error_lectura = ''
            plan.save()
        return plan


def reconciliar_planes() -> None:
    """
    Pone los planes al día con las URLs de todas las personas.

    Corre antes de cada lectura: cubre a quien se inactivó en Odoo y lo que
    haya cambiado fuera del formulario. Los planes que ya no son de nadie y
    nunca se leyeron se borran.

    Es lo mismo que `vincular_plan` persona por persona, en el mismo orden,
    pero leyendo personas y planes de una vez y guardando solo lo que cambia:
    persona por persona eran unas cinco consultas cada una (20 s contra la
    base de Render antes de empezar a leer Planner).
    """
    personas = list(
        User.objects.filter(Q(planner_url__gt='') | Q(planes_planner__activo=True))
        .distinct()
        .only('id', 'is_active', 'planner_url')
    )
    deseado = {p.pk: plan_id_de_url(p.planner_url) if p.is_active else None for p in personas}
    # Quién tiene cada plan en su URL (activos): a ellos no se les quita.
    duenos: dict[str, set[int]] = {}
    for persona in personas:
        if deseado[persona.pk]:
            duenos.setdefault(deseado[persona.pk], set()).add(persona.pk)

    with transaction.atomic():
        planes = {p.plan_id: p for p in PlanPlanner.objects.select_for_update()}
        nuevos: dict[str, PlanPlanner] = {}
        cambiados: dict[str, PlanPlanner] = {}
        for persona in personas:
            plan_id = deseado[persona.pk]
            # Sus otros planes activos quedan inactivos.
            for plan in planes.values():
                if plan.colaborador_id == persona.pk and plan.activo and plan.plan_id != plan_id:
                    plan.activo = False
                    cambiados[plan.plan_id] = plan
            if not plan_id:
                continue
            plan = planes.get(plan_id)
            if plan is None:
                plan = planes[plan_id] = nuevos[plan_id] = PlanPlanner(plan_id=plan_id, titulo='')
            elif plan.activo and plan.colaborador_id not in (None, persona.pk):
                if plan.colaborador_id in duenos.get(plan_id, set()) - {persona.pk}:
                    continue  # otra persona activa tiene el mismo enlace
            if plan.colaborador_id != persona.pk or not plan.activo:
                plan.colaborador_id = persona.pk
                plan.activo = True
                plan.accesible = True
                plan.error_lectura = ''
                if plan_id not in nuevos:
                    cambiados[plan_id] = plan
        PlanPlanner.objects.bulk_create(nuevos.values())
        momento = timezone.now()
        for plan in cambiados.values():
            plan.updated_at = momento  # bulk_update no lo pone solo
        PlanPlanner.objects.bulk_update(
            cambiados.values(),
            ['activo', 'colaborador', 'accesible', 'error_lectura', 'updated_at'],
        )
    PlanPlanner.objects.exclude(activo=True, colaborador__isnull=False).filter(
        snapshots__isnull=True
    ).delete()
