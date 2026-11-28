"""
Pruebas de cuentas: quién puede existir en la plataforma y quién puede entrar.

No son lo mismo. Los asesores y promotores de punto de venta no tienen cuenta
corporativa, pero sí tienen que existir acá: su jefe les registra objetivos y
entran en los rankings. Cuando llegue la sincronización con Odoo van a llegar
así, sin correo, y eso no puede romper nada.
"""
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Application, User

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


def test_al_asesor_de_odoo_se_le_pone_su_correo_personal_y_entra():
    cliente = cliente_admin()
    asesor = User.objects.create(username='asesor', first_name='Asesor', odoo_id=500)
    asesor.set_unusable_password()
    asesor.save()

    respuesta = cliente.patch(
        f'{RUTA}/{asesor.id}', {'email': 'Asesor.Norte@Gmail.com', 'password': 'Clave-temporal-9'}, format='json'
    )

    assert respuesta.status_code == 200, respuesta.data
    assert respuesta.json()['correoEditable'] is True
    asesor.refresh_from_db()
    assert asesor.email == 'asesor.norte@gmail.com'
    ingreso = APIClient().post(
        '/api/auth/login', {'email': 'asesor.norte@gmail.com', 'password': 'Clave-temporal-9'}, format='json'
    )
    assert ingreso.status_code == 200


def test_el_correo_corporativo_de_odoo_no_se_cambia_desde_administracion():
    cliente = cliente_admin()
    ana = User.objects.create(username='ana', first_name='Ana', email='ana@supli.tech', odoo_id=501)

    respuesta = cliente.patch(f'{RUTA}/{ana.id}', {'email': 'ana@gmail.com'}, format='json')

    assert respuesta.status_code == 200
    assert respuesta.json()['correoEditable'] is False
    ana.refresh_from_db()
    assert ana.email == 'ana@supli.tech'


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


def _pasan_dias(usuario: User, dias: int) -> None:
    """Corre el reloj del aviso: como si lo hubiera respondido hace `dias` días."""
    User.objects.filter(pk=usuario.pk).update(
        aviso_app_visto_at=timezone.now() - timedelta(days=dias)
    )


def test_mas_tarde_vuelve_a_ofrecerse_a_los_15_dias():
    ana = persona()
    respuesta = decidir(ana, 'despues')
    assert respuesta.status_code == 200
    assert respuesta.json()['avisoApp'] is None

    # Ni en los siguientes inicios de sesión del día ni en los de las próximas semanas.
    for _ in range(5):
        assert entrar()['avisoApp'] is None
    _pasan_dias(ana, 14)
    assert entrar()['avisoApp'] is None
    _pasan_dias(ana, 15)
    assert entrar()['avisoApp'] == 'ofrecer'


def test_instalada_tambien_sale_cada_15_dias():
    ana = persona()
    respuesta = decidir(ana, 'instalada')
    assert respuesta.json()['appInstalada'] is True
    assert respuesta.json()['avisoApp'] is None

    for _ in range(10):
        assert entrar()['avisoApp'] is None
    _pasan_dias(ana, 15)
    assert entrar()['avisoApp'] == 'recordar'

    # Leído el recordatorio, sigue instalada y vuelve a contar 15 días.
    ana.refresh_from_db()
    respuesta = decidir(ana, 'visto')
    assert respuesta.json()['appInstalada'] is True
    assert respuesta.json()['avisoApp'] is None
    assert entrar()['avisoApp'] is None


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
    # Los roles y permisos sueltos, en el detalle: es donde se ven y se editan.
    detalle = cliente.get(f'{RUTA}/{fila["id"]}').json()
    assert detalle['roleNames'] == ['Rol 0']
    assert len(detalle['extraPermissions']) == 1

    areas = {a['name']: a['userCount'] for a in cliente.get('/api/admin/areas').json()['items']}
    assert areas['Área 0'] == 1
    roles = {r['name']: r['userCount'] for r in cliente.get('/api/admin/roles').json()['items']}
    assert roles['Rol 0'] == 1


def test_el_listado_de_usuarios_no_trae_fotos_ni_columnas_de_mas():
    """
    Ni la foto de la persona ni la de su jefe: con `select_related` la del jefe
    viajaba en cada fila y un listado de 70 personas tardaba 3 s contra Render.
    """
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    cliente = cliente_admin()
    jefe = User.objects.create(username='jefe', first_name='Jefa', foto=b'x' * 1000)
    User.objects.create(username='uno', first_name='Uno', manager=jefe, foto=b'y' * 1000)
    with CaptureQueriesContext(connection) as capturadas:
        filas = cliente.get(RUTA).json()['items']
    assert len(capturadas) == 3  # el conteo, las filas y sus apps
    assert all('"foto"' not in consulta['sql'] for consulta in capturadas.captured_queries)
    uno = next(f for f in filas if f['username'] == 'uno')
    assert uno['managerName'] == 'Jefa'


