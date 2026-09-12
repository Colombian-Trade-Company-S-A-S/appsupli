"""
El formulario del plan Partners, abierto por enlace.

Vive aparte del tablero público a propósito, porque son dos cosas distintas:

  · el tablero compartido **muestra** datos del negocio, y por eso pide una
    contraseña además del token;
  · esto solo **recibe** lo que alguien diligencia. No devuelve nada de lo ya
    cargado, así que pedir contraseña cada vez sería un estorbo diario sin
    nada que proteger del otro lado.

Desde aquí una persona sin cuenta puede hacer exactamente dos cosas: pedir las
listas del formulario y enviar una recomendación. No hay más rutas. Tampoco
comparte puerta con el tablero: cada uno tiene su prefijo, su permiso y su
propio módulo, para que un cambio allá no abra nada acá ni al revés.

Lo que protege este enlace:

  · el token de la URL, largo y aleatorio, que se puede revocar o vencer;
  · un tope de envíos por IP y por enlace;
  · las mismas validaciones del formulario interno, porque es el mismo
    serializer;
  · que el registro queda a nombre del enlace, así se sabe de dónde salió.
"""
from django.db.models import F
from django.utils import timezone
from rest_framework import exceptions, status
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
    throttle_classes,
)
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle

from .models import CanalEnlace, EnlacePublico
from .serializers import RegistroPartnerSerializer
from .views_partners import aviso_de_serial, catalogos_partners


def enlace_del_formulario(token: str) -> EnlacePublico:
    """
    El enlace del token, si existe, sigue vigente y es de los que diligencian.

    Un token de tablero responde aquí igual que uno inventado: por esta puerta
    no se abre nada que muestre datos.
    """
    enlace = EnlacePublico.objects.filter(token=token, canal=CanalEnlace.PARTNERS).first()
    if enlace is None or not enlace.vigente:
        raise exceptions.NotFound('Este formulario no existe o ya no está disponible.')
    return enlace


class EsFormularioAbierto(BasePermission):
    """La única puerta: que el token sea el de un formulario vigente."""

    def has_permission(self, request, view) -> bool:
        request.enlace_formulario = enlace_del_formulario(view.kwargs.get('token', ''))
        return True


class EnviosDelFormulario(SimpleRateThrottle):
    """
    Tope de envíos, por IP y por enlace.

    Es holgado porque un promotor carga varios equipos seguidos; lo que corta
    es que alguien use el enlace para inundar la tabla.
    """

    scope = 'formulario_publico'

    def get_cache_key(self, request, view):
        return self.cache_format % {
            'scope': self.scope,
            'ident': f'{self.get_ident(request)}:{view.kwargs.get("token", "")}',
        }


@api_view(['GET'])
@authentication_classes([])
@permission_classes([EsFormularioAbierto])
def opciones(request, token):
    """Las listas del formulario: regionales, marcas, puntos y productos."""
    return Response(catalogos_partners())


@api_view(['POST'])
@authentication_classes([])
@permission_classes([EsFormularioAbierto])
@throttle_classes([EnviosDelFormulario])
def registrar(request, token):
    """Guarda una recomendación. Es lo único que este enlace puede hacer."""
    enlace = request.enlace_formulario
    entrada = RegistroPartnerSerializer(data=request.data)
    entrada.is_valid(raise_exception=True)
    registro = entrada.save(enlace=enlace)
    # En un enlace de formulario «accesos» cuenta lo que de verdad importa:
    # cuántas recomendaciones entraron por ahí.
    EnlacePublico.objects.filter(pk=enlace.pk).update(
        accesos=F('accesos') + 1, ultimo_acceso=timezone.now()
    )
    return Response(
        {**RegistroPartnerSerializer(registro).data, 'message': aviso_de_serial(registro)},
        status=status.HTTP_201_CREATED,
    )
