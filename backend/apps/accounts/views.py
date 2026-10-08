"""Endpoints de sesión."""
from django.conf import settings
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .microsoft import TokenMicrosoftInvalido, correo_del_token, validar_id_token
from .models import User
from .serializers import (
    ChangePasswordSerializer,
    DecisionInstalacionSerializer,
    LoginSerializer,
    PreferencesSerializer,
    UserSerializer,
    VerifyPasswordSerializer,
    sesion_para,
)


class LoginView(APIView):
    """POST /api/auth/login → {accessToken, refreshToken, user}"""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    @extend_schema(request=LoginSerializer, responses=LoginSerializer)
    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.validated_data['user'].registrar_inicio_de_sesion()
        return Response(serializer.to_representation(serializer.validated_data))


class IngresoView(APIView):
    """GET /api/auth/ingreso → cómo se entra: Microsoft y si la contraseña sigue abierta."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request):
        microsoft = None
        if settings.MICROSOFT_TENANT_ID and settings.MICROSOFT_CLIENT_ID:
            microsoft = {
                'tenant_id': settings.MICROSOFT_TENANT_ID,
                'client_id': settings.MICROSOFT_CLIENT_ID,
            }
        return Response({'microsoft': microsoft, 'contrasena': settings.LOGIN_CONTRASENA_ACTIVO})


class MicrosoftLoginView(APIView):
    """
    POST /api/auth/microsoft {idToken} → {accessToken, refreshToken, user}

    Entra quien tenga en appsupli —es decir, en Odoo— el mismo correo que su
    cuenta de Microsoft. No se crean cuentas aquí: si no está, no entra.
    """

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def post(self, request):
        id_token = request.data.get('id_token') or ''
        if not id_token:
            return Response({'message': 'Falta el token de Microsoft.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            datos = validar_id_token(id_token)
        except TokenMicrosoftInvalido as error:
            return Response({'message': str(error)}, status=status.HTTP_401_UNAUTHORIZED)

        correo = correo_del_token(datos)
        usuario = User.objects.filter(email__iexact=correo).first() if correo else None
        if usuario is None:
            return Response(
                {'message': f'{correo or "Tu cuenta"} no está habilitada en appsupli. '
                            'Tu correo de Microsoft debe ser el mismo que tienes en Odoo.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not usuario.is_active:
            return Response(
                {'message': 'Tu cuenta está desactivada. Contacta al administrador.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        usuario.registrar_inicio_de_sesion()
        return Response(sesion_para(usuario))


class MeView(APIView):
    """GET /api/auth/me → usuario actual con sus apps y permisos."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=UserSerializer)
    def get(self, request):
        return Response(UserSerializer(request.user).data)


class LogoutView(APIView):
    """POST /api/auth/logout — el frontend descarta los tokens."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        return Response(status=status.HTTP_204_NO_CONTENT)


class ChangePasswordView(APIView):
    """POST /api/auth/change-password — cambia la contraseña del usuario actual."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=ChangePasswordSerializer, responses={204: None})
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class VerifyPasswordView(APIView):
    """POST /api/auth/verify-password — valida la contraseña actual sin cambiarla."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=VerifyPasswordSerializer, responses={204: None})
    def post(self, request):
        serializer = VerifyPasswordSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PreferencesView(APIView):
    """PATCH /api/auth/preferences — guarda tema, acento y redondeado."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=PreferencesSerializer, responses=UserSerializer)
    def patch(self, request):
        serializer = PreferencesSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(request.user).data)


class InstalacionAppView(APIView):
    """POST /api/auth/instalacion-app — {decision: instalada | despues | visto}."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=DecisionInstalacionSerializer, responses=UserSerializer)
    def post(self, request):
        serializer = DecisionInstalacionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        request.user.decidir_instalacion(serializer.validated_data['decision'])
        return Response(UserSerializer(request.user).data)
