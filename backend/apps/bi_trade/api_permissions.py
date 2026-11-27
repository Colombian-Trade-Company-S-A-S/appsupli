"""
Quién puede consultar y quién puede editar los datos de BI Trade.

Tres preguntas, en este orden (ver `permisos` para el catálogo):

1. ¿Tiene la app? (`HasBiTradeApp`)
2. ¿Ve ese informe? También en `HasBiTradeApp`: el informe sale de la ruta
   —`/api/bi-trade/hc/…` es de Homecenter, lo que no lleva tramo es de
   Claro—, así ninguna vista se queda sin revisarlo.
3. ¿Puede editar ese módulo en ese informe? (`CanManageData`): la vista dice
   el módulo con `modulo_edicion` y el informe sale de la misma ruta.

El administrador de la plataforma y el «Administrador de BI Trade» pasan
todas.
"""
from rest_framework.permissions import SAFE_METHODS, BasePermission

from .permisos import (
    ADMIN_BI,
    APP_CODE,
    INFORMES,
    MODULOS,
    codigo_compartir,
    codigo_editar,
)

#: El de antes; hoy es el «Administrador de BI Trade».
MANAGE = ADMIN_BI

#: Tramos de `/api/bi-trade/` que tienen informe propio.
_TRAMOS_DE_INFORME = {'hc', 'falabella', 'tmk', 'partners', 'belkin'}
#: Tramos que no son de un informe: los usan todos (la lista de marcas, los
#: enlaces para compartir, el informe que llega al correo para Claro y Tmk).
_TRAMOS_COMPARTIDOS = {'marcas', 'enlaces', 'informe-correo'}


def permisos_de(user) -> set[str]:
    """Los permisos efectivos, leídos una vez por solicitud."""
    cache = getattr(user, '_permisos_bi', None)
    if cache is None:
        cache = set(user.get_effective_permissions())
        user._permisos_bi = cache
    return cache


def _todo(user) -> bool:
    return user.is_admin or ADMIN_BI in permisos_de(user)


def puede_ver_informe(user, informe: str) -> bool:
    return _todo(user) or INFORMES[informe] in permisos_de(user)


def informes_visibles(user) -> set[str]:
    return {informe for informe in INFORMES if puede_ver_informe(user, informe)}


def puede_editar(user, modulo: str | None, informe: str | None) -> bool:
    """
    Editar un módulo en un informe. Hace falta ver el informe: los permisos de
    adentro no valen solos.

    Sin informe —lo que es de todos, como las marcas— basta con poder editar
    ese módulo en alguno. Sin módulo, solo el administrador.
    """
    if _todo(user):
        return True
    if modulo is None:
        return False
    if informe is None:
        con_modulo = [otro for otro, modulos in MODULOS.items() if modulo in modulos]
        return any(puede_editar(user, modulo, otro) for otro in con_modulo)
    if modulo not in MODULOS.get(informe, ()):
        return False
    return puede_ver_informe(user, informe) and codigo_editar(informe, modulo) in permisos_de(user)


def puede_compartir(user, informe: str | None = None) -> bool:
    """Compartir un informe que ve. Sin informe, si puede compartir alguno."""
    if _todo(user):
        return True
    if informe is None:
        return any(puede_compartir(user, otro) for otro in INFORMES)
    return puede_ver_informe(user, informe) and codigo_compartir(informe) in permisos_de(user)


def informe_de_la_ruta(path: str) -> str | None:
    """De qué informe es una ruta de la API, o `None` si es de todos."""
    marca = '/api/bi-trade/'
    if marca not in path:
        return None
    tramo = path.split(marca, 1)[1].split('/', 1)[0]
    if tramo in _TRAMOS_DE_INFORME:
        return tramo
    if tramo in _TRAMOS_COMPARTIDOS:
        return None
    return 'claro'


class HasBiTradeApp(BasePermission):
    """Puerta de entrada: la aplicación asignada, y el informe de la ruta."""

    message = 'No tienes acceso al módulo de BI Trade Marketing.'

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.is_admin:
            return True
        cache = getattr(user, '_bi_trade_app_access', None)
        if cache is None:
            cache = user.has_app_access(APP_CODE)
            user._bi_trade_app_access = cache
        if not cache:
            return False
        informe = informe_de_la_ruta(request.path)
        if informe and not puede_ver_informe(user, informe):
            self.message = 'No tienes acceso a este informe de BI Trade.'
            return False
        return True


class CanManageData(BasePermission):
    """
    Crear, editar y borrar datos de BI Trade.

    El módulo lo dice la vista con `modulo_edicion` (`'ventas'`, `'metas'`…) y
    el informe, la ruta; una vista sin módulo pide ser administrador.
    """

    message = 'No tienes permiso para modificar esta información de BI Trade.'

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not (user and user.is_authenticated):
            return False
        return puede_editar(
            user, getattr(view, 'modulo_edicion', None), informe_de_la_ruta(request.path)
        )


def PuedeEditar(*modulos: str) -> type[BasePermission]:  # noqa: N802 — se usa como una clase
    """
    Para las vistas de función, que no tienen atributos: exige editar todos
    los módulos dados en el informe de la ruta.
    `@permission_classes([HasBiTradeApp, PuedeEditar('ventas')])`.

    En una ruta de todos (el informe del correo, que sirve a Claro y a Tmk)
    basta con tenerlos todos en algún informe.
    """

    class _PuedeEditar(BasePermission):
        message = CanManageData.message

        def has_permission(self, request, view) -> bool:
            user = request.user
            if not (user and user.is_authenticated):
                return False
            informe = informe_de_la_ruta(request.path)
            candidatos = [informe] if informe else list(MODULOS)
            return any(
                all(puede_editar(user, modulo, candidato) for modulo in modulos)
                for candidato in candidatos
            )

    return _PuedeEditar


class PuedeCompartir(BasePermission):
    """Ver los enlaces públicos: hace falta poder compartir algún informe."""

    message = 'No tienes permiso para compartir tableros de BI Trade.'

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and puede_compartir(user))


class ReadOnlyOrCanManage(BasePermission):
    """Consultar solo pide la app (y el informe); crear, editar o borrar pide el permiso.

    Va como clase de permiso y no como lógica dentro de `get_permissions()`
    para que una `@action` pueda declarar los suyos y DRF los respete.
    """

    message = CanManageData.message

    def has_permission(self, request, view) -> bool:
        if request.method in SAFE_METHODS:
            return True
        return CanManageData().has_permission(request, view)
