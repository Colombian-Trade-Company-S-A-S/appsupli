"""Normaliza los errores de la API a la forma que espera el frontend."""
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from rest_framework import exceptions
from rest_framework.response import Response
from rest_framework.views import exception_handler


def api_exception_handler(exc, context) -> Response | None:
    if isinstance(exc, DjangoValidationError):
        detail = exc.message_dict if hasattr(exc, 'message_dict') else exc.messages
        exc = exceptions.ValidationError(detail=detail)
    if isinstance(exc, Http404):
        exc = exceptions.NotFound()

    response = exception_handler(exc, context)
    if response is None:
        return None

    detail = response.data
    payload: dict[str, object] = {'code': getattr(exc, 'default_code', 'error')}

    if isinstance(detail, dict) and 'detail' in detail:
        valor = detail['detail']
        # DRF envuelve los mensajes en listas: se toma el primero.
        payload['message'] = str(valor[0] if isinstance(valor, list) and valor else valor)
    elif isinstance(detail, dict):
        # Errores de validación por campo → {message, errors: {campo: [...]}}
        payload['message'] = 'Los datos enviados no son válidos.'
        payload['errors'] = {
            field: [str(m) for m in (msgs if isinstance(msgs, list) else [msgs])]
            for field, msgs in detail.items()
        }
    else:
        payload['message'] = str(detail)

    response.data = payload
    return response
