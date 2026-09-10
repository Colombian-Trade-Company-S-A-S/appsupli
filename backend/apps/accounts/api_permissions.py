"""Permisos de la API de administración."""
from rest_framework.permissions import BasePermission


class IsPlatformAdmin(BasePermission):
    """Solo el administrador de la plataforma (kind=admin o superusuario)."""

    message = 'Esta sección es solo para administradores de la plataforma.'

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and user.is_admin)
