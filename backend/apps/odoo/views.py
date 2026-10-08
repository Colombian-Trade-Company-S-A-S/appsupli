"""Odoo en Administración: probar la conexión, sincronizar y ver la bitácora."""
from dataclasses import asdict

from django.http import HttpResponse

from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.accounts.api_permissions import IsPlatformAdmin

from .accesos import generar_accesos, nombre_archivo, pendientes_de_acceso
from .client import OdooClient
from .models import Sincronizacion
from .serializers import OpcionesSincronizacionSerializer, SincronizacionSerializer
from .sync import sincronizar as correr_sincronizacion


def _ultima():
    ultima = Sincronizacion.objects.filter(simulacion=False).select_related('ejecutada_por').first()
    return SincronizacionSerializer(ultima).data if ultima else None


@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def estado(request):
    """GET /api/admin/odoo/estado — prueba la conexión con Odoo en este momento."""
    return Response({**asdict(OdooClient().estado()), 'ultima_sincronizacion': _ultima()})


@api_view(['POST'])
@permission_classes([IsPlatformAdmin])
def sincronizar(request):
    """POST /api/admin/odoo/sincronizar — trae de Odoo y guarda en la base de appsupli."""
    opciones = OpcionesSincronizacionSerializer(data=request.data)
    opciones.is_valid(raise_exception=True)
    # Si Odoo falla, la respuesta igual es 200: el registro trae `estado` y
    # `error`, y la pantalla lo muestra como cualquier otro resultado.
    registro = correr_sincronizacion(**opciones.validated_data, ejecutada_por=request.user)
    return Response(SincronizacionSerializer(registro).data)


@api_view(['GET'])
@permission_classes([IsPlatformAdmin])
def sincronizaciones(request):
    """GET /api/admin/odoo/sincronizaciones — las últimas 20, con vistas previas incluidas."""
    registros = Sincronizacion.objects.select_related('ejecutada_por')[:20]
    return Response(SincronizacionSerializer(registros, many=True).data)


@api_view(['GET', 'POST'])
@permission_classes([IsPlatformAdmin])
def accesos(request):
    """
    GET  /api/admin/odoo/accesos — cuántos están pendientes de clave.
    POST /api/admin/odoo/accesos — les genera la clave y descarga el Excel.

    Solo a quien no tiene clave todavía: a nadie que ya entra se la cambia.
    """
    if request.method == 'GET':
        return Response({'pendientes': len(pendientes_de_acceso())})
    cantidad, contenido = generar_accesos()
    if not cantidad:
        return Response({'message': 'No hay personas pendientes de acceso.'}, status=400)
    respuesta = HttpResponse(
        contenido, content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    respuesta['Content-Disposition'] = f'attachment; filename="{nombre_archivo()}"'
    return respuesta
