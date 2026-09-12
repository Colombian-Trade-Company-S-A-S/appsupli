"""
Enlaces públicos del tablero: verlo sin cuenta, con contraseña.

Un enlace se compone de dos secretos que no viajan juntos:

  · el **token**, que va en la URL y dice *qué* enlace es;
  · la **contraseña**, que se entrega aparte y prueba que quien abre la URL
    tiene permiso.

La contraseña se guarda solo como hash —igual que la de una cuenta—, así que
se muestra una vez al crear el enlace y nunca más: si se pierde, se genera otra.

Con la contraseña correcta se emite un **acceso**: un valor firmado que vence y
que el navegador manda en cada consulta. Así la contraseña no se guarda en el
navegador ni viaja en cada petición. Regenerar la contraseña sube la versión
del enlace y deja sin efecto los accesos que ya se habían emitido.

Lo que ve el enlace es de solo lectura y está acotado a propósito: los tres
cálculos del tablero y los catálogos mínimos para sus filtros. No hay
exportación, importación ni CRUD, y los catálogos no llevan precios.
"""
import secrets

from django.contrib.auth.hashers import check_password, make_password
from django.core import signing
from django.db.models import F
from django.utils import timezone
from rest_framework import exceptions, mixins, serializers, status, viewsets
from rest_framework.decorators import (
    action,
    api_view,
    authentication_classes,
    permission_classes,
    throttle_classes,
)
from rest_framework.permissions import AllowAny, BasePermission
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle

from .api_permissions import CanManageData, HasBiTradeApp
from .canales import CANALES, CLARO, Canal
from .models import Campana, CanalEnlace, EnlacePublico
from .views import _calcular_avance, _calcular_concurso, _calcular_dia, opciones_de

#: Cuánto dura un acceso antes de volver a pedir la contraseña: una jornada.
DURACION_ACCESO = 12 * 60 * 60
SAL_ACCESO = 'bi-trade.enlace-publico'
CABECERA_ACCESO = 'X-Acceso-Publico'

#: Letras y números que no se confunden al dictarlos ni al leerlos en un
#: celular: fuera el 0 y la O, el 1, la l y la I.
ALFABETO_CLAVE = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'


def nueva_clave() -> str:
    """
    Doce caracteres en tres bloques: `Kf7m-Qx2p-Rt9w`.

    Son unos 69 bits de azar: probarla por fuerza bruta no es viable ni sin el
    límite de intentos. Los guiones son solo para leerla; al validar se
    ignoran, igual que los espacios.
    """
    caracteres = ''.join(secrets.choice(ALFABETO_CLAVE) for _ in range(12))
    return '-'.join(caracteres[i:i + 4] for i in range(0, 12, 4))


def normalizar_clave(clave: str) -> str:
    """La clave sin guiones ni espacios: así se guarda y así se compara."""
    return (clave or '').replace('-', '').replace(' ', '').strip()


def nuevo_token() -> str:
    """El identificador de la URL: 32 caracteres de azar, no se adivina."""
    return secrets.token_urlsafe(24)


def emitir_acceso(enlace: EnlacePublico) -> str:
    """El acceso firmado: qué enlace y con qué versión de la contraseña."""
    return signing.dumps({'e': enlace.pk, 'v': enlace.version}, salt=SAL_ACCESO)


def enlace_vigente(token: str) -> EnlacePublico:
    """
    El enlace del token, si existe, sigue vigente y es de un tablero.

    Un enlace revocado o vencido responde igual que uno que nunca existió: a
    quien tiene la URL no le sirve saber cuál de las dos cosas pasó. Los del
    formulario tampoco entran por aquí: tienen su propio módulo y su propia
    puerta, y este lado nunca los abre.
    """
    enlace = EnlacePublico.objects.filter(token=token).exclude(canal=CanalEnlace.PARTNERS).first()
    if enlace is None or not enlace.vigente:
        raise exceptions.NotFound('Este enlace no existe o ya no está disponible.')
    return enlace


