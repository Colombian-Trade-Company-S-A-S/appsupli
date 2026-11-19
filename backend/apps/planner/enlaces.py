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
    """
    personas = User.objects.filter(
        Q(planner_url__gt='') | Q(planes_planner__activo=True)
    ).distinct()
    for persona in personas:
        vincular_plan(persona)
    PlanPlanner.objects.exclude(activo=True, colaborador__isnull=False).filter(
        snapshots__isnull=True
    ).delete()
