"""Foto de perfil: se sube, se sirve por dirección firmada, va a Odoo y vuelve de Odoo."""
import base64
from unittest import mock

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.odoo.client import OdooError
from apps.odoo.sync import sincronizar_fotos

pytestmark = pytest.mark.django_db

#: Un JPEG mínimo: lo que importa son los bytes del comienzo y el tamaño.
JPEG = b'\xff\xd8\xff\xe0' + b'\x00' * 2000
PNG = b'\x89PNG\r\n\x1a\n' + b'\x01' * 2000


def _usuario(odoo_id=None) -> User:
    return User.objects.create_user(
        email='ana@supli.tech', username='ana', first_name='Ana', password='clave-123-segura',
        odoo_id=odoo_id,
    )


def _cliente(usuario) -> APIClient:
    cliente = APIClient()
    cliente.force_authenticate(user=usuario)
    return cliente


def _subir(usuario, contenido=JPEG, nombre='foto.jpg'):
    return _cliente(usuario).put(
        '/api/auth/me/foto',
        {'foto': SimpleUploadedFile(nombre, contenido, content_type='image/jpeg')},
        format='multipart',
    )


def test_la_foto_se_guarda_y_se_escribe_en_odoo():
    ana = _usuario(odoo_id=77)
    with mock.patch('apps.accounts.fotos.OdooClient') as odoo:
        respuesta = _subir(ana)

    assert respuesta.status_code == 200, respuesta.data
    assert respuesta.json()['odoo'] == 'actualizada'
    odoo.return_value.actualizar_foto.assert_called_once_with(
        77, base64.b64encode(JPEG).decode('ascii')
    )
    ana.refresh_from_db()
    assert bytes(ana.foto) == JPEG and ana.foto_tipo == 'image/jpeg'
    assert respuesta.json()['user']['foto'].startswith('auth/fotos/')


def test_si_odoo_falla_la_foto_queda_igual_en_appsupli():
    ana = _usuario(odoo_id=77)
    with mock.patch('apps.accounts.fotos.OdooClient') as odoo:
        odoo.return_value.actualizar_foto.side_effect = OdooError('sin conexión')
        respuesta = _subir(ana)

    assert respuesta.status_code == 200
    assert respuesta.json()['odoo'] == 'error'
    ana.refresh_from_db()
    assert bytes(ana.foto) == JPEG


def test_las_pruebas_nunca_llegan_al_odoo_real():
    """Sin simular el cliente, la subida falla contra Odoo en vez de escribir en el real."""
    respuesta = _subir(_usuario(odoo_id=77))
    assert respuesta.json()['odoo'] == 'error'


def test_sin_enlace_con_odoo_no_se_intenta_escribir():
    ana = _usuario()
    with mock.patch('apps.accounts.fotos.OdooClient') as odoo:
        respuesta = _subir(ana)
    assert respuesta.json()['odoo'] == 'sin_vinculo'
    odoo.assert_not_called()


def test_solo_se_aceptan_imagenes():
    ana = _usuario()
    respuesta = _subir(ana, contenido=b'%PDF-1.7 no soy una foto', nombre='foto.jpg')
    assert respuesta.status_code == 400


def test_la_foto_se_sirve_sin_sesion_con_la_direccion_firmada():
    ana = _usuario()
    _subir(ana)
    ruta = _cliente(ana).get('/api/auth/me').json()['foto']

    respuesta = APIClient().get(f'/api/{ruta}')

    assert respuesta.status_code == 200
    assert respuesta['Content-Type'] == 'image/jpeg'
    assert respuesta.content == JPEG
    assert 'immutable' in respuesta['Cache-Control']
    assert APIClient().get('/api/auth/fotos/firma-inventada').status_code == 404


def test_la_sincronizacion_trae_las_fotos_de_odoo():
    ana = _usuario(odoo_id=77)
    cliente = mock.Mock()
    cliente.fotos.return_value = {77: base64.b64encode(PNG).decode('ascii')}

    assert sincronizar_fotos(cliente) == 1
    ana.refresh_from_db()
    assert bytes(ana.foto) == PNG and ana.foto_tipo == 'image/png'
    # La misma foto no se vuelve a guardar.
    assert sincronizar_fotos(cliente) == 0


def test_la_imagen_vacia_de_odoo_no_borra_ni_reemplaza_la_foto():
    ana = _usuario(odoo_id=77)
    with mock.patch('apps.accounts.fotos.OdooClient'):
        _subir(ana)
    cliente = mock.Mock()
    cliente.fotos.return_value = {77: base64.b64encode(b'\xff\xd8\xff' + b'\x00' * 100).decode()}

    assert sincronizar_fotos(cliente) == 0
    ana.refresh_from_db()
    assert bytes(ana.foto) == JPEG
