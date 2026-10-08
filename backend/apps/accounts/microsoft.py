"""
Ingreso con Microsoft (Entra ID).

El navegador inicia sesión con MSAL (PKCE, sin secreto) y manda el id_token. Aquí
se valida contra las llaves públicas de Microsoft —firma, inquilino, aplicación
y vencimiento— y se cruza `preferred_username` con el correo que llegó de Odoo.
Si todo cuadra, la persona recibe la misma sesión de appsupli que con contraseña.
"""
from functools import lru_cache

import jwt
from django.conf import settings


class TokenMicrosoftInvalido(Exception):
    """El token no es de nuestro inquilino o aplicación, venció o está alterado."""


def _emisor() -> str:
    return f'https://login.microsoftonline.com/{settings.MICROSOFT_TENANT_ID}/v2.0'


@lru_cache(maxsize=1)
def _llaves() -> jwt.PyJWKClient:
    # PyJWKClient guarda las llaves en memoria y solo vuelve a pedirlas cuando
    # aparece una que no conoce (Microsoft las rota cada tanto).
    return jwt.PyJWKClient(
        f'https://login.microsoftonline.com/{settings.MICROSOFT_TENANT_ID}/discovery/v2.0/keys',
        cache_keys=True,
        timeout=10,
    )


def validar_id_token(id_token: str) -> dict:
    """Devuelve los datos del token si es válido; si no, `TokenMicrosoftInvalido`."""
    try:
        llave = _llaves().get_signing_key_from_jwt(id_token).key
        datos = jwt.decode(
            id_token,
            llave,
            algorithms=['RS256'],
            audience=settings.MICROSOFT_CLIENT_ID,
            issuer=_emisor(),
            options={'require': ['exp', 'iat', 'aud', 'iss', 'tid']},
        )
    except jwt.PyJWKClientError as error:
        raise TokenMicrosoftInvalido('No se pudieron leer las llaves de Microsoft.') from error
    except jwt.InvalidTokenError as error:
        raise TokenMicrosoftInvalido(f'Token de Microsoft inválido: {error}') from error

    if datos['tid'] != settings.MICROSOFT_TENANT_ID:
        raise TokenMicrosoftInvalido('La cuenta no es del directorio de Supli.')
    return datos


def correo_del_token(datos: dict) -> str:
    """El dato de cruce que definió IT: `preferred_username` (el UPN)."""
    correo = datos.get('preferred_username') or datos.get('upn') or datos.get('email') or ''
    return correo.strip().lower()