class TieneAccesoPublico(BasePermission):
    """
    La puerta de las consultas públicas: un acceso vigente para este enlace.

    Primero se valida el enlace —si lo revocaron, 404 aunque el acceso siga
    firmado— y después el acceso: firma, vencimiento, que sea de este enlace y
    de la versión actual de la contraseña.
    """

    message = 'Tu acceso venció. Vuelve a escribir la contraseña.'

    def has_permission(self, request, view) -> bool:
        enlace = enlace_vigente(view.kwargs.get('token', ''))
        firmado = request.headers.get(CABECERA_ACCESO, '')
        try:
            datos = signing.loads(firmado, salt=SAL_ACCESO, max_age=DURACION_ACCESO)
        except signing.BadSignature:  # incluye SignatureExpired
            return False
        if datos.get('e') != enlace.pk or datos.get('v') != enlace.version:
            return False
        request.enlace_publico = enlace
        return True


class IntentosDeClave(SimpleRateThrottle):
    """
    Límite de intentos de contraseña, por IP y por enlace.

    Va por enlace y no solo por IP para que probar contra un enlace no bloquee
    a la misma oficina —que comparte IP— cuando abre otro.
    """

    scope = 'enlace_publico'

    def get_cache_key(self, request, view):
        return self.cache_format % {
            'scope': self.scope,
            'ident': f'{self.get_ident(request)}:{view.kwargs.get("token", "")}',
        }


# ── Entrada al enlace ──────────────────────────────────────────────────────

