"""Permisos de la API de administración."""
from rest_framework.permissions import SAFE_METHODS, BasePermission


class IsPlatformAdmin(BasePermission):
    """Solo el administrador de la plataforma (kind=admin o superusuario)."""

    message = 'Esta sección es solo para administradores de la plataforma.'

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and user.is_admin)


class VeUsuariosOAdmin(BasePermission):
    """
    El administrador lo hace todo. Quien tiene «Ver usuarios» solo consulta:
    la lista y el detalle de las personas, y los catálogos con que se leen
    (áreas, apps, roles y permisos). Editar, inactivar o cambiar un rol sigue
    siendo del administrador.
    """

    message = 'Esta sección es solo para administradores de la plataforma.'

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.is_admin:
            return True
        return request.method in SAFE_METHODS and user.puede_ver_usuarios()