def test_el_detalle_no_trae_la_foto_del_jefe():
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    cliente = cliente_admin()
    jefe = User.objects.create(username='jefe', first_name='Jefa', foto=b'x' * 1000)
    uno = User.objects.create(username='uno', first_name='Uno', manager=jefe)
    with CaptureQueriesContext(connection) as capturadas:
        assert cliente.get(f'{RUTA}/{uno.id}').json()['managerName'] == 'Jefa'
    assert all('"foto"' not in consulta['sql'] for consulta in capturadas.captured_queries)


def test_administracion_solo_le_aparece_al_administrador():
    """Tenerla asignada no basta: a Administración solo entra la cuenta Administrador."""
    admin_app = Application.objects.create(
        code='admin', name='Administración', base_path='/inicio/admin'
    )
    otra = Application.objects.create(code='bi-trade', name='BI Trade', base_path='/inicio/bi')
    colaborador = User.objects.create_user(
        email='colab@supli.tech', username='colab', first_name='Colab', password='clave-123456'
    )
    colaborador.applications.add(admin_app, otra)
    administrador = User.objects.create_user(
        email='jefa@supli.tech',
        username='jefa',
        first_name='Jefa',
        password='clave-123456',
        kind=User.Kind.ADMIN,
    )

    assert set(colaborador.get_accessible_applications().values_list('code', flat=True)) == {
        'bi-trade'
    }
    assert colaborador.has_app_access('admin') is False
    assert administrador.has_app_access('admin') is True



# ── Permisos de Administración ─────────────────────────────────────────────
# Cada sección se abre con su permiso. Lo que ninguno da: volver administrador
# a alguien, dar accesos, tocar la cuenta de un administrador y eliminar.


def _con_permisos(*codigos: str, por_rol: bool = False, username: str = 've') -> User:
    """Una persona (no administradora) con esos permisos de Administración."""
    from apps.accounts.models import Permission, Role
    from apps.accounts.permisos_admin import CATALOGO

    admin_app, _ = Application.objects.get_or_create(
        code='admin', defaults={'name': 'Administración', 'base_path': '/inicio/admin'}
    )
    for p in CATALOGO:
        Permission.objects.get_or_create(
            code=p.code, defaults={'name': p.name, 'application': admin_app}
        )
    permisos = list(Permission.objects.filter(code__in=codigos))
    persona = User.objects.create_user(
        email=f'{username}@supli.tech', username=username, first_name='Ve', password='clave-1234'
    )
    if por_rol:
        rol = Role.objects.create(code=f'rol-{username}', name=f'Rol {username}')
        rol.permissions.add(*permisos)
        persona.roles.add(rol)
    else:
        persona.extra_permissions.add(*permisos)
    return persona


def _cliente(persona: User) -> APIClient:
    cliente = APIClient()
    cliente.force_authenticate(user=persona)
    return cliente


@pytest.mark.parametrize('por_rol', [False, True])
def test_con_cualquier_permiso_de_administracion_le_aparece_la_app(por_rol):
    assert _con_permisos('admin:areas:view', por_rol=por_rol).has_app_access('admin') is True


def test_con_ver_usuarios_consulta_las_personas_pero_no_cambia_nada():
    persona = _con_permisos('admin:users:view')
    otra = User.objects.create(username='otra', first_name='Otra')
    cliente = _cliente(persona)

    for ruta in (
        RUTA,
        f'{RUTA}/{otra.id}',
        '/api/admin/areas',
        '/api/admin/applications',
        '/api/admin/roles',
        '/api/admin/permissions',
    ):
        assert cliente.get(ruta).status_code == 200, ruta

    assert cliente.patch(f'{RUTA}/{otra.id}', {'phone': '1'}, format='json').status_code == 403
    assert cliente.post(f'{RUTA}/{otra.id}/toggle-active').status_code == 403
    assert cliente.post('/api/admin/roles', {'code': 'x', 'name': 'X'}).status_code == 403
    assert cliente.get('/api/admin/odoo/sincronizaciones').status_code == 403


def test_sin_ver_usuarios_no_ve_la_lista_de_personas():
    cliente = _cliente(_con_permisos('admin:areas:view'))
    assert cliente.get('/api/admin/areas').status_code == 200
    assert cliente.get(RUTA).status_code == 403


