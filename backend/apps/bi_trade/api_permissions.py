"""Quién puede consultar y quién puede editar los datos de BI Trade."""
from rest_framework.permissions import BasePermission

APP_CODE = 'bi-trade'
MANAGE = 'bi-trade:data:manage'


class HasBiTradeApp(BasePermission):
    """Puerta de entrada: hay que tener la aplicación asignada."""

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
        return cache


class CanManageData(BasePermission):
    """Crear, editar y borrar puntos de venta, productos y ventas."""

    message = 'No tienes permiso para modificar la información de BI Trade.'

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not (user and user.is_authenticated):
            return False
        return user.is_admin or MANAGE in user.get_effective_permissions()
