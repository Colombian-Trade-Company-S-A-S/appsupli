"""Módulo de Administración: gestión de usuarios, áreas, apps, permisos y roles."""
from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .api_permissions import IsPlatformAdmin
from .models import Application, Area, Permission, Role, User
from .serializers_admin import (
    AdminUserSerializer,
    ApplicationSerializer,
    AreaSerializer,
    PermissionSerializer,
    RoleSerializer,
)


class AdminViewSet(viewsets.ModelViewSet):
    """Base: todo el módulo exige ser administrador de la plataforma."""

    permission_classes = [IsPlatformAdmin]


class AreaViewSet(AdminViewSet):
    queryset = Area.objects.order_by('name')
    serializer_class = AreaSerializer
    search_fields = ('name',)
    filterset_fields = ('is_active',)


class ApplicationViewSet(AdminViewSet):
    queryset = Application.objects.prefetch_related('permissions').order_by('order', 'name')
    serializer_class = ApplicationSerializer
    search_fields = ('name', 'code')
    filterset_fields = ('is_active',)


class PermissionViewSet(AdminViewSet):
    queryset = Permission.objects.select_related('application').order_by('code')
    serializer_class = PermissionSerializer
    search_fields = ('code', 'name')
    filterset_fields = ('application',)
    pagination_class = None


class RoleViewSet(AdminViewSet):
    queryset = Role.objects.prefetch_related('permissions').order_by('name')
    serializer_class = RoleSerializer
    search_fields = ('name', 'code')


class UserViewSet(AdminViewSet):
    queryset = User.objects.select_related('area', 'manager').prefetch_related(
        'applications', 'roles'
    )
    serializer_class = AdminUserSerializer
    search_fields = ('first_name', 'last_name', 'email', 'username', 'position')
    filterset_fields = ('is_active', 'kind', 'area')
    ordering_fields = ('first_name', 'email', 'last_login_at')
    ordering = ('first_name', 'last_name')

    def get_queryset(self):
        qs = super().get_queryset()
        buscar = self.request.query_params.get('search')
        if buscar:
            qs = qs.filter(
                Q(first_name__icontains=buscar)
                | Q(last_name__icontains=buscar)
                | Q(email__icontains=buscar)
                | Q(username__icontains=buscar)
                | Q(position__icontains=buscar)
            )
        return qs

    def destroy(self, request, *args, **kwargs):
        usuario = self.get_object()
        if usuario == request.user:
            return Response(
                {'message': 'No puedes eliminar tu propia cuenta.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)

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
