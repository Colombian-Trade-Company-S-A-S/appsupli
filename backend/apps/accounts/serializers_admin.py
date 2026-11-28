"""Serializers del módulo de Administración (gestión de usuarios y accesos)."""
from django.conf import settings
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
    # En las listas planas (roles, detalle del usuario) los de adentro se
    # nombran con su permiso de afuera: «Informe de Ventas HC › Cargar ventas».
    parent_name = serializers.CharField(source='parent.name', read_only=True, default='')

    class Meta:
        model = Permission
        fields = (
            'id',
            'code',
            'name',
            'description',
            'group',
            'order',
            'parent',
            'parent_name',
            'application',
            'application_name',
        )


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


class AdminUserListaSerializer(serializers.ModelSerializer):
    """
    Una fila del listado de usuarios: solo lo que muestran la tabla y el
    «equipo a cargo». Los roles y permisos sueltos van en el detalle, que es
    donde se ven y se editan; aquí costarían dos consultas más por listado.

    Solo lectura: se edita con `AdminUserSerializer`.
    """

    full_name = serializers.CharField(read_only=True)
    is_admin = serializers.BooleanField(read_only=True)
    puede_iniciar_sesion = serializers.BooleanField(read_only=True)
    area_name = serializers.CharField(source='area.name', read_only=True, default='')
    manager_name = serializers.CharField(source='manager.full_name', read_only=True, default='')
    application_names = serializers.SlugRelatedField(
        source='applications', slug_field='name', many=True, read_only=True
    )
    foto = serializers.SerializerMethodField()
    destacado = serializers.SerializerMethodField()

    #: Las columnas que lee: con `only()` no viaja nada más (ni la foto).
    COLUMNAS = (
        'id', 'email', 'username', 'first_name', 'last_name', 'position', 'kind', 'is_active',
        'is_superuser', 'last_login_at', 'foto_actualizada_at', 'area', 'area__name', 'manager',
        'manager__first_name', 'manager__last_name',
    )

    class Meta:
        model = User
        fields = (
            'id',
            'email',
            'username',
            'first_name',
            'last_name',
            'full_name',
            'foto',
            'destacado',
            'area',
            'area_name',
            'position',
            'kind',
            'manager',
            'manager_name',
            'is_active',
            'is_admin',
            'puede_iniciar_sesion',
            'last_login_at',
            'application_names',
        )
        read_only_fields = fields

    def get_foto(self, usuario: User) -> str | None:
        from .fotos import ruta_de_foto  # noqa: PLC0415 — fotos importa los serializers

        return ruta_de_foto(usuario)

    def get_destacado(self, usuario: User) -> bool:
        return (usuario.email or '').lower() in settings.USUARIOS_DESTACADOS


class AdminUserSerializer(serializers.ModelSerializer):
    """
    Usuario visto desde Administración.

    Lo que describe a la persona en la organización —área, cargo, jefe,
    dirección, regional, cédula— viene de Odoo y aquí es de solo lectura. A
    quien viene de Odoo tampoco se le cambia el nombre ni el correo
    corporativo; si no tiene corporativo, aquí se le pone su correo personal
    para que pueda entrar. Desde Administración se manejan los accesos:
    aplicaciones, roles, permisos, contraseña, si está activo y si es admin.
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
    correo_editable = serializers.SerializerMethodField()
    departamento_nombre = serializers.CharField(source='departamento', read_only=True, default='')
    # La foto de perfil, relativa a la raíz de la API; null si no tiene.
    foto = serializers.SerializerMethodField()
    # Uno de los socios (USUARIOS_DESTACADOS): el frontend lo distingue con efectos.
    destacado = serializers.SerializerMethodField()
    # Lo que muestra la fila del jefe en el detalle. Antes el detalle pedía al
    # jefe entero en una segunda llamada, que esperaba a la primera.
    jefe = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            'id',
            'email',
            'username',
            'first_name',
            'last_name',
            'full_name',
            'foto',
            'destacado',
            'jefe',
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
            'medir_planner',
            'planner_url',
            'puede_iniciar_sesion',
            'correo_editable',
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
    CAMPOS_PERSONALES_ODOO = ('first_name', 'last_name')

    def get_foto(self, usuario: User) -> str | None:
        from .fotos import ruta_de_foto  # noqa: PLC0415 — fotos importa los serializers

        return ruta_de_foto(usuario)

    def get_destacado(self, usuario: User) -> bool:
        return (usuario.email or '').lower() in settings.USUARIOS_DESTACADOS

    def get_jefe(self, usuario: User) -> dict | None:
        jefe = usuario.manager
        if jefe is None:
            return None
        return {
            'id': jefe.pk,
            'full_name': jefe.full_name,
            'first_name': jefe.first_name,
            'position': jefe.position,
            'foto': self.get_foto(jefe),
            'destacado': self.get_destacado(jefe),
        }

    def get_correo_editable(self, usuario: User) -> bool:
        """
        El correo corporativo lo pone Odoo. Quien no tiene uno —asesores y
        promotores de punto de venta— entra con su correo personal, y ese se
        pone aquí. La sincronización no lo borra: solo lo reemplaza si Odoo
        llega a tener un correo corporativo para esa persona.
        """
        dominio = settings.ODOO_DOMINIO_INGRESO.lower().lstrip('@')
        return not usuario.odoo_id or not (usuario.email or '').lower().endswith(f'@{dominio}')

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

    def validate_planner_url(self, value: str) -> str:
        """El enlace tiene que ser de un plan, y de un plan que no tenga otra persona."""
        from apps.planner.enlaces import duenos_de, plan_id_de_url  # noqa: PLC0415

        value = (value or '').strip()
        if not value:
            return ''
        plan_id = plan_id_de_url(value)
        if not plan_id:
            raise serializers.ValidationError(
                'No se reconoce el enlace. Abre el plan en Planner y copia la dirección del '
                'navegador (planner.cloud.microsoft/…/plan/…).'
            )
        otros = duenos_de(plan_id, excepto=self.instance.pk if self.instance else None)
        if otros:
            raise serializers.ValidationError(f'Ese plan ya es de {otros[0].full_name}.')
        return value

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
        if not self.get_correo_editable(instance):
            validated_data.pop('email', None)
        password = validated_data.pop('password', '')
        user = super().update(instance, validated_data)
        if password:
            user.set_password(password)
            user.save(update_fields=['password', 'updated_at'])
        if 'planner_url' in validated_data or 'is_active' in validated_data:
            # El plan que mide Ejecución Planner es el de la URL: se cambia aquí.
            from apps.planner.enlaces import vincular_plan  # noqa: PLC0415

            vincular_plan(user)
        return user
