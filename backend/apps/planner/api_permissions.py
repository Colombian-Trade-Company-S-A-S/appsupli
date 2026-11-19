"""
Quién puede hacer qué en Ejecución Planner (decisiones 4, 8 y 9 de People).

    People        → toda la compañía, conexión, calidad, planes y parámetros
    CEO           → toda la compañía, en solo lectura
    Director      → toda su dirección: todos los que tiene debajo
    Líder         → todo su equipo: todos los que tiene debajo, no solo los directos
    Colaborador   → su propio cumplimiento

«Debajo» sale del organigrama (`User.manager`), siguiendo la cadena hasta el
final: el director ve a los equipos de sus líderes. El ranking respeta el
mismo alcance.

Quién se mide (decisión 5): quien tiene encendido el switch «Planner» en
Gestión de usuarios (`User.medir_planner`) y tiene correo corporativo
@supli.tech. Solo los planes de esas personas se guardan y se leen.

El Hito ya no se valida (decisión 3): no hay permiso de validación.
"""

from rest_framework.permissions import BasePermission

from apps.accounts.models import User
from apps.performance.api_permissions import es_lider

APP_CODE = 'ejecucion-planner'

GESTIONAR = 'planner:gestionar'
VER_TODO = 'planner:ver_todo'

# Solo cuentan los planes de quien tiene correo corporativo.
DOMINIO = '@supli.tech'


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
    """People: planes, parámetros, sincronización, recálculos y calidad del dato."""
    return _tiene(user, GESTIONAR)


def puede_ver_todo(user) -> bool:
    """People y el CEO: toda la compañía."""
    return _tiene(user, VER_TODO) or puede_gestionar(user)


def jerarquia() -> dict[int, int | None]:
    """`{persona: su jefe}` de todas las personas activas."""
    return dict(User.objects.filter(is_active=True).values_list('id', 'manager_id'))


def debajo_de(user_id: int, jefes: dict[int, int | None] | None = None) -> set[int]:
    """Todos los que la persona tiene debajo en el organigrama, a cualquier nivel."""
    jefes = jefes if jefes is not None else jerarquia()
    hijos: dict[int, list[int]] = {}
    for persona, jefe in jefes.items():
        if jefe is not None:
            hijos.setdefault(jefe, []).append(persona)
    vistos: set[int] = set()
    pendientes = list(hijos.get(user_id, []))
    while pendientes:
        persona = pendientes.pop()
        if persona in vistos or persona == user_id:
            continue
        vistos.add(persona)
        pendientes.extend(hijos.get(persona, []))
    return vistos


def direccion_de(user_id: int, jefes: dict[int, int | None]) -> int | None:
    """
    La dirección de una persona: el directivo de primer nivel por encima de ella.

    Es quien reporta directamente a la cabeza de la compañía (quien no tiene
    jefe). La cabeza y quien no tiene jefe no pertenecen a ninguna dirección.
    """
    cadena = [user_id]
    vistos = {user_id}
    while (jefe := jefes.get(cadena[-1])) is not None and jefe not in vistos:
        cadena.append(jefe)
        vistos.add(jefe)
    # cadena = [persona, jefe, …, cabeza]. El directivo es el penúltimo.
    return cadena[-2] if len(cadena) >= 2 else None


def puede_ver(user, colaborador) -> bool:
    if colaborador is None:
        return False
    if colaborador.id == user.id or puede_ver_todo(user):
        return True
    return colaborador.id in debajo_de(user.id)


def personas_planner():
    """Las personas que pueden tener plan: activas y con correo @supli.tech."""
    return User.objects.filter(is_active=True, email__iendswith=DOMINIO)


def personas_medidas():
    """Las personas que entran en la medición: con correo @supli.tech y switch encendido."""
    return personas_planner().filter(medir_planner=True)


def tiene_correo_supli(user) -> bool:
    return (user.email or '').lower().endswith(DOMINIO)


def se_mide(user) -> bool:
    return bool(user.is_active and user.medir_planner and tiene_correo_supli(user))


def alcance(user, jefes: dict[int, int | None] | None = None):
    """A quiénes ve en el dashboard: toda la compañía o todo su equipo."""
    personas = User.objects.filter(is_active=True)
    if puede_ver_todo(user):
        return personas
    return personas.filter(pk__in=debajo_de(user.id, jefes))


def capacidades(user) -> dict:
    return {
        'puede_gestionar': puede_gestionar(user),
        'puede_ver_todo': puede_ver_todo(user),
        'es_lider': es_lider(user),
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
        return bool(
            request.user and request.user.is_authenticated and puede_gestionar(request.user)
        )