def test_sin_permisos_de_administracion_no_entra():
    colaborador = User.objects.create_user(
        email='colab@supli.tech', username='colab', first_name='Colab', password='clave-123456'
    )
    cliente = _cliente(colaborador)
    assert cliente.get(RUTA).status_code == 403
    assert cliente.get('/api/admin/applications').status_code == 403
    assert colaborador.has_app_access('admin') is False


def test_editar_usuarios_cambia_la_cuenta_pero_no_los_accesos():
    from apps.accounts.models import Role

    editor = _con_permisos('admin:users:view', 'admin:users:manage', username='editor')
    otra = User.objects.create(username='otra', first_name='Otra')
    rol = Role.objects.create(code='otro', name='Otro')
    cliente = _cliente(editor)
    ruta = f'{RUTA}/{otra.id}'

    assert cliente.patch(ruta, {'phone': '300'}, format='json').status_code == 200
    # El formulario manda los accesos sin cambios: eso pasa.
    assert cliente.patch(ruta, {'roles': [], 'phone': '301'}, format='json').status_code == 200
    assert cliente.post(f'{ruta}/toggle-active').status_code == 200

    assert cliente.patch(ruta, {'kind': 'admin'}, format='json').status_code == 403
    assert cliente.patch(ruta, {'roles': [rol.id]}, format='json').status_code == 403
    clave = cliente.patch(ruta, {'password': 'otra-clave-segura-99'}, format='json')
    assert clave.status_code == 403
    # Vacía es «no cambiarla»: pasa.
    assert cliente.patch(ruta, {'password': ''}, format='json').status_code == 200
    mios = cliente.patch(f'{RUTA}/{editor.id}', {'roles': [rol.id]}, format='json')
    assert mios.status_code == 403

    otra.refresh_from_db()
    editor.refresh_from_db()
    assert not otra.check_password('otra-clave-segura-99')
    assert otra.phone == '301'
    assert otra.kind != User.Kind.ADMIN
    assert not otra.roles.exists()
    assert not editor.roles.exists()


def test_la_cuenta_de_un_administrador_solo_la_toca_otro_administrador():
    editor = _con_permisos('admin:users:view', 'admin:users:manage')
    jefa = User.objects.create(username='jefa', first_name='Jefa', kind=User.Kind.ADMIN)
    cliente = _cliente(editor)
    ruta = f'{RUTA}/{jefa.id}'
    assert cliente.patch(ruta, {'phone': '1'}, format='json').status_code == 403
    clave = cliente.patch(ruta, {'password': 'otra-clave-segura-99'}, format='json')
    assert clave.status_code == 403
    assert cliente.post(f'{ruta}/toggle-active').status_code == 403
    jefa.refresh_from_db()
    assert jefa.is_active


def test_crear_o_editar_roles_menos_los_propios_y_sin_eliminar():
    from apps.accounts.models import Permission, Role

    editor = _con_permisos('admin:roles:view', 'admin:roles:manage', por_rol=True)
    propio = editor.roles.get()
    ajeno = Role.objects.create(code='ajeno', name='Ajeno')
    permiso = Permission.objects.get(code='admin:odoo:manage')
    cliente = _cliente(editor)

    assert cliente.post('/api/admin/roles', {'code': 'nuevo', 'name': 'Nuevo'}).status_code == 201
    editado = cliente.patch(
        f'/api/admin/roles/{ajeno.id}', {'permissions': [permiso.id]}, format='json'
    )
    assert editado.status_code == 200
    darse = cliente.patch(
        f'/api/admin/roles/{propio.id}', {'permissions': [permiso.id]}, format='json'
    )
    assert darse.status_code == 403
    assert cliente.delete(f'/api/admin/roles/{ajeno.id}').status_code == 403
    assert not propio.permissions.filter(code='admin:odoo:manage').exists()


def test_crear_o_editar_aplicaciones_sin_eliminarlas():
    editor = _con_permisos('admin:applications:view', 'admin:applications:manage')
    cliente = _cliente(editor)
    nueva = cliente.post(
        '/api/admin/applications',
        {'code': 'nueva', 'name': 'Nueva', 'basePath': '/inicio/nueva'},
        format='json',
    )
    assert nueva.status_code == 201
    app_id = nueva.json()['id']
    assert cliente.patch(f'/api/admin/applications/{app_id}', {'order': 5}).status_code == 200
    assert cliente.delete(f'/api/admin/applications/{app_id}').status_code == 403


