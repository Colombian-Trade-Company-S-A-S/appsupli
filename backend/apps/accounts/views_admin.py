"""Módulo de Administración: gestión de usuarios, áreas, apps, permisos y roles."""
from django.db.models import Count, Prefetch
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import MethodNotAllowed
from rest_framework.response import Response

from .api_permissions import VeUsuariosOAdmin
from .models import Application, Area, Permission, Role, User
from .serializers_admin import (
    AdminUserListaSerializer,
    AdminUserSerializer,
    ApplicationSerializer,
    AreaSerializer,
    PermissionSerializer,
    RoleSerializer,
)


class AdminViewSet(viewsets.ModelViewSet):
    """
    Base: cambiar algo exige ser administrador de la plataforma; consultar,
    también lo puede quien tiene «Ver usuarios».
    """

    permission_classes = [VeUsuariosOAdmin]


# Los conteos de usuarios van anotados en la misma consulta: con `users.count`
# en el serializer salía una consulta por fila, y contra el Postgres de Render
# cada una es un viaje de red.
_CONTEO_USUARIOS = Count('users', distinct=True)


class AreaViewSet(viewsets.ReadOnlyModelViewSet):
    """Solo lectura: las áreas vienen de Odoo con la sincronización."""

    permission_classes = [VeUsuariosOAdmin]
    queryset = Area.objects.annotate(conteo_usuarios=_CONTEO_USUARIOS).order_by('name')
    serializer_class = AreaSerializer
    search_fields = ('name',)
    filterset_fields = ('is_active',)


class ApplicationViewSet(AdminViewSet):
    queryset = (
        Application.objects.annotate(conteo_usuarios=_CONTEO_USUARIOS)
        # Cada permiso trae el nombre de su permiso de afuera: en la misma consulta.
        .prefetch_related(
            Prefetch('permissions', queryset=Permission.objects.select_related('parent'))
        )
        .order_by('order', 'name')
    )
    serializer_class = ApplicationSerializer
    search_fields = ('name', 'code')
    filterset_fields = ('is_active',)


class PermissionViewSet(AdminViewSet):
    queryset = Permission.objects.select_related('application', 'parent').order_by('code')
    serializer_class = PermissionSerializer
    search_fields = ('code', 'name')
    filterset_fields = ('application',)
    pagination_class = None


class RoleViewSet(AdminViewSet):
    queryset = (
        Role.objects.annotate(conteo_usuarios=_CONTEO_USUARIOS)
        .prefetch_related('permissions')
        .order_by('name')
    )
    serializer_class = RoleSerializer
    search_fields = ('name', 'code')


class UserViewSet(AdminViewSet):
    # La foto no se trae —tampoco la del jefe, que viene con `select_related`—:
    # basta su fecha para armar la dirección. Antes cada fila traía la imagen
    # del jefe y un listado de 70 personas tardaba 3 s contra Render.
    queryset = (
        User.objects.select_related('area', 'manager', 'departamento__padre__padre')
        .prefetch_related('applications', 'roles', 'extra_permissions')
        .defer('foto', 'manager__foto')
    )
    serializer_class = AdminUserSerializer
    search_fields = ('first_name', 'last_name', 'email', 'username', 'position')
    # `manager` arma el «equipo a cargo» del detalle de una persona.
    filterset_fields = ('is_active', 'kind', 'area', 'manager')
    ordering_fields = ('first_name', 'email', 'last_login_at')
    ordering = ('first_name', 'last_name')

    # Ni se crean ni se borran aquí: las personas entran y salen con la
    # sincronización de Odoo. Queda editar sus accesos y activar/inactivar.
    http_method_names = ['get', 'patch', 'post', 'head', 'options']

    def get_queryset(self):
        """
        El listado lee solo las columnas que muestra y precarga solo las apps:
        tres consultas (el conteo, las filas y sus apps) para cualquier número
        de personas. El detalle y la edición traen todo.
        """
        if self.action != 'list':
            return super().get_queryset()
        return (
            User.objects.select_related('area', 'manager')
            .only(*AdminUserListaSerializer.COLUMNAS)
            .prefetch_related(
                Prefetch('applications', queryset=Application.objects.only('id', 'name'))
            )
        )

    def get_serializer_class(self):
        return AdminUserListaSerializer if self.action == 'list' else AdminUserSerializer

    def create(self, request, *args, **kwargs):
        raise MethodNotAllowed(
            'POST', detail='Los usuarios se crean con la sincronización de Odoo, no desde aquí.'
        )

    @action(detail=True, methods=['post'], url_path='toggle-active')
    def toggle_active(self, request, pk=None):
        """POST /api/admin/users/{id}/toggle-active — activa o inactiva la cuenta."""
        usuario = self.get_object()
        if usuario == request.user:
            return Response(
                {'message': 'No puedes desactivar tu propia cuenta.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        usuario.is_active = not usuario.is_active
        usuario.save(update_fields=['is_active', 'updated_at'])
        return Response(self.get_serializer(usuario).data)
