"""Endpoints de sesión."""
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import (
    ChangePasswordSerializer,
    LoginSerializer,
    PreferencesSerializer,
    UserSerializer,
    VerifyPasswordSerializer,
)


class LoginView(APIView):
    """POST /api/auth/login → {accessToken, refreshToken, user}"""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    @extend_schema(request=LoginSerializer, responses=LoginSerializer)
    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.validated_data['user'].touch_last_login()
        return Response(serializer.to_representation(serializer.validated_data))


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
