"""
Ingreso con Microsoft.

Los tokens se firman aquí con una llave RSA propia, que hace las veces de la de
Microsoft: así se prueba la validación de verdad sin salir a la red.
"""
import time
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from django.conf import settings
from rest_framework.test import APIClient

from apps.accounts import microsoft
from apps.accounts.models import User

pytestmark = pytest.mark.django_db

LLAVE = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTRA_LLAVE = rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture(autouse=True)
def llaves_de_microsoft(monkeypatch):
    cliente = SimpleNamespace(get_signing_key_from_jwt=lambda _: SimpleNamespace(key=LLAVE.public_key()))
    monkeypatch.setattr(microsoft, '_llaves', lambda: cliente)


def token(llave=LLAVE, **cambios) -> str:
    ahora = int(time.time())
    datos = {
        'iss': f'https://login.microsoftonline.com/{settings.MICROSOFT_TENANT_ID}/v2.0',
        'aud': settings.MICROSOFT_CLIENT_ID,
        'tid': settings.MICROSOFT_TENANT_ID,
        'iat': ahora,
        'exp': ahora + 3600,
        'preferred_username': 'Angie@Supli.tech',
        **cambios,
    }
    return jwt.encode(datos, llave, algorithm='RS256', headers={'kid': 'k1'})


def entrar(id_token: str):
    return APIClient().post('/api/auth/microsoft', {'idToken': id_token}, format='json')


@pytest.fixture
def angie():
    return User.objects.create(username='angie', first_name='Angie', email='angie@supli.tech')


def test_entra_quien_tiene_el_mismo_correo_que_en_odoo(angie):
    respuesta = entrar(token())
    assert respuesta.status_code == 200, respuesta.data
    datos = respuesta.json()
    assert datos['user']['email'] == 'angie@supli.tech'
    assert datos['accessToken'] and datos['refreshToken']
    # Con esa sesión ya se usa la API como siempre.
    cliente = APIClient()
    cliente.credentials(HTTP_AUTHORIZATION=f'Bearer {datos["accessToken"]}')
    assert cliente.get('/api/auth/me').status_code == 200


def test_no_entra_quien_no_esta_en_appsupli():
    respuesta = entrar(token())
    assert respuesta.status_code == 403
    assert 'Odoo' in respuesta.json()['message']


def test_no_entra_una_cuenta_desactivada(angie):
    angie.is_active = False
    angie.save()
    assert entrar(token()).status_code == 403


@pytest.mark.parametrize('cambios', [
    {'aud': 'otra-aplicacion'},
    {'tid': 'otro-directorio'},
    {'iss': 'https://login.microsoftonline.com/otro/v2.0'},
    {'exp': int(time.time()) - 60},
])
def test_rechaza_tokens_de_otra_app_otro_directorio_o_vencidos(angie, cambios):
    assert entrar(token(**cambios)).status_code == 401


def test_rechaza_un_token_con_firma_falsa(angie):
    assert entrar(token(llave=OTRA_LLAVE)).status_code == 401


def test_sin_token_no_hay_nada_que_validar():
    assert entrar('').status_code == 400


# ── Apagar la contraseña ─────────────────────────────────────────────────
def login_con_clave(email):
    return APIClient().post('/api/auth/login', {'email': email, 'password': 'clave-123456'}, format='json')


def test_con_la_contrasena_apagada_solo_entra_la_cuenta_de_respaldo(settings):
    User.objects.create_user(email='ana@supli.tech', username='ana', first_name='Ana', password='clave-123456')
    User.objects.create_user(email='respaldo@supli.tech', username='resp', first_name='R', password='clave-123456')
    settings.LOGIN_CONTRASENA_ACTIVO = False
    settings.LOGIN_CONTRASENA_RESPALDO = ['respaldo@supli.tech']

    assert login_con_clave('ana@supli.tech').status_code == 400
    assert login_con_clave('respaldo@supli.tech').status_code == 200


def test_la_configuracion_de_ingreso(settings):
    settings.LOGIN_CONTRASENA_ACTIVO = False
    datos = APIClient().get('/api/auth/ingreso').json()
    assert datos['microsoft'] == {
        'tenantId': settings.MICROSOFT_TENANT_ID,
        'clientId': settings.MICROSOFT_CLIENT_ID,
    }
    assert datos['contrasena'] is False
