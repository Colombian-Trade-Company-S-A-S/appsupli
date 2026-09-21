"""
Quién puede hacer qué en Objetivos y KPIs.

Es el mapa de roles del §7 de la especificación, escrito con el modelo de
accesos que ya tiene la plataforma: cada capacidad es un `Permission` que se
reparte con roles desde Administración.

    People Manager  → define objetivos de cualquiera, abre y cierra el mes
    CEO             → ve toda la organización, en solo lectura
    Líder / Jefe    → define y ve los de su equipo; no necesita permiso, sale
                      de `User.manager`, igual que en valoración
    Miembro         → ve los propios

Consultar los objetivos propios no necesita permiso: basta con tener el
sub-módulo asignado.
"""
from rest_framework.permissions import BasePermission

#: El sub-módulo dentro del contenedor «Supli Performance».
APP_CODE = 'objetivos-kpis'

MANAGE_ALL = 'performance:objetivos:manage_all'
VIEW_ALL = 'performance:objetivos:view_all'
PERIODOS = 'performance:periodos:manage'


def _codes(user) -> set[str]:
    """Permisos efectivos del usuario, cacheados durante la petición."""
    cache = getattr(user, '_performance_perms', None)
    if cache is None:
        cache = set(user.get_effective_permissions())
        user._performance_perms = cache
    return cache


def has_perm(user, code: str) -> bool:
    if user is None or not user.is_authenticated:
        return False
    if user.is_admin:
        return True
    return code in _codes(user)


def puede_definir_a_cualquiera(user) -> bool:
    """People: registra objetivos de cualquier persona de la compañía."""
    return has_perm(user, MANAGE_ALL)


def puede_ver_todo(user) -> bool:
    """CEO y People: visibilidad de toda la organización."""
    return has_perm(user, VIEW_ALL) or puede_definir_a_cualquiera(user)


def puede_gestionar_periodos(user) -> bool:
    """Abrir el mes, activarlo (congelando los objetivos) y cerrarlo."""
    return has_perm(user, PERIODOS)


def es_jefe_de(user, colaborador) -> bool:
    """Jefe inmediato, tal como lo resuelve la jerarquía del módulo anterior."""
    return bool(colaborador and colaborador.manager_id == user.id)


def es_lider(user) -> bool:
    """Tiene personas a cargo (o está marcado como líder en su cuenta)."""
    if user is None or not user.is_authenticated:
        return False
    if user.kind == user.Kind.LEADER or user.is_admin:
        return True
    return user.team.exists()


def puede_definir(user, colaborador) -> bool:
    """
    Quién puede crear o editar el objetivo de alguien.

    Regla 3 de la especificación: el objetivo lo define el jefe o People. El
    colaborador nunca edita el suyo, ni siquiera el de su propia cuenta.
    """
    if puede_definir_a_cualquiera(user):
        return True
    return es_jefe_de(user, colaborador)


def puede_ver(user, colaborador) -> bool:
    """Los propios siempre; los del equipo si es su jefe; todos si tiene el permiso."""
    if colaborador is None:
        return False
    if colaborador.id == user.id or puede_ver_todo(user):
        return True
    return es_jefe_de(user, colaborador)


def capacidades(user) -> dict:
    """Lo que el frontend necesita para decidir qué pinta y qué esconde."""
    return {
        'puede_definir_a_cualquiera': puede_definir_a_cualquiera(user),
        'puede_ver_todo': puede_ver_todo(user),
        'puede_gestionar_periodos': puede_gestionar_periodos(user),
        'es_lider': es_lider(user),
    }


# ── Clases de permiso para los viewsets ────────────────────────────────────


class HasPerformanceApp(BasePermission):
    """Puerta de entrada: hay que tener el sub-módulo asignado."""

    message = 'No tienes acceso a Objetivos y KPIs.'

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.is_admin:
            return True
        cache = getattr(user, '_performance_app_access', None)
        if cache is None:
            cache = user.has_app_access(APP_CODE)
            user._performance_app_access = cache
        return cache


class CanManagePeriodos(BasePermission):
    """Abrir y activar el mes es de People, no de cada líder."""

    message = 'Solo quien administra el módulo puede abrir o activar el periodo.'

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and puede_gestionar_periodos(user))
