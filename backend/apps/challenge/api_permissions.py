"""
Quién puede hacer qué en Supli Challenge.

    People        → crea retos, los publica, los cierra y los finaliza
    Evaluador     → valora las entregas (dos miembros de Supli por reto)
    Jurado        → el tercero, sorteado para cada reto: valora sin más permisos
    Colaborador   → participa en los retos de su público y ve lo suyo

Como en el resto de la plataforma, cada capacidad es un `Permission` que se
reparte con roles desde Administración.
"""
from rest_framework.permissions import BasePermission

from .models import Alcance, EstadoReto, VisibilidadEvidencia

APP_CODE = 'supli-challenge'

MANAGE = 'challenge:retos:manage'
VALORAR = 'challenge:valoraciones:crear'


def _codes(user) -> set[str]:
    cache = getattr(user, '_challenge_perms', None)
    if cache is None:
        cache = set(user.get_effective_permissions())
        user._challenge_perms = cache
    return cache


def has_perm(user, code: str) -> bool:
    if user is None or not user.is_authenticated:
        return False
    if user.is_admin:
        return True
    return code in _codes(user)


def puede_gestionar_retos(user) -> bool:
    """People: el ciclo de vida completo del reto."""
    return has_perm(user, MANAGE)


def es_evaluador(user) -> bool:
    """Los miembros de Supli que valoran entregas."""
    return has_perm(user, VALORAR) or puede_gestionar_retos(user)


def es_jurado_de(user, reto) -> bool:
    """El tercer evaluador, sorteado para ese reto."""
    return reto.jurados.filter(usuario=user).exists()


def puede_valorar(user, reto) -> bool:
    return es_evaluador(user) or es_jurado_de(user, reto)


def es_del_publico(user, reto) -> bool:
    """
    Si a esta persona le aparece el reto.

    Mientras no exista la sincronización con Odoo, el área y el país salen de
    lo que haya en la cuenta; cuando entre, los mismos campos llegan solos y
    esta función no cambia.
    """
    if reto.pais and (user.pais or '') != reto.pais:
        return False
    if reto.alcance == Alcance.TODOS:
        return True
    if reto.alcance == Alcance.AREAS:
        return user.area_id is not None and reto.areas.filter(pk=user.area_id).exists()
    return reto.personas.filter(pk=user.pk).exists()


def puede_participar(user, reto) -> bool:
    """Se participa en un reto abierto, y solo si se es de su público."""
    return reto.estado == EstadoReto.PUBLICADO and es_del_publico(user, reto)


def puede_ver_evidencias(user, reto, participa: bool = False) -> bool:
    """
    Quién ve los soportes, según lo que se configuró en el reto (B6).

    People y quien valora siempre pueden: ese es justamente su trabajo. El
    resto depende de la visibilidad que se le puso al reto, porque algunos
    manejan información confidencial.
    """
    if puede_valorar(user, reto):
        return True
    if reto.visibilidad_evidencia == VisibilidadEvidencia.ORGANIZACION:
        return True
    if reto.visibilidad_evidencia == VisibilidadEvidencia.PARTICIPANTES:
        return participa
    return False


def capacidades(user) -> dict:
    """Lo que el frontend necesita para decidir qué pinta y qué esconde."""
    return {
        'puede_gestionar_retos': puede_gestionar_retos(user),
        'es_evaluador': es_evaluador(user),
    }


class HasChallengeApp(BasePermission):
    """Puerta de entrada: hay que tener el módulo asignado."""

    message = 'No tienes acceso a Supli Challenge.'

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.is_admin:
            return True
        cache = getattr(user, '_challenge_app_access', None)
        if cache is None:
            cache = user.has_app_access(APP_CODE)
            user._challenge_app_access = cache
        return cache


class CanManageRetos(BasePermission):
    """Crear, publicar, cerrar y finalizar retos es de People."""

    message = 'Solo People administra los retos.'

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and puede_gestionar_retos(user))