def test_odoo_completo_abre_la_bitacora_sin_ver_usuarios():
    cliente = _cliente(_con_permisos('admin:odoo:manage'))
    assert cliente.get('/api/admin/odoo/sincronizaciones').status_code == 200
    assert cliente.get('/api/admin/odoo/accesos').status_code == 200
    assert cliente.get(RUTA).status_code == 403


def test_mi_equipo_trae_solo_a_mis_directos_activos():
    jefa = User.objects.create_user(
        email='jefa@supli.tech', username='jefa', first_name='Jefa', password='clave-123456'
    )
    User.objects.create(username='uno', first_name='Uno', manager=jefa, position='Analista')
    User.objects.create(username='dos', first_name='Dos', manager=jefa, is_active=False)
    User.objects.create(username='tres', first_name='Tres')
    equipo = _cliente(jefa).get('/api/auth/me/equipo').json()
    assert [p['firstName'] for p in equipo] == ['Uno']
    assert equipo[0]['position'] == 'Analista'


# ── Accesos vistos desde la app ────────────────────────────────────────────


def _app_con_permisos():
    from apps.accounts.models import Permission, Role

    app = Application.objects.create(code='bi', name='BI', base_path='/inicio/bi')
    informe = Permission.objects.create(code='bi:informe:hc', name='HC', application=app)
    cargar = Permission.objects.create(
        code='bi:hc:ventas', name='Cargar ventas', application=app, parent=informe
    )
    rol = Role.objects.create(code='rol-bi', name='Rol BI')
    rol.permissions.add(informe)
    return app, informe, cargar, rol


def test_los_accesos_de_una_app_dicen_quien_entra_y_con_que():
    app, informe, cargar, rol = _app_con_permisos()
    asignada = User.objects.create(username='a', first_name='A')
    asignada.applications.add(app)
    por_rol = User.objects.create(username='b', first_name='B')
    por_rol.roles.add(rol)
    suelto = User.objects.create(username='c', first_name='C')
    suelto.extra_permissions.add(informe, cargar)
    User.objects.create(username='d', first_name='D')  # sin nada
    inactiva = User.objects.create(username='e', first_name='E', is_active=False)
    inactiva.applications.add(app)

    filas = cliente_admin().get(f'/api/admin/applications/{app.id}/accesos').json()
    por_nombre = {f['firstName']: f for f in filas}
    assert set(por_nombre) == {'A', 'B', 'C'}
    assert por_nombre['A']['asignada'] is True
    assert por_nombre['B']['roles'] == [rol.id]
    assert sorted(por_nombre['C']['permisos']) == sorted([informe.id, cargar.id])


def test_los_accesos_de_una_app_no_hacen_una_consulta_por_persona():
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    app, informe, _, rol = _app_con_permisos()
    cliente = cliente_admin()
    ruta = f'/api/admin/applications/{app.id}/accesos'

    def consultas():
        with CaptureQueriesContext(connection) as capturadas:
            cliente.get(ruta)
        return len(capturadas)

    User.objects.create(username='p0', first_name='P0').roles.add(rol)
    pocas = consultas()
    for i in range(1, 15):
        persona = User.objects.create(username=f'p{i}', first_name=f'P{i}')
        persona.roles.add(rol)
        persona.extra_permissions.add(informe)
        persona.applications.add(app)
    assert consultas() == pocas


def test_dar_un_permiso_de_adentro_trae_el_de_afuera_y_la_app():
    app, informe, cargar, _ = _app_con_permisos()
    persona = User.objects.create(username='p', first_name='P')
    respuesta = cliente_admin().post(
        f'/api/admin/applications/{app.id}/accesos',
        {'usuario': persona.id, 'tipo': 'permiso', 'id': cargar.id},
        format='json',
    )
    assert respuesta.status_code == 200
    assert set(persona.extra_permissions.all()) == {informe, cargar}
    assert persona.applications.filter(pk=app.pk).exists()


def test_quitar_la_app_le_quita_todo_lo_de_la_app():
    from apps.accounts.models import Permission, Role

    app, informe, cargar, rol = _app_con_permisos()
    otra = Application.objects.create(code='otra', name='Otra', base_path='/inicio/otra')
    ajeno = Permission.objects.create(code='otra:ver', name='Ver', application=otra)
    rol_ajeno = Role.objects.create(code='rol-otra', name='Rol otra')
    rol_ajeno.permissions.add(ajeno)
    persona = User.objects.create(username='p', first_name='P')
    persona.applications.add(app, otra)
    persona.roles.add(rol, rol_ajeno)
    persona.extra_permissions.add(informe, cargar, ajeno)

    respuesta = cliente_admin().post(
        f'/api/admin/applications/{app.id}/quitar-acceso',
        {'usuario': persona.id, 'tipo': 'app'},
        format='json',
    )
    assert respuesta.status_code == 200
    assert respuesta.json() == []
    assert list(persona.applications.all()) == [otra]
    assert list(persona.roles.all()) == [rol_ajeno]
    assert list(persona.extra_permissions.all()) == [ajeno]


