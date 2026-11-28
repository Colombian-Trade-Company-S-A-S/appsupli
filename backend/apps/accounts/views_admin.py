"""Módulo de Administración: gestión de usuarios, áreas, apps, permisos y roles."""
from django.db.models import Count, Prefetch
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import MethodNotAllowed, PermissionDenied
from rest_framework.response import Response

from . import accesos_app
from .api_permissions import Aplicaciones, IsPlatformAdmin, LeeCatalogos, Roles, Usuarios
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
    Base: solo el administrador de la plataforma. Cada sección abre lo suyo a
    quien tiene sus permisos (`permisos_admin`); eliminar sigue siendo suyo.
    """

    permission_classes = [IsPlatformAdmin]


# Los conteos de usuarios van anotados en la misma consulta: con `users.count`
# en el serializer salía una consulta por fila, y contra el Postgres de Render
# cada una es un viaje de red.
_CONTEO_USUARIOS = Count('users', distinct=True)


class AreaViewSet(viewsets.ReadOnlyModelViewSet):
    """Solo lectura: las áreas vienen de Odoo con la sincronización."""

    permission_classes = [LeeCatalogos]
    queryset = Area.objects.annotate(conteo_usuarios=_CONTEO_USUARIOS).order_by('name')
    serializer_class = AreaSerializer
    search_fields = ('name',)
    filterset_fields = ('is_active',)


class ApplicationViewSet(AdminViewSet):
    permission_classes = [Aplicaciones]
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

    @action(detail=True, methods=['get', 'post'])
    def accesos(self, request, pk=None):
        """
        GET  /api/admin/applications/{id}/accesos — quién entra y con qué.
        POST /api/admin/applications/{id}/accesos — le da a alguien la app,
             uno de sus roles o uno de sus permisos (solo el administrador).
        """
        app = self.get_object()
        if request.method == 'POST':
            self._cambiar_acceso(request, app, accesos_app.dar_acceso)
        return Response(accesos_app.personas_con_acceso(app))

    @action(detail=True, methods=['post'], url_path='quitar-acceso')
    def quitar_acceso(self, request, pk=None):
        """POST /api/admin/applications/{id}/quitar-acceso — lo contrario, solo el administrador."""
        app = self.get_object()
        self._cambiar_acceso(request, app, accesos_app.quitar_acceso)
        return Response(accesos_app.personas_con_acceso(app))

    @action(detail=True, methods=['post'], url_path='asignar-a')
    def asignar_a(self, request, pk=None):
        """
        POST /api/admin/applications/{id}/asignar-a — `{todos: true}` o `{area: id}`.

        Solo la app (entrar), sin roles ni permisos. Solo el administrador.
        """
        if not request.user.is_admin:
            raise PermissionDenied('Solo un administrador da o quita accesos.')
        app = self.get_object()
        datos = accesos_app.AsignacionMasivaSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        area = None if datos.validated_data['todos'] else datos.validated_data['area']
        return Response({'agregadas': accesos_app.asignar_a_muchos(app, area)})

    def _cambiar_acceso(self, request, app, cambio) -> None:
        # Dar y quitar accesos es solo del administrador, aunque se puedan
        # editar las aplicaciones.
        if not request.user.is_admin:
            raise PermissionDenied('Solo un administrador da o quita accesos.')
        datos = accesos_app.CambioDeAccesoSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        cambio(
            app,
            datos.validated_data['usuario'],
            datos.validated_data['tipo'],
            datos.validated_data.get('id'),
        )


class PermissionViewSet(AdminViewSet):
    # Se leen para armar roles y accesos; crearlos o cambiarlos, solo el administrador.
    permission_classes = [LeeCatalogos]
    queryset = Permission.objects.select_related('application', 'parent').order_by('code')
    serializer_class = PermissionSerializer
    search_fields = ('code', 'name')
    filterset_fields = ('application',)
    pagination_class = None


class RoleViewSet(AdminViewSet):
    permission_classes = [Roles]
    queryset = (
        Role.objects.annotate(conteo_usuarios=_CONTEO_USUARIOS)
        .prefetch_related('permissions')
        .order_by('name')
    )
    serializer_class = RoleSerializer
    search_fields = ('name', 'code')

    def perform_update(self, serializer):
        # Con «Crear o editar roles» no se tocan los roles propios: sería darse
        # permisos a uno mismo, y eso solo lo hace el administrador.
        yo = self.request.user
        if not yo.is_admin and serializer.instance.users.filter(pk=yo.pk).exists():
            raise PermissionDenied(
                'No puedes cambiar un rol que tienes: pídeselo a un administrador.'
            )
        serializer.save()


#: Lo que solo cambia el administrador: a qué entra cada persona.
_ACCESOS = ('applications', 'roles', 'extra_permissions')


def _cuidar_lo_del_administrador(usuario: User, datos: dict) -> None:
    """
    Quien edita usuarios sin ser administrador cambia la cuenta, no el poder:
    ni toca a un administrador, ni vuelve administrador a nadie, ni cambia
    contraseñas, ni da accesos.
    Lo que el formulario manda sin cambios se ignora; un cambio se rechaza.
    """
    if usuario.is_admin:
        raise PermissionDenied('La cuenta de un administrador solo la edita otro administrador.')
    if datos.pop('kind', None) == User.Kind.ADMIN:
        raise PermissionDenied('Solo un administrador puede volver administrador a alguien.')
    # Con la clave de otro se entra como él, con sus accesos: es del administrador.
    if datos.pop('password', ''):
        raise PermissionDenied('Solo un administrador cambia contraseñas.')
    for campo in _ACCESOS:
        if campo not in datos:
            continue
        nuevos = {objeto.pk for objeto in datos.pop(campo)}
        if nuevos != set(getattr(usuario, campo).values_list('pk', flat=True)):
            raise PermissionDenied(
                'Solo un administrador da accesos: aplicaciones, roles y permisos.'
            )


class UserViewSet(AdminViewSet):
    permission_classes = [Usuarios]
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

    def perform_update(self, serializer):
        if not self.request.user.is_admin:
            _cuidar_lo_del_administrador(serializer.instance, serializer.validated_data)
        serializer.save()

    @action(detail=True, methods=['post'], url_path='toggle-active')
    def toggle_active(self, request, pk=None):
        """POST /api/admin/users/{id}/toggle-active — activa o inactiva la cuenta."""
        usuario = self.get_object()
        if usuario.is_admin and not request.user.is_admin:
            raise PermissionDenied('A un administrador solo lo inactiva otro administrador.')
        if usuario == request.user:
            return Response(
                {'message': 'No puedes desactivar tu propia cuenta.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        usuario.is_active = not usuario.is_active
        usuario.save(update_fields=['is_active', 'updated_at'])
        return Response(self.get_serializer(usuario).data)
