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


def test_un_asesor_sin_correo_existe_y_no_inicia_sesion():
    # Así llegan de Odoo los asesores de punto de venta: sin correo corporativo.
    asesor = User.objects.create(username='asesor.norte', first_name='Asesor', email=None)
    fila = next(
        u for u in cliente_admin().get(RUTA).json()['items'] if u['username'] == 'asesor.norte'
    )
    assert asesor.puede_iniciar_sesion is False
    assert fila['puedeIniciarSesion'] is False


def test_dos_personas_sin_correo_conviven():
    # Nulo y no cadena vacía: dos vacíos chocarían contra el índice único.
    User.objects.create(username='promotor1', first_name='Promotor 1', email=None)
    User.objects.create(username='promotor2', first_name='Promotor 2', email=None)
    assert User.objects.filter(email__isnull=True).count() == 2


def test_el_correo_sigue_siendo_unico_entre_quienes_lo_tienen():
    cliente = cliente_admin()
    User.objects.create_user(email='repetido@supli.tech', username='uno', first_name='Uno', password='clave-123456')
    dos = User.objects.create(username='dos', first_name='Dos')

    repetido = cliente.patch(f'{RUTA}/{dos.id}', {'email': 'repetido@supli.tech'}, format='json')

    assert repetido.status_code == 400
    assert 'email' in repetido.data['errors']


def test_los_usuarios_no_se_crean_ni_se_borran_desde_administracion():
    cliente = cliente_admin()
    otro = User.objects.create(username='otro', first_name='Otro')
    assert cliente.post(RUTA, {'username': 'nuevo', 'firstName': 'Nuevo'}, format='json').status_code == 405
    assert cliente.delete(f'{RUTA}/{otro.id}').status_code == 405
    assert User.objects.filter(username='otro').exists()
    # Activar e inactivar sí: es un tema de acceso.
    assert cliente.post(f'{RUTA}/{otro.id}/toggle-active').status_code == 200


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


# ── Listados de Administración: consultas fijas, no una por fila ───────────
#
# Contra el Postgres de Render cada consulta es un viaje de red. Si un listado
# hace una por fila, con 200 usuarios la pantalla tarda segundos; estas
# pruebas fallan si el número de consultas vuelve a crecer con las filas.


def poblar_accesos(desde: int, hasta: int) -> None:
    """Personas con área, app, rol y permiso extra; y un área, app y rol por cada una."""
    from apps.accounts.models import Application, Area, Permission, Role

    for numero in range(desde, hasta):
        area = Area.objects.create(name=f'Área {numero}')
        app = Application.objects.create(
            code=f'app-{numero}', name=f'App {numero}', base_path=f'/inicio/app-{numero}'
        )
        permiso = Permission.objects.create(
            code=f'app-{numero}:data:manage', name='Editar', application=app
        )
        rol = Role.objects.create(code=f'rol-{numero}', name=f'Rol {numero}')
        rol.permissions.add(permiso)
        usuario = User.objects.create_user(
            email=f'persona{numero}@supli.tech',
            username=f'persona{numero}',
            first_name=f'Persona {numero}',
            password='clave-123456',
            area=area,
        )
        usuario.applications.add(app)
        usuario.roles.add(rol)
        usuario.extra_permissions.add(permiso)


def contar_consultas(cliente: APIClient, ruta: str) -> int:
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    with CaptureQueriesContext(connection) as capturadas:
        respuesta = cliente.get(ruta, {'page_size': 200})
    assert respuesta.status_code == 200, respuesta.data
    return len(capturadas)


@pytest.mark.parametrize(
    'ruta',
    [
        RUTA,
        '/api/admin/areas',
        '/api/admin/applications',
        '/api/admin/roles',
        '/api/admin/permissions',
    ],
)
def test_los_listados_no_hacen_una_consulta_por_fila(ruta):
    cliente = cliente_admin()
    poblar_accesos(0, 2)
    pocas = contar_consultas(cliente, ruta)
    poblar_accesos(2, 30)
    muchas = contar_consultas(cliente, ruta)
    assert muchas == pocas, f'{ruta}: {pocas} consultas con 2 filas y {muchas} con 30'


def test_el_listado_de_usuarios_sigue_trayendo_sus_accesos():
    cliente = cliente_admin()
    poblar_accesos(0, 1)
    fila = next(u for u in cliente.get(RUTA).json()['items'] if u['username'] == 'persona0')
    assert fila['applicationNames'] == ['App 0']
    assert fila['roleNames'] == ['Rol 0']
    assert len(fila['extraPermissions']) == 1

    areas = {a['name']: a['userCount'] for a in cliente.get('/api/admin/areas').json()['items']}
    assert areas['Área 0'] == 1
    roles = {r['name']: r['userCount'] for r in cliente.get('/api/admin/roles').json()['items']}
    assert roles['Rol 0'] == 1