def test_quitar_un_permiso_se_lleva_los_de_adentro():
    app, informe, cargar, _ = _app_con_permisos()
    persona = User.objects.create(username='p', first_name='P')
    persona.extra_permissions.add(informe, cargar)
    cliente_admin().post(
        f'/api/admin/applications/{app.id}/quitar-acceso',
        {'usuario': persona.id, 'tipo': 'permiso', 'id': informe.id},
        format='json',
    )
    assert not persona.extra_permissions.exists()


def test_no_se_da_un_rol_o_permiso_de_otra_app():
    from apps.accounts.models import Permission

    app, *_ = _app_con_permisos()
    otra = Application.objects.create(code='otra', name='Otra', base_path='/inicio/otra')
    ajeno = Permission.objects.create(code='otra:ver', name='Ver', application=otra)
    persona = User.objects.create(username='p', first_name='P')
    respuesta = cliente_admin().post(
        f'/api/admin/applications/{app.id}/accesos',
        {'usuario': persona.id, 'tipo': 'permiso', 'id': ajeno.id},
        format='json',
    )
    assert respuesta.status_code == 400
    assert not persona.extra_permissions.exists()


def test_solo_el_administrador_da_accesos_desde_la_app():
    app, informe, *_ = _app_con_permisos()
    editor = _con_permisos('admin:applications:view', 'admin:applications:manage')
    cliente = _cliente(editor)
    assert cliente.get(f'/api/admin/applications/{app.id}/accesos').status_code == 200
    for ruta in ('accesos', 'quitar-acceso'):
        respuesta = cliente.post(
            f'/api/admin/applications/{app.id}/{ruta}',
            {'usuario': editor.id, 'tipo': 'permiso', 'id': informe.id},
            format='json',
        )
        assert respuesta.status_code == 403
    assert not editor.extra_permissions.filter(pk=informe.pk).exists()


def test_agregar_a_todos_asigna_solo_la_app_a_quien_puede_entrar():
    from apps.accounts.models import Area

    app, *_ = _app_con_permisos()
    area = Area.objects.create(name='Ventas')
    una = User.objects.create(username='una', first_name='Una', email='una@supli.tech', area=area)
    ya = User.objects.create(username='ya', first_name='Ya', email='ya@supli.tech')
    ya.applications.add(app)
    sin_correo = User.objects.create(username='sin', first_name='Sin')
    inactiva = User.objects.create(
        username='ina', first_name='Ina', email='ina@supli.tech', is_active=False
    )
    jefa = User.objects.create(
        username='jefa', first_name='Jefa', email='jefa@supli.tech', kind=User.Kind.ADMIN
    )

    respuesta = cliente_admin().post(
        f'/api/admin/applications/{app.id}/asignar-a', {'todos': True}, format='json'
    )
    assert respuesta.status_code == 200
    assert respuesta.json() == {'agregadas': 1}
    assert set(app.users.all()) == {una, ya}
    assert not una.roles.exists() and not una.extra_permissions.exists()
    for nadie in (sin_correo, inactiva, jefa):
        assert not nadie.applications.exists()


def test_agregar_por_area_asigna_solo_a_los_de_esa_area():
    from apps.accounts.models import Area

    app, *_ = _app_con_permisos()
    ventas = Area.objects.create(name='Ventas')
    otra = Area.objects.create(name='Otra')
    de_ventas = User.objects.create(
        username='v', first_name='V', email='v@supli.tech', area=ventas
    )
    User.objects.create(username='o', first_name='O', email='o@supli.tech', area=otra)

    respuesta = cliente_admin().post(
        f'/api/admin/applications/{app.id}/asignar-a', {'area': ventas.id}, format='json'
    )
    assert respuesta.json() == {'agregadas': 1}
    assert list(app.users.all()) == [de_ventas]


def test_agregar_a_muchos_pide_todos_o_un_area_y_es_del_administrador():
    app, *_ = _app_con_permisos()
    ruta = f'/api/admin/applications/{app.id}/asignar-a'
    assert cliente_admin().post(ruta, {}, format='json').status_code == 400
    editor = _con_permisos('admin:applications:view', 'admin:applications:manage')
    assert _cliente(editor).post(ruta, {'todos': True}, format='json').status_code == 403
    assert not app.users.exists()
