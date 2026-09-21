"""Serializers del módulo de Administración (gestión de usuarios y accesos)."""
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.crypto import get_random_string
from rest_framework import serializers

from .models import Application, Area, Permission, Role, User


class AreaSerializer(serializers.ModelSerializer):
    user_count = serializers.IntegerField(source='users.count', read_only=True)

    class Meta:
        model = Area
        fields = ('id', 'name', 'description', 'is_active', 'user_count')


class PermissionSerializer(serializers.ModelSerializer):
    application_name = serializers.CharField(source='application.name', read_only=True)

    class Meta:
        model = Permission
        fields = ('id', 'code', 'name', 'application', 'application_name')


class ApplicationSerializer(serializers.ModelSerializer):
    permissions = PermissionSerializer(many=True, read_only=True)
    user_count = serializers.IntegerField(source='users.count', read_only=True)

    class Meta:
        model = Application
        fields = (
            'id',
            'code',
            'name',
            'description',
            'base_path',
            'icon',
            'order',
            'is_active',
            'parent',
            'permissions',
            'user_count',
        )


class RoleSerializer(serializers.ModelSerializer):
    permissions = serializers.PrimaryKeyRelatedField(
        many=True, queryset=Permission.objects.all(), required=False
    )
    permission_codes = serializers.SlugRelatedField(
        source='permissions', slug_field='code', many=True, read_only=True
    )
    user_count = serializers.IntegerField(source='users.count', read_only=True)

    class Meta:
        model = Role
        fields = (
            'id',
            'code',
            'name',
            'description',
            'permissions',
            'permission_codes',
            'user_count',
        )


class AdminUserSerializer(serializers.ModelSerializer):
    """Usuario visto desde Administración: datos + accesos, todo editable."""

    full_name = serializers.CharField(read_only=True)
    is_admin = serializers.BooleanField(read_only=True)
    area_name = serializers.CharField(source='area.name', read_only=True, default='')
    manager_name = serializers.CharField(source='manager.full_name', read_only=True, default='')
    application_names = serializers.SlugRelatedField(
        source='applications', slug_field='name', many=True, read_only=True
    )
    role_names = serializers.SlugRelatedField(
        source='roles', slug_field='name', many=True, read_only=True
    )
    # Solo al crear: contraseña inicial.
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = (
            'id',
            'email',
            'username',
            'first_name',
            'last_name',
            'full_name',
            'area',
            'area_name',
            'position',
            'kind',
            'phone',
            'direccion',
            'organizacion',
            'regional',
            'punto_venta',
            'manager',
            'manager_name',
            'is_active',
            'is_admin',
            'last_login_at',
            'applications',
            'application_names',
            'roles',
            'role_names',
            'extra_permissions',
            'password',
        )
        read_only_fields = ('last_login_at',)

    def validate_password(self, value: str) -> str:
        if value:
            try:
                validate_password(value)
            except DjangoValidationError as exc:
                raise serializers.ValidationError(list(exc.messages)) from exc
        return value

    def create(self, validated_data):
        password = validated_data.pop('password', '') or get_random_string(14)
        aplicaciones = validated_data.pop('applications', [])
        roles = validated_data.pop('roles', [])
        permisos = validated_data.pop('extra_permissions', [])

        user = User(**validated_data)
        user.set_password(password)
        user.save()

        user.applications.set(aplicaciones)
        user.roles.set(roles)
        user.extra_permissions.set(permisos)
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', '')
        user = super().update(instance, validated_data)
        if password:
            user.set_password(password)
            user.save(update_fields=['password', 'updated_at'])
        return user
