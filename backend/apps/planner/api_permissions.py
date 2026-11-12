"""
Quién puede hacer qué en Ejecución Planner.

Sigue las reglas que ya usa Objetivos y KPIs:

    People        → toda la organización, conexión, calidad, planes y parámetros
    CEO/Dirección → toda la organización, en solo lectura
    Líder         → su equipo a cargo directo (`User.manager`) y sus Hitos
    Colaborador   → su propio cumplimiento

Quién se mide: quien tiene el sub-módulo asignado, sin asesores ni promotores
de punto de venta (no planean en Planner). Es una decisión pendiente con
People (población); mientras tanto, People controla el alcance asignando el
sub-módulo.
"""
from django.db.models import Q
from rest_framework.permissions import BasePermission

from apps.accounts.models import User
from apps.performance.api_permissions import asesores_y_promotores, es_lider, puede_autogestionar

APP_CODE = 'ejecucion-planner'

GESTIONAR = 'planner:gestionar'
VER_TODO = 'planner:ver_todo'


def _codes(user) -> set[str]:
    cache = getattr(user, '_planner_perms', None)
    if cache is None:
        cache = set(user.get_effective_permissions())
        user._planner_perms = cache
    return cache


def _tiene(user, code: str) -> bool:
    if user is None or not user.is_authenticated:
        return False
    return user.is_admin or code in _codes(user)


def puede_gestionar(user) -> bool:
    """People: planes, parámetros, sincronización y calidad del dato."""
    return _tiene(user, GESTIONAR)


def puede_ver_todo(user) -> bool:
    """People, CEO y Dirección: el dashboard de toda la organización."""
    return _tiene(user, VER_TODO) or puede_gestionar(user)


def puede_ver(user, colaborador) -> bool:
    if colaborador is None:
        return False
    return colaborador.id == user.id or puede_ver_todo(user) or colaborador.manager_id == user.id


def puede_validar_hito(user, colaborador) -> bool:
    """
    El jefe inmediato valida el Hito; People también puede.

    El CEO no tiene jefe: valida el suyo si tiene el rol de autogestión de
    Performance (decisión pendiente con People, fila 6 de las novedades).
    """
    if colaborador is None:
        return False
    if puede_gestionar(user):
        return True
    if colaborador.id == user.id:
        return colaborador.manager_id is None and puede_autogestionar(user)
    return colaborador.manager_id == user.id


def personas_medidas():
    """Las personas que deberían tener plan: con el sub-módulo y sin ser de punto de venta."""
    return (
        User.objects.filter(is_active=True)
        .filter(
            Q(applications__code=APP_CODE)
            | Q(roles__permissions__application__code=APP_CODE)
            | Q(extra_permissions__application__code=APP_CODE)
        )
        .exclude(asesores_y_promotores())
        .distinct()
    )


def alcance(user):
    """A quiénes puede ver en el dashboard: toda la compañía o su equipo directo."""
    personas = User.objects.filter(is_active=True)
    if puede_ver_todo(user):
        return personas
    return personas.filter(Q(manager=user) | Q(pk=user.pk))


def capacidades(user) -> dict:
    return {
        'puede_gestionar': puede_gestionar(user),
        'puede_ver_todo': puede_ver_todo(user),
        'es_lider': es_lider(user),
        'autovalida_hito': user.manager_id is None and puede_autogestionar(user),
    }


class HasPlannerApp(BasePermission):
    message = 'No tienes acceso a Ejecución Planner.'

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.is_admin:
            return True
        cache = getattr(user, '_planner_app_access', None)
        if cache is None:
            cache = user.has_app_access(APP_CODE)
            user._planner_app_access = cache
        return cache


class CanGestionarPlanner(BasePermission):
    message = 'Solo People puede administrar Ejecución Planner.'

    def has_permission(self, request, view) -> bool:
        return bool(request.user and request.user.is_authenticated and puede_gestionar(request.user))
