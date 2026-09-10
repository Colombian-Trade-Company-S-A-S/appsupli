"""
Quién puede hacer qué dentro de la valoración.

El módulo legacy decidía por el nombre del área ("people", "bi", "ceo"). Aquí
se usa el modelo de accesos de la plataforma: cada capacidad es un `Permission`
que se reparte con roles desde Administración. Los roles del negocio quedan así:

    Admin People   → todos los permisos del módulo
    BI / Tech      → configuración, dashboard y publicación
    CEO            → ver todo + dashboard (solo lectura)
    Líder          → su equipo, sin permisos; se deduce de `User.manager`
    Colaborador    → sus evaluaciones y su propio resultado

Responder lo asignado y ver el resultado propio no necesita permiso: basta con
tener acceso a la aplicación.
"""
from rest_framework.permissions import BasePermission

from .models import ValuationSettings

APP_CODE = 'valoracion'

CONFIG = 'valoracion:config:manage'
CYCLES = 'valoracion:cycles:manage'
VIEW_ALL = 'valoracion:results:view_all'
PUBLISH = 'valoracion:results:publish'
DASHBOARD = 'valoracion:dashboard:view'
PLANS = 'valoracion:plans:manage'
HIERARCHY = 'valoracion:hierarchy:manage'


def _codes(user) -> set[str]:
    """Permisos efectivos del usuario, cacheados durante la petición."""
    cache = getattr(user, '_valoracion_perms', None)
    if cache is None:
        cache = set(user.get_effective_permissions())
        user._valoracion_perms = cache
    return cache


def has_perm(user, code: str) -> bool:
    if user is None or not user.is_authenticated:
        return False
    if user.is_admin:
        return True
    return code in _codes(user)


def can_configure(user) -> bool:
    """Competencias y preguntas."""
    return has_perm(user, CONFIG)


def can_manage_cycles(user) -> bool:
    """Ciclos, asignaciones y consolidación."""
    return has_perm(user, CYCLES)


def can_view_all(user) -> bool:
    """Resultados de toda la compañía."""
    return has_perm(user, VIEW_ALL)


def can_view_dashboard(user) -> bool:
    """Dashboard organizacional, consolidado e informes."""
    return can_view_all(user) or has_perm(user, DASHBOARD)


def can_publish_results(user) -> bool:
    """Habilitar o bloquear «Mis resultados» y «Planes de acción»."""
    return has_perm(user, PUBLISH)


def can_manage_hierarchy(user) -> bool:
    """Editar cargo y jefe directo desde el módulo."""
    return has_perm(user, HIERARCHY)


def is_leader(user) -> bool:
    """Tiene personas a cargo (o está marcado como líder en su cuenta)."""
    if user is None or not user.is_authenticated:
        return False
    if user.kind == user.Kind.LEADER or user.is_admin:
        return True
    return user.team.exists()


def can_manage_plans(user) -> bool:
    """Crear y hacer seguimiento a planes de mejora."""
    return can_view_dashboard(user) or has_perm(user, PLANS) or is_leader(user)


def results_published() -> bool:
    return ValuationSettings.load().results_published


def can_view_results(user) -> bool:
    """El equipo ve sus resultados solo cuando alguien los publica."""
    if can_publish_results(user) or can_view_all(user):
        return True
    return results_published()


def capabilities(user) -> dict:
    """Lo que el frontend necesita para pintar el menú del módulo."""
    return {
        'can_configure': can_configure(user),
        'can_manage_cycles': can_manage_cycles(user),
        'can_view_all': can_view_all(user),
        'can_view_dashboard': can_view_dashboard(user),
        'can_publish_results': can_publish_results(user),
        'can_manage_hierarchy': can_manage_hierarchy(user),
        'can_manage_plans': can_manage_plans(user),
        'can_view_results': can_view_results(user),
        'is_leader': is_leader(user),
        'results_published': results_published(),
    }


# ── Clases de permiso para los viewsets ────────────────────────────────────

class HasValuationApp(BasePermission):
    """Puerta de entrada: hay que tener la aplicación asignada."""

    message = 'No tienes acceso al módulo de valoración.'

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.is_admin:
            return True
        cache = getattr(user, '_valoracion_app_access', None)
        if cache is None:
            cache = user.has_app_access(APP_CODE)
            user._valoracion_app_access = cache
        return cache


class _Rule(BasePermission):
    """Base: una función `check(user)` y el mensaje que se devuelve al fallar."""

    check = staticmethod(lambda user: False)

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and self.check(user))


class CanConfigure(_Rule):
    message = 'Solo quien configura el módulo puede editar competencias y preguntas.'
    check = staticmethod(can_configure)


class CanManageCycles(_Rule):
    message = 'Solo el administrador del módulo puede gestionar ciclos y asignaciones.'
    check = staticmethod(can_manage_cycles)


class CanViewDashboard(_Rule):
    message = 'No tienes acceso a los informes de valoración.'
    check = staticmethod(can_view_dashboard)


class CanManageHierarchy(_Rule):
    message = 'No tienes permiso para editar la jerarquía.'
    check = staticmethod(can_manage_hierarchy)


class CanManagePlans(_Rule):
    message = 'No tienes permiso para gestionar planes de acción.'
    check = staticmethod(can_manage_plans)


class CanReadConfig(_Rule):
    """Lectura del banco de preguntas: configuradores y quien arma ciclos."""

    message = 'No tienes acceso a la configuración del módulo.'
    check = staticmethod(lambda user: can_configure(user) or can_manage_cycles(user))
