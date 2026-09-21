from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Application, User


class ApplicationSerializer(serializers.ModelSerializer):
    """Una app del menú. `children` trae los sub-módulos que cuelgan de ella."""

    children = serializers.SerializerMethodField()

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
            'parent',
            'children',
        )

    def get_children(self, obj: Application):
        # Solo los sub-módulos a los que la persona llega: el contenedor se
        # dibuja igual, pero adentro no aparece lo que no tiene asignado.
        permitidas = self.context.get('permitidas')
        hijas = [app for app in obj.children.all() if app.is_active]
        if permitidas is not None:
            hijas = [app for app in hijas if app.pk in permitidas]
        hijas.sort(key=lambda app: (app.order, app.name))
        return ApplicationSerializer(hijas, many=True, context=self.context).data


class UserSerializer(serializers.ModelSerializer):
    """Lo que el frontend necesita para pintar sidebar y permisos."""

    full_name = serializers.CharField(read_only=True)
    is_admin = serializers.BooleanField(read_only=True)
    roles = serializers.SlugRelatedField(slug_field='code', many=True, read_only=True)
    area = serializers.CharField(source='area.name', read_only=True, default='')
    manager_name = serializers.CharField(source='manager.full_name', read_only=True, default='')
    team_count = serializers.SerializerMethodField()
    applications = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()

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
            'position',
            'kind',
            'phone',
            'direccion',
            'organizacion',
            'regional',
            'punto_venta',
            'manager_name',
            'team_count',
            'theme',
            'accent',
            'radius',
            'avatar_url',
            'is_active',
            'is_admin',
            'roles',
            'applications',
            'permissions',
        )

    def get_team_count(self, obj: User) -> int:
        """Personas activas que lo tienen como jefe directo."""
        return obj.team.filter(is_active=True).count()

    def get_applications(self, obj: User):
        # El menú se arma con los contenedores; los sub-módulos van adentro.
        accesibles = obj.get_accessible_applications().prefetch_related('children')
        permitidas = {app.pk for app in accesibles}
        raiz = [app for app in accesibles if app.parent_id is None]
        return ApplicationSerializer(
            raiz, many=True, context={'permitidas': permitidas}
        ).data

    def get_permissions(self, obj: User) -> list[str]:
        return obj.get_effective_permissions()


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, style={'input_type': 'password'})

    def validate(self, attrs):
        user = authenticate(
            request=self.context.get('request'),
            username=attrs['email'].lower(),
            password=attrs['password'],
        )
        if user is None:
            raise serializers.ValidationError({'detail': 'Credenciales inválidas'}, code='invalid')
        if not user.is_active:
            raise serializers.ValidationError(
                {'detail': 'Tu cuenta está desactivada. Contacta al administrador.'}
            )
        attrs['user'] = user
        return attrs

    def to_representation(self, instance):
        user: User = instance['user']
        refresh = RefreshToken.for_user(user)
        return {
            'access_token': str(refresh.access_token),
            'refresh_token': str(refresh),
            'user': UserSerializer(user).data,
        }


class ChangePasswordSerializer(serializers.Serializer):
    """Cambio de contraseña del propio usuario."""

    current_password = serializers.CharField(write_only=True, style={'input_type': 'password'})
    new_password = serializers.CharField(write_only=True, style={'input_type': 'password'})

    def validate_current_password(self, value: str) -> str:
        if not self.context['request'].user.check_password(value):
            raise serializers.ValidationError('La contraseña actual no es correcta.')
        return value

    def validate_new_password(self, value: str) -> str:
        user = self.context['request'].user
        try:
            validate_password(value, user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages)) from exc
        return value

    def validate(self, attrs):
        if attrs['current_password'] == attrs['new_password']:
            raise serializers.ValidationError(
                {'new_password': ['La nueva contraseña debe ser distinta de la actual.']}
            )
        return attrs

    def save(self, **kwargs) -> User:
        user = self.context['request'].user
        user.set_password(self.validated_data['new_password'])
        user.save(update_fields=['password', 'updated_at'])
        return user


class VerifyPasswordSerializer(serializers.Serializer):
    """Primer paso del cambio de contraseña: confirmar identidad."""

    password = serializers.CharField(write_only=True, style={'input_type': 'password'})

    def validate_password(self, value: str) -> str:
        if not self.context['request'].user.check_password(value):
            raise serializers.ValidationError('La contraseña actual no es correcta.')
        return value


class PreferencesSerializer(serializers.ModelSerializer):
    """Apariencia de la plataforma; se guarda en la cuenta, no en el navegador."""

    class Meta:
        model = User
        fields = ('theme', 'accent', 'radius')
