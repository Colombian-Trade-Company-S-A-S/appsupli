"""Permisos de la API de administración."""
from rest_framework.permissions import SAFE_METHODS, BasePermission

from . import permisos_admin as P


class IsPlatformAdmin(BasePermission):
    """Solo el administrador de la plataforma (kind=admin o superusuario)."""

    message = 'Esta sección es solo para administradores de la plataforma.'

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and user.is_admin)


def _codigos(user) -> set[str]:
    cache = getattr(user, '_codigos_admin', None)
    if cache is None:
        cache = set(user.get_effective_permissions())
        user._codigos_admin = cache
    return cache


def tiene(user, *codigos: str) -> bool:
    """El administrador, o quien tiene alguno de esos permisos (suelto o por un rol)."""
    if not (user and user.is_authenticated):
        return False
    return user.is_admin or bool(_codigos(user) & set(codigos))


class PermisoDeAdministracion(BasePermission):
    """
    Leer pide alguno de `ver` (o de `editar`, que lo incluye); crear o cambiar,
    alguno de `editar`. Eliminar es solo del administrador, que lo hace todo.
    """

    message = 'No tienes permiso para esto en Administración.'
    ver: tuple[str, ...] = ()
    editar: tuple[str, ...] = ()

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.is_admin:
            return True
        if request.method in SAFE_METHODS:
            return tiene(user, *self.ver, *self.editar)
        if request.method == 'DELETE':
            return False
        return tiene(user, *self.editar)


def permiso_de_administracion(
    *, ver: tuple[str, ...], editar: tuple[str, ...] = ()
) -> type[PermisoDeAdministracion]:
    return type(
        'PermisoDeAdministracion', (PermisoDeAdministracion,), {'ver': ver, 'editar': editar}
    )


#: Los catálogos (áreas, apps, roles, permisos) los lee cualquiera que entre a
#: Administración: con ellos se arman la lista y el detalle de las personas.
LeeCatalogos = permiso_de_administracion(ver=P.TODOS)
Usuarios = permiso_de_administracion(ver=(P.VER_USUARIOS,), editar=(P.EDITAR_USUARIOS,))
Aplicaciones = permiso_de_administracion(ver=P.TODOS, editar=(P.EDITAR_APPS,))
Roles = permiso_de_administracion(ver=P.TODOS, editar=(P.EDITAR_ROLES,))
Odoo = permiso_de_administracion(ver=(P.ODOO,), editar=(P.ODOO,))
