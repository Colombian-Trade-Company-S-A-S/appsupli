"""Serializers del módulo de Administración (gestión de usuarios y accesos)."""
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.crypto import get_random_string
from rest_framework import serializers
from rest_framework.validators import UniqueValidator

from .models import Application, Area, Permission, Role, User


class ConteoUsuariosField(serializers.ReadOnlyField):
    """
    Cuántos usuarios tiene. En el listado viene anotado por el viewset
    (`conteo_usuarios`); al crear o editar uno solo, se cuenta aparte.
    """

    def __init__(self, **kwargs):
        super().__init__(source='*', **kwargs)

    def to_representation(self, instancia):
        anotado = getattr(instancia, 'conteo_usuarios', None)
        return anotado if anotado is not None else instancia.users.count()


class AreaSerializer(serializers.ModelSerializer):
    user_count = ConteoUsuariosField()

    class Meta:
        model = Area
        fields = ('id', 'name', 'description', 'is_active', 'odoo', 'user_count')


class PermissionSerializer(serializers.ModelSerializer):
    application_name = serializers.CharField(source='application.name', read_only=True)

    class Meta:
        model = Permission
        fields = ('id', 'code', 'name', 'application', 'application_name')


class ApplicationSerializer(serializers.ModelSerializer):
    permissions = PermissionSerializer(many=True, read_only=True)
    user_count = ConteoUsuariosField()

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
    user_count = ConteoUsuariosField()

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
    """
    Usuario visto desde Administración.

    Lo que describe a la persona en la organización —área, cargo, jefe,
    dirección, regional, cédula— viene de Odoo y aquí es de solo lectura. A
    quien viene de Odoo tampoco se le cambia el nombre ni el correo. Desde
    Administración se manejan los accesos: aplicaciones, roles, permisos,
    contraseña, si está activo y si es admin.
    """

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
    # Sin correo se crea igual: es el caso de los asesores y promotores de
    # punto de venta, que existen en la plataforma pero no inician sesión.
    # Declararlo a mano quita la validación de unicidad que trae el modelo, así
    # que se vuelve a poner: el correo sigue siendo único entre quienes tienen.
    email = serializers.EmailField(
        required=False,
        allow_blank=True,
        allow_null=True,
        validators=[
            UniqueValidator(
                queryset=User.objects.all(), message='Ya existe una cuenta con ese correo.'
            )
        ],
    )
    puede_iniciar_sesion = serializers.BooleanField(read_only=True)
    departamento_nombre = serializers.CharField(source='departamento', read_only=True, default='')

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
            'pais',
            'cedula',
            'odoo_id',
            'departamento_nombre',
            'sincronizado_odoo_at',
            'manager',
            'manager_name',
            'is_active',
            'is_admin',
            'puede_iniciar_sesion',
            'last_login_at',
            'applications',
            'application_names',
            'roles',
            'role_names',
            'extra_permissions',
            'password',
        )
        # Lo de Odoo lo escribe la sincronización, no el formulario.
        read_only_fields = (
            'last_login_at', 'odoo_id', 'sincronizado_odoo_at', 'cedula', 'area', 'position',
            'manager', 'direccion', 'organizacion', 'regional', 'punto_venta', 'pais',
        )

    #: Lo que manda Odoo de la persona misma; solo se edita en quien no viene de allá.
    CAMPOS_PERSONALES_ODOO = ('first_name', 'last_name', 'email')

    def validate_kind(self, value):
        """
        Desde aquí solo se decide quién es admin. Líder o colaborador lo define
        Odoo: líder es quien tiene personas a cargo.
        """
        if value == User.Kind.ADMIN:
            return value
        if self.instance is not None and self.instance.team.exists():
            return User.Kind.LEADER
        return User.Kind.COLLABORATOR

    def validate_email(self, value):
        """Vacío se guarda como nulo: dos vacíos chocarían contra el índice único."""
        return (value or '').strip().lower() or None

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
        if instance.odoo_id:
            for campo in self.CAMPOS_PERSONALES_ODOO:
                validated_data.pop(campo, None)
        password = validated_data.pop('password', '')
        user = super().update(instance, validated_data)
        if password:
            user.set_password(password)
            user.save(update_fields=['password', 'updated_at'])
        return user
