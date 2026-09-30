"""
Pruebas de cuentas: quién puede existir en la plataforma y quién puede entrar.

No son lo mismo. Los asesores y promotores de punto de venta no tienen cuenta
corporativa, pero sí tienen que existir acá: su jefe les registra objetivos y
entran en los rankings. Cuando llegue la sincronización con Odoo van a llegar
así, sin correo, y eso no puede romper nada.
"""
import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User

pytestmark = pytest.mark.django_db

RUTA = '/api/admin/users'


def cliente_admin() -> APIClient:
    admin = User.objects.create_superuser(
        email='admin@supli.tech', username='admin', first_name='Admin', password='clave-123456'
    )
    cliente = APIClient()
    cliente.force_authenticate(user=admin)
    return cliente


def test_un_asesor_sin_correo_se_crea_y_no_inicia_sesion():
    respuesta = cliente_admin().post(
        RUTA,
        {
            'username': 'asesor.norte',
            'firstName': 'Asesor',
            'lastName': 'PDV Norte',
            'position': 'Promotor',
            'puntoVenta': 'CAV Titán Plaza',
            'pais': 'Colombia',
        },
        format='json',
    )

    assert respuesta.status_code == 201, respuesta.data
    asesor = User.objects.get(username='asesor.norte')
    # Nulo y no cadena vacía: dos vacíos chocarían contra el índice único.
    assert asesor.email is None
    assert asesor.puede_iniciar_sesion is False
    assert respuesta.json()['puedeIniciarSesion'] is False


def test_dos_personas_sin_correo_conviven():
    cliente = cliente_admin()
    for numero in (1, 2):
        respuesta = cliente.post(
            RUTA,
            {'username': f'promotor{numero}', 'firstName': f'Promotor {numero}'},
            format='json',
        )
        assert respuesta.status_code == 201, respuesta.data

    assert User.objects.filter(email__isnull=True).count() == 2


def test_el_correo_sigue_siendo_unico_entre_quienes_lo_tienen():
    cliente = cliente_admin()
    datos = {'email': 'repetido@supli.tech', 'username': 'uno', 'firstName': 'Uno'}
    assert cliente.post(RUTA, datos, format='json').status_code == 201

    repetido = cliente.post(
        RUTA, {**datos, 'username': 'dos', 'firstName': 'Dos'}, format='json'
    )

    assert repetido.status_code == 400
    assert 'email' in repetido.data['errors']


def test_sin_correo_no_se_entra_aunque_exista_la_cuenta():
    User.objects.create_user(username='asesor', first_name='Asesor', password='clave-123456')

    respuesta = APIClient().post(
        '/api/auth/login', {'email': '', 'password': 'clave-123456'}, format='json'
    )

    assert respuesta.status_code == 400


# ── Aviso de instalar la app ─────────────────────────────────────────────────


def entrar(email: str = 'ana@supli.tech') -> dict:
    respuesta = APIClient().post(
        '/api/auth/login', {'email': email, 'password': 'clave-123456'}, format='json'
    )
    assert respuesta.status_code == 200, respuesta.data
    return respuesta.json()['user']


def persona() -> User:
    return User.objects.create_user(
        email='ana@supli.tech', username='ana', first_name='Ana', password='clave-123456'
    )


def decidir(usuario: User, decision: str):
    cliente = APIClient()
    cliente.force_authenticate(user=usuario)
    return cliente.post('/api/auth/instalacion-app', {'decision': decision}, format='json')


def test_al_primer_ingreso_se_ofrece_instalar_la_app():
    persona()
    assert entrar()['avisoApp'] == 'ofrecer'


def test_mas_tarde_vuelve_a_ofrecerse_al_tercer_ingreso():
    ana = persona()
    respuesta = decidir(ana, 'despues')
    assert respuesta.status_code == 200
    assert respuesta.json()['avisoApp'] is None

    assert entrar()['avisoApp'] is None
    assert entrar()['avisoApp'] is None
    assert entrar()['avisoApp'] == 'ofrecer'


def test_instalada_se_recuerda_como_reinstalarla_cada_diez_ingresos():
    ana = persona()
    respuesta = decidir(ana, 'instalada')
    assert respuesta.json()['appInstalada'] is True
    assert respuesta.json()['avisoApp'] is None

    for _ in range(9):
        assert entrar()['avisoApp'] is None
    assert entrar()['avisoApp'] == 'recordar'

    # Leído el recordatorio, sigue instalada y vuelve a contar diez.
    ana.refresh_from_db()
    respuesta = decidir(ana, 'visto')
    assert respuesta.json()['appInstalada'] is True
    assert respuesta.json()['avisoApp'] is None
    for _ in range(9):
        assert entrar()['avisoApp'] is None
    assert entrar()['avisoApp'] == 'recordar'


def test_la_decision_debe_ser_una_conocida():
    assert decidir(persona(), 'nunca').status_code == 400
