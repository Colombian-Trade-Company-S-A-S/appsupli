"""
Foto de perfil: se sube en appSupli y se escribe también en el empleado de Odoo.

La foto se guarda en la base (el disco de Render se borra en cada despliegue)
y se sirve por una dirección firmada, sin sesión: la etiqueta `<img>` del
navegador no manda el token de la API. La firma lleva la fecha de la foto, así
que cada foto nueva tiene su propia dirección y el navegador la puede guardar
en caché sin miedo a mostrar una vieja.
"""
import base64
import logging

from django.core import signing
from django.http import Http404, HttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.odoo.client import OdooClient, OdooError

from .models import User
from .serializers import UserSerializer

logger = logging.getLogger(__name__)

SAL = 'accounts.foto-perfil'

#: Lo más grande que se acepta. El navegador la reduce a 512 px antes de subirla.
TAMANO_MAXIMO = 3 * 1024 * 1024

#: Por debajo de esto, lo que manda Odoo no es una foto sino su imagen vacía
#: (la de quien no tiene foto pesa unos 300 bytes).
TAMANO_MINIMO_ODOO = 1024


def tipo_de_imagen(contenido: bytes) -> str | None:
    """El tipo real de la imagen por sus primeros bytes, no por lo que diga el nombre."""
    if contenido.startswith(b'\xff\xd8\xff'):
        return 'image/jpeg'
    if contenido.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'image/png'
    if contenido[:4] == b'RIFF' and contenido[8:12] == b'WEBP':
        return 'image/webp'
    if contenido[:6] in (b'GIF87a', b'GIF89a'):
        return 'image/gif'
    return None


def ruta_de_foto(usuario: User) -> str | None:
    """
    La dirección de la foto, relativa a la raíz de la API (`auth/fotos/<firma>`).

    Relativa porque el frontend y la API viven en dominios distintos: el
    frontend le antepone la dirección de la API que ya conoce.
    """
    # Solo mira la fecha (guardar_foto la pone y la quita junto con la foto):
    # así un listado no tiene que traer la imagen de cada persona.
    if not usuario.foto_actualizada_at:
        return None
    firma = signing.dumps(
        {'u': usuario.pk, 'v': int(usuario.foto_actualizada_at.timestamp())},
        salt=SAL,
        compress=True,
    )
    return f'auth/fotos/{firma}'


def guardar_foto(usuario: User, contenido: bytes | None, tipo: str = '') -> None:
    usuario.foto = contenido or None
    usuario.foto_tipo = tipo if contenido else ''
    usuario.foto_actualizada_at = timezone.now() if contenido else None
    usuario.save(update_fields=['foto', 'foto_tipo', 'foto_actualizada_at', 'updated_at'])


class FotoView(APIView):
    """GET /api/auth/fotos/<firma> → la imagen. Pública: la protege la firma."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, firma):
        try:
            datos = signing.loads(firma, salt=SAL)
        except signing.BadSignature as exc:
            raise Http404 from exc
        usuario = User.objects.filter(pk=datos.get('u')).only(
            'foto', 'foto_tipo', 'foto_actualizada_at'
        ).first()
        if usuario is None or not usuario.foto:
            raise Http404
        respuesta = HttpResponse(
            bytes(usuario.foto), content_type=usuario.foto_tipo or 'image/jpeg'
        )
        vigente = (
            usuario.foto_actualizada_at
            and int(usuario.foto_actualizada_at.timestamp()) == datos.get('v')
        )
        # La dirección cambia con cada foto: la vigente se guarda un año; una
        # dirección vieja sirve la foto actual, pero sin guardarse.
        respuesta['Cache-Control'] = (
            'public, max-age=31536000, immutable' if vigente else 'no-cache'
        )
        return respuesta


class MiFotoView(APIView):
    """
    PUT /api/auth/me/foto → cambia la foto propia y la escribe en Odoo.

    Si Odoo falla, la foto igual queda en appSupli y se avisa: la próxima vez
    que se suba, o cuando TI lo revise, se vuelve a intentar.
    """

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]

    def put(self, request):
        archivo = request.FILES.get('foto')
        if archivo is None:
            return Response(
                {'code': 'invalid', 'message': 'No llegó ninguna foto.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if archivo.size > TAMANO_MAXIMO:
            return Response(
                {'code': 'invalid', 'message': 'La foto pesa demasiado: el máximo es 3 MB.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        contenido = archivo.read()
        tipo = tipo_de_imagen(contenido)
        if tipo is None:
            return Response(
                {'code': 'invalid', 'message': 'El archivo no es una imagen JPG, PNG o WebP.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        usuario = request.user
        guardar_foto(usuario, contenido, tipo)

        if not usuario.odoo_id:
            odoo, mensaje = 'sin_vinculo', 'Foto actualizada. Tu cuenta no está enlazada con Odoo.'
        else:
            try:
                OdooClient().actualizar_foto(
                    usuario.odoo_id, base64.b64encode(contenido).decode('ascii')
                )
            except OdooError as error:
                logger.warning('No se pudo escribir la foto en Odoo (%s): %s', usuario.pk, error)
                odoo = 'error'
                mensaje = (
                    'Tu foto quedó en appSupli, pero no se pudo actualizar en Odoo. '
                    'Vuelve a intentarlo más tarde.'
                )
            else:
                odoo, mensaje = 'actualizada', 'Foto actualizada en appSupli y en Odoo.'

        return Response(
            {'user': UserSerializer(usuario).data, 'odoo': odoo, 'message': mensaje}
        )