@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def info(request, token):
    """Lo mínimo para la pantalla de contraseña: que el enlace existe y su nombre."""
    enlace = enlace_vigente(token)
    return Response({'nombre': enlace.nombre, 'canal': enlace.canal})


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([IntentosDeClave])
def acceso(request, token):
    """Cambia la contraseña por un acceso firmado que vence."""
    enlace = enlace_vigente(token)
    clave = normalizar_clave(str(request.data.get('clave', '')))
    if not clave or not check_password(clave, enlace.clave_hash):
        return Response(
            {'code': 'clave_incorrecta', 'message': 'La contraseña no es correcta.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    EnlacePublico.objects.filter(pk=enlace.pk).update(
        accesos=F('accesos') + 1, ultimo_acceso=timezone.now()
    )
    return Response(
        {
            'acceso': emitir_acceso(enlace),
            'nombre': enlace.nombre,
            'canal': enlace.canal,
            'duracion': DURACION_ACCESO,
        }
    )


# ── Consultas de solo lectura ──────────────────────────────────────────────

def _vista_publica(funcion):
    """Una consulta del tablero público: sin cuenta, con un acceso vigente."""
    funcion = permission_classes([TieneAccesoPublico])(funcion)
    funcion = authentication_classes([])(funcion)
    return api_view(['GET'])(funcion)


def canal_del_enlace(request) -> Canal:
    """El canal del enlace que abrió la consulta: Claro, Homecenter o Falabella."""
    return CANALES.get(request.enlace_publico.canal, CLARO)


@_vista_publica
def avance_mensual(request, token):
    return Response(_calcular_avance(request, canal_del_enlace(request)))


@_vista_publica
def cumplimiento_diario(request, token):
    return Response(_calcular_dia(request, canal_del_enlace(request)))


@_vista_publica
def tickets(request, token):
    # El concurso es de Claro: un enlace de otro canal no lo ve.
    if canal_del_enlace(request) is not CLARO:
        raise exceptions.NotFound('Este tablero no tiene concurso de tickets.')
    return Response(_calcular_concurso(request))


@_vista_publica
def opciones(request, token):
    return Response(opciones_de(canal_del_enlace(request)))


@_vista_publica
def productos(request, token):
    """Solo lo que piden los filtros: código, nombre y marca. Sin precios."""
    canal = canal_del_enlace(request)
    return Response(
        list(
            canal.producto.objects.order_by('nombre_producto').values(
                'id_producto', 'nombre_producto', 'marca'
            )
        )
    )


@_vista_publica
def puntos_venta(request, token):
    canal = canal_del_enlace(request)
    return Response(
        list(
            canal.punto.objects.order_by('nombre_pdv').values(
                'id_punto_venta', 'nombre_pdv', 'regional'
            )
        )
    )


@_vista_publica
def campanas(request, token):
    if canal_del_enlace(request) is not CLARO:
        return Response([])
    return Response(
        list(Campana.objects.order_by('-desde', 'nombre').values('id_campana', 'nombre', 'activa'))
    )


# ── Gestión: quién crea y revoca los enlaces ───────────────────────────────

class EnlacePublicoSerializer(serializers.ModelSerializer):
    vigente = serializers.BooleanField(read_only=True)
    creado_por = serializers.SerializerMethodField()

    class Meta:
        model = EnlacePublico
        fields = (
            'id_enlace',
            'nombre',
            'canal',
            'token',
            'activo',
            'expira',
            'vigente',
            'accesos',
            'ultimo_acceso',
            'created_at',
            'creado_por',
        )
        read_only_fields = ('token', 'accesos', 'ultimo_acceso', 'created_at')

    def get_creado_por(self, obj) -> str:
        usuario = obj.creado_por
        if usuario is None:
            return ''
        nombre = usuario.get_full_name() if hasattr(usuario, 'get_full_name') else ''
        return nombre or getattr(usuario, 'email', '')

    def validate_expira(self, valor):
        if valor is not None and valor <= timezone.now():
            raise serializers.ValidationError('La fecha de vencimiento ya pasó.')
        return valor


class EnlacePublicoViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """
    Crear, revocar y regenerar enlaces públicos.

    Exige el permiso de edición y no solo la app: compartir el tablero con
    alguien sin cuenta es sacar datos del negocio, no consultarlos.
    """

    queryset = EnlacePublico.objects.select_related('creado_por').order_by('-created_at')
    serializer_class = EnlacePublicoSerializer
    permission_classes = [HasBiTradeApp, CanManageData]
    pagination_class = None

    def get_queryset(self):
        # `?canal=hc` lista solo los de Homecenter, `?canal=falabella` los de
    # Falabella: cada tablero muestra sus
        # propios enlaces.
        consulta = super().get_queryset()
        canal = self.request.query_params.get('canal')
        return consulta.filter(canal=canal) if canal else consulta

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # El formulario del plan va abierto: se diligencia a diario y no
        # muestra nada, así que no tiene contraseña que entregar.
        abierto = serializer.validated_data.get('canal') == CanalEnlace.PARTNERS
        clave = '' if abierto else nueva_clave()
        enlace = serializer.save(
            token=nuevo_token(),
            clave_hash='' if abierto else make_password(normalizar_clave(clave)),
            creado_por=request.user,
        )
        # La contraseña solo sale en esta respuesta: se guarda como hash y no
        # se puede volver a leer.
        return Response(
            {**self.get_serializer(enlace).data, 'clave': clave},
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['post'], url_path='regenerar-clave')
    def regenerar_clave(self, request, pk=None):
        """
        Una contraseña nueva para el mismo enlace.

        La URL no cambia —quien la tiene guardada no la pierde—, pero la
        versión sube y los accesos abiertos con la clave vieja dejan de valer.
        """
        enlace = self.get_object()
        if enlace.canal == CanalEnlace.PARTNERS:
            return Response(
                {
                    'code': 'sin_clave',
                    'message': (
                        'El formulario es abierto: no tiene contraseña que regenerar. '
                        'Si quieres cortarlo, revoca el enlace y crea otro.'
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        clave = nueva_clave()
        enlace.clave_hash = make_password(normalizar_clave(clave))
        enlace.version += 1
        enlace.save(update_fields=['clave_hash', 'version', 'updated_at'])
        return Response({**self.get_serializer(enlace).data, 'clave': clave})
