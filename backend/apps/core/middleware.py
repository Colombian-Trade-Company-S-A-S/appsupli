"""Middlewares propios de la plataforma."""
from django.http import JsonResponse

RUTA_SALUD = '/api/health'


class SaludMiddleware:
    """
    Responde `/api/health` antes que todo lo demás.

    Es la ruta del health check de Render. Va primero en la cadena a propósito:
    la sonda llega desde la red interna, así que no debe pasar por la
    validación de host ni por la redirección a https, y tampoco toca la base.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path == RUTA_SALUD:
            return JsonResponse({'status': 'ok'})
        return self.get_response(request)
