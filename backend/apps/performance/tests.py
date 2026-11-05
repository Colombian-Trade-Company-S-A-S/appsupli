"""
Pruebas de Objetivos y KPIs: permisos, reglas de negocio y medición en %.

Las reglas que se prueban acá son las del §6 de la especificación técnica; el
número de cada una va en el nombre de la prueba cuando aplica.
"""
from datetime import date, timedelta
from decimal import Decimal
from io import BytesIO

import openpyxl
import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from apps.accounts.models import Application, Permission, Role, User
from apps.performance.cumplimiento import cumplimiento_total, semaforo
from apps.performance.models import (
    EstadoObjetivo,
    EstadoPeriodo,
    EstadoValidacion,
    Objetivo,
    Periodo,
    Resultado,
    Semaforo,
    TipoMedicion,
    Unidad,
)
from apps.performance.periodos import etiqueta_corte, mes_siguiente, primer_dia, rango

pytestmark = pytest.mark.django_db

# El mes de las pruebas es siempre el entrante: los objetivos se editan hasta
# el último día del mes anterior (A9), así que fijar un mes del calendario
# haría fallar la suite sola al llegar esa fecha.
OCTUBRE = mes_siguiente(primer_dia(date.today()))
MES = OCTUBRE.strftime('%Y-%m')
RUTA = '/api/performance'


@pytest.fixture
def app_performance():
    contenedor = Application.objects.create(
        code='supli-performance',
        name='Supli Performance',
        base_path='/inicio/performance',
        order=300,
    )
    app = Application.objects.create(
        code='objetivos-kpis',
        name='Objetivos y KPIs',
        base_path='/inicio/performance/objetivos',
        order=10,
        parent=contenedor,
    )
    for code, name in (
        ('performance:objetivos:manage_all', 'Definir objetivos de cualquiera'),
        ('performance:objetivos:view_all', 'Ver toda la organización'),
        ('performance:periodos:manage', 'Gestionar el periodo'),
    ):
        Permission.objects.create(code=code, name=name, application=app)
    return app


def crear_usuario(email, app=None, permisos=(), jefe=None, cargo=''):
    usuario = User.objects.create_user(
        email=email,
        username=email.split('@')[0],
        first_name=email.split('@')[0].title(),
        password='clave-de-prueba-123',
        position=cargo,
    )
    if jefe:
        usuario.manager = jefe
        usuario.save(update_fields=['manager'])
    if app:
        usuario.applications.add(app)
    if permisos:
        rol = Role.objects.create(code=f'rol-{usuario.pk}', name='rol')
        rol.permissions.set(Permission.objects.filter(code__in=permisos))
        usuario.roles.add(rol)
    return usuario


def cliente_de(usuario) -> APIClient:
    cliente = APIClient()
    cliente.force_authenticate(user=usuario)
    return cliente


def objetivo_de(colaborador, jefe, peso, **extra) -> Objetivo:
    datos = {
        'objetivo': 'Entregar el portal de autogestión',
        'kpi': 'Portal en producción',
        'peso': Decimal(peso),
        'tipo_medicion': TipoMedicion.PORCENTAJE,
        'unidad': Unidad.PORCENTAJE,
        'periodo': OCTUBRE,
    }
    datos.update(extra)
    return Objetivo.objects.create(colaborador=colaborador, registrado_por=jefe, **datos)


@pytest.fixture
def equipo(app_performance):
    """Un jefe con dos personas a cargo, que es la jerarquía que usa el módulo."""
    jefe = crear_usuario('jefe@supli.tech', app_performance, cargo='Tech Manager')
    julian = crear_usuario('julian@supli.tech', app_performance, jefe=jefe, cargo='BI Analyst')
    daniel = crear_usuario('daniel@supli.tech', app_performance, jefe=jefe, cargo='BI Manager')
    return jefe, julian, daniel


@pytest.fixture
def punto_de_venta(app_performance):
    """
    La jerarquía de punto de venta: Trade Marketing Manager → Trade Leader →
    asesores y promotores. Con ellos el % lo registra el Trade Leader y lo
    aprueba el Trade Marketing Manager.
    """
    tmm = crear_usuario('tmm@supli.tech', app_performance, cargo='Trade Marketing Manager')
    lider = crear_usuario(
        'lider@supli.tech', app_performance, jefe=tmm, cargo='Trade Marketing Leader - Telcom'
    )
    asesor = crear_usuario(
        'asesor@supli.tech',
        app_performance,
        jefe=lider,
        cargo='Asesor Comercial - CAV Bogota Venecia, C105',
    )
    promotora = crear_usuario(
        'promotora@supli.tech', app_performance, jefe=lider, cargo='Promotora Calle 80'
    )
    return tmm, lider, asesor, promotora


# ── Cumplimiento ponderado ─────────────────────────────────────────────────


def test_el_cumplimiento_de_la_persona_pondera_sus_objetivos():
    """Σ (peso/100 × %): es lo que después ordena el Top Performance."""
    assert cumplimiento_total([(30, 100), (25, 50), (45, 0)]) == Decimal('42.50')


# ── Definición de objetivos (§6, reglas 1 a 5) ─────────────────────────────


def test_el_jefe_define_los_objetivos_de_su_equipo(equipo):
    jefe, julian, _ = equipo

    respuesta = cliente_de(jefe).post(
        f'{RUTA}/objetivos',
        {
            'colaborador': julian.pk,
            'periodo': OCTUBRE.isoformat(),
            'objetivo': 'Entregar el portal de autogestión BI',
            'kpi': 'Portal en producción',
            'peso': '30',
        },
        format='json',
    )

    assert respuesta.status_code == 201, respuesta.data
    creado = Objetivo.objects.get()
    assert creado.registrado_por == jefe
    assert creado.estado == EstadoObjetivo.BORRADOR
    assert creado.tipo_medicion == TipoMedicion.PORCENTAJE
    # El responsable del resultado es siempre el jefe directo del colaborador.
    assert creado.responsable_resultado == jefe
    # El mes se abre solo con el primer objetivo.
    assert Periodo.objects.get(periodo=OCTUBRE).estado == EstadoPeriodo.DEFINICION


def test_nadie_define_sus_propios_objetivos(equipo):
    """Regla 3: el objetivo lo crea el jefe o People, nunca el colaborador."""
    _, julian, _ = equipo

    respuesta = cliente_de(julian).post(
        f'{RUTA}/objetivos',
        {
            'colaborador': julian.pk,
            'periodo': OCTUBRE.isoformat(),
            'objetivo': 'Auto-asignarme algo fácil',
            'kpi': 'Lo que yo diga',
            'peso': '100',
        },
        format='json',
    )

    assert respuesta.status_code == 403
    assert Objetivo.objects.count() == 0


def test_un_jefe_no_toca_el_equipo_de_otro(app_performance, equipo):
    jefe, julian, _ = equipo
    otro_jefe = crear_usuario('otro@supli.tech', app_performance)

    respuesta = cliente_de(otro_jefe).post(
        f'{RUTA}/objetivos',
        {
            'colaborador': julian.pk,
            'periodo': OCTUBRE.isoformat(),
            'objetivo': 'Objetivo de otro equipo',
            'kpi': 'KPI',
            'peso': '10',
        },
        format='json',
    )

    assert respuesta.status_code == 403


def test_people_define_objetivos_de_cualquiera(app_performance, equipo):
    _, julian, _ = equipo
    people = crear_usuario(
        'people@supli.tech', app_performance, ['performance:objetivos:manage_all']
    )

    respuesta = cliente_de(people).post(
        f'{RUTA}/objetivos',
        {
            'colaborador': julian.pk,
            'periodo': OCTUBRE.isoformat(),
            'objetivo': 'Objetivo transversal de People',
            'kpi': 'KPI',
            'peso': '20',
        },
        format='json',
    )

    assert respuesta.status_code == 201, respuesta.data


def test_no_se_pueden_pasar_de_seis_objetivos(equipo):
    """Regla 2: máximo seis objetivos por persona y mes."""
    jefe, julian, _ = equipo
    for _ in range(6):
        objetivo_de(julian, jefe, '10')

    respuesta = cliente_de(jefe).post(
        f'{RUTA}/objetivos',
        {
            'colaborador': julian.pk,
            'periodo': OCTUBRE.isoformat(),
            'objetivo': 'El séptimo',
            'kpi': 'KPI',
            'peso': '10',
        },
        format='json',
    )

    assert respuesta.status_code == 400
    assert 'máximo' in str(respuesta.data)
    assert Objetivo.objects.filter(colaborador=julian).count() == 6


def test_la_ponderacion_no_se_pasa_de_cien(equipo):
    jefe, julian, _ = equipo
    objetivo_de(julian, jefe, '80')

    respuesta = cliente_de(jefe).post(
        f'{RUTA}/objetivos',
        {
            'colaborador': julian.pk,
            'periodo': OCTUBRE.isoformat(),
            'objetivo': 'Uno que se pasa',
            'kpi': 'KPI',
            'peso': '30',
        },
        format='json',
    )

    assert respuesta.status_code == 400
    assert 'Solo queda 20%' in str(respuesta.data)


def test_todo_objetivo_se_mide_en_porcentaje(equipo):
    """Un único criterio: aunque llegue un tipo, una meta o una fórmula, no se guardan."""
    jefe, julian, _ = equipo

    respuesta = cliente_de(jefe).post(
        f'{RUTA}/objetivos',
        {
            'colaborador': julian.pk,
            'periodo': OCTUBRE.isoformat(),
            'objetivo': 'Índice compuesto',
            'kpi': 'Índice',
            'peso': '25',
            'tipoMedicion': 'formula',
            'metaValor': '10',
            'formula': '__import__("os")',
            'permiteSobrecumplimiento': True,
        },
        format='json',
    )

    assert respuesta.status_code == 201, respuesta.data
    creado = Objetivo.objects.get()
    assert creado.tipo_medicion == TipoMedicion.PORCENTAJE
    assert (creado.meta_valor, creado.formula, creado.permite_sobrecumplimiento) == (
        None,
        '',
        False,
    )


def test_un_objetivo_viejo_que_se_edita_queda_en_porcentaje(equipo):
    jefe, julian, _ = equipo
    viejo = objetivo_de(
        julian,
        jefe,
        '40',
        tipo_medicion=TipoMedicion.PROPORCIONAL,
        unidad=Unidad.UNIDADES,
        meta_valor=Decimal('8'),
    )

    respuesta = cliente_de(jefe).patch(
        f'{RUTA}/objetivos/{viejo.pk}', {'peso': '50'}, format='json'
    )

    assert respuesta.status_code == 200, respuesta.data
    viejo.refresh_from_db()
    assert viejo.tipo_medicion == TipoMedicion.PORCENTAJE
    assert viejo.meta_valor is None
    assert viejo.peso == Decimal('50')


# ── Periodo (§6, reglas 1 y 5) ─────────────────────────────────────────────


def test_activar_el_mes_exige_que_todos_sumen_cien(app_performance, equipo):
    jefe, julian, daniel = equipo
    people = crear_usuario('people@supli.tech', app_performance, ['performance:periodos:manage'])
    objetivo_de(julian, jefe, '100')
    objetivo_de(daniel, jefe, '60')

    respuesta = cliente_de(people).post(f'{RUTA}/periodos/{MES}/activar')

    assert respuesta.status_code == 422
    datos = respuesta.json()
    assert datos['error'] == 'PESO_INCOMPLETO'
    assert [fila['colaboradorNombre'] for fila in datos['pendientes']] == ['Daniel']
    assert 'suman 60%' in datos['pendientes'][0]['mensaje']
    # No se activa a medias: nada quedó congelado.
    assert Objetivo.objects.filter(estado=EstadoObjetivo.CONGELADO).count() == 0


def test_al_activar_el_mes_los_objetivos_se_congelan(app_performance, equipo):
    jefe, julian, daniel = equipo
    people = crear_usuario('people@supli.tech', app_performance, ['performance:periodos:manage'])
    objetivo_de(julian, jefe, '100')
    objetivo_de(daniel, jefe, '40')
    objetivo_de(daniel, jefe, '60', objetivo='Otro objetivo')

    respuesta = cliente_de(people).post(f'{RUTA}/periodos/{MES}/activar')

    assert respuesta.status_code == 200, respuesta.data
    assert respuesta.json()['congelados'] == 3
    assert Periodo.objects.get(periodo=OCTUBRE).estado == EstadoPeriodo.EN_MEDICION
    assert Objetivo.objects.exclude(estado=EstadoObjetivo.CONGELADO).count() == 0

    # Regla 5: con el mes en medición ya no se edita ni se borra.
    objetivo = Objetivo.objects.filter(colaborador=julian).first()
    edicion = cliente_de(jefe).patch(
        f'{RUTA}/objetivos/{objetivo.pk}', {'peso': '50'}, format='json'
    )
    assert edicion.status_code == 400
    borrado = cliente_de(jefe).delete(f'{RUTA}/objetivos/{objetivo.pk}')
    assert borrado.status_code == 400
    assert Objetivo.objects.filter(pk=objetivo.pk).exists()


def test_activar_el_mes_es_de_people_no_de_cada_lider(equipo):
    jefe, julian, _ = equipo
    objetivo_de(julian, jefe, '100')

    respuesta = cliente_de(jefe).post(f'{RUTA}/periodos/{MES}/activar')

    assert respuesta.status_code == 403
    assert Objetivo.objects.filter(estado=EstadoObjetivo.CONGELADO).count() == 0


# ── Consulta (§6, regla 6 y §7) ────────────────────────────────────────────


def test_el_colaborador_consulta_los_suyos_en_solo_lectura(equipo):
    jefe, julian, daniel = equipo
    objetivo_de(julian, jefe, '100')
    objetivo_de(daniel, jefe, '100')

    respuesta = cliente_de(julian).get(f'{RUTA}/mis-objetivos?periodo={MES}')

    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert len(datos) == 1
    assert datos[0]['colaborador'] == julian.pk
    # Y no ve los de su compañero por el listado general.
    del_equipo = cliente_de(julian).get(f'{RUTA}/objetivos?colaborador={daniel.pk}').json()
    assert del_equipo == []


def test_el_jefe_ve_el_equipo_y_la_direccion_ve_todo(app_performance, equipo):
    jefe, julian, daniel = equipo
    ajeno = crear_usuario('ajeno@supli.tech', app_performance)
    objetivo_de(julian, jefe, '100')
    objetivo_de(ajeno, jefe, '100')
    ceo = crear_usuario('ceo@supli.tech', app_performance, ['performance:objetivos:view_all'])

    del_jefe = cliente_de(jefe).get(f'{RUTA}/objetivos?periodo={MES}').json()
    assert {fila['colaborador'] for fila in del_jefe} == {julian.pk}

    del_ceo = cliente_de(ceo).get(f'{RUTA}/objetivos?periodo={MES}').json()
    assert {fila['colaborador'] for fila in del_ceo} == {julian.pk, ajeno.pk}


def test_el_historico_no_se_pisa_al_cambiar_de_mes(equipo):
    """Regla 6: cada (persona, mes) es un registro aparte."""
    jefe, julian, _ = equipo
    objetivo_de(julian, jefe, '100')
    objetivo_de(julian, jefe, '100', periodo=mes_siguiente(OCTUBRE))

    octubre = cliente_de(jefe).get(f'{RUTA}/objetivos?colaborador={julian.pk}&periodo={MES}')
    mes_dos = f'{mes_siguiente(OCTUBRE):%Y-%m}'
    noviembre = cliente_de(jefe).get(
        f'{RUTA}/objetivos?colaborador={julian.pk}&periodo={mes_dos}'
    )

    assert len(octubre.json()) == 1
    assert len(noviembre.json()) == 1
    assert Objetivo.objects.filter(colaborador=julian).count() == 2


def test_el_resumen_dice_cuanto_falta_para_el_cien(equipo):
    jefe, julian, _ = equipo
    objetivo_de(julian, jefe, '30')
    objetivo_de(julian, jefe, '25', objetivo='Otro')

    datos = cliente_de(jefe).get(f'{RUTA}/periodos/{MES}/resumen?colaborador={julian.pk}').json()

    fila = datos['colaboradores'][0]
    assert (fila['pesoAsignado'], fila['pesoDisponible'], fila['completo']) == (55.0, 45.0, False)
    assert datos['estado'] == EstadoPeriodo.DEFINICION


def test_sin_el_submodulo_no_se_entra(app_performance):
    fuera = crear_usuario('fuera@supli.tech')

    for ruta in ('opciones', 'resumen', 'mis-objetivos', 'objetivos'):
        assert cliente_de(fuera).get(f'{RUTA}/{ruta}').status_code == 403


def test_las_opciones_traen_el_equipo_y_los_catalogos(equipo):
    jefe, julian, daniel = equipo

    datos = cliente_de(jefe).get(f'{RUTA}/opciones').json()

    assert {persona['id'] for persona in datos['equipo']} == {julian.pk, daniel.pk}
    assert datos['maximoObjetivos'] == 6
    # Ya no hay tipos de medición que escoger: todo se mide en % de 0 a 100.
    assert 'tiposMedicion' not in datos
    assert datos['cumplimientoMaximo'] == 100
    assert datos['capacidades']['esLider'] is True
    # Un líder común no recibe a la compañía, ni aprueba a nadie fuera de su equipo.
    assert datos['compania'] == []
    assert datos['apruebaResultados'] == []
    assert {p['aprobador'] for p in datos['equipo']} == {jefe.full_name}


def test_people_ve_solo_sus_directos_y_aparte_la_compania(equipo, app_performance):
    """People define a cualquiera, pero el desplegable arranca con sus directos."""
    jefe, julian, daniel = equipo
    people = crear_usuario(
        'people@supli.tech', app_performance, permisos=['performance:objetivos:manage_all']
    )
    # El jefe ahora responde a People: así «julian» y «daniel» no son sus directos.
    jefe.manager = people
    jefe.save(update_fields=['manager'])

    datos = cliente_de(people).get(f'{RUTA}/opciones').json()

    assert {p['id'] for p in datos['equipo']} == {jefe.pk}
    assert {p['id'] for p in datos['compania']} >= {jefe.pk, julian.pk, daniel.pk}


# ── Estructura del menú (§3) ───────────────────────────────────────────────


def test_el_seed_deja_valoracion_dentro_del_contenedor():
    Application.objects.create(
        code='valoracion', name='Supli performance', base_path='/inicio/valoracion', order=300
    )

    call_command('seed_performance_app', verbosity=0)

    contenedor = Application.objects.get(code='supli-performance')
    objetivos = Application.objects.get(code='objetivos-kpis')
    valoracion = Application.objects.get(code='valoracion')
    assert objetivos.parent == contenedor
    assert valoracion.parent == contenedor
    # La valoración conserva su ruta: quien ya tenía acceso sigue entrando igual.
    assert valoracion.base_path == '/inicio/valoracion'
    assert valoracion.name == 'Valoración'


def test_el_submodulo_arrastra_al_contenedor_en_el_menu(app_performance):
    persona = crear_usuario('menu@supli.tech', app_performance)

    apps = persona.get_accessible_applications()

    codigos = set(apps.values_list('code', flat=True))
    assert codigos == {'objetivos-kpis', 'supli-performance'}


# ── Decisiones cerradas por People (documento de definiciones) ─────────────


def test_el_semaforo_usa_los_cortes_de_people():
    """A2: verde ≥ 100, naranja 85–99.9, rojo < 85."""
    assert semaforo(120) == Semaforo.VERDE
    assert semaforo(100) == Semaforo.VERDE
    assert semaforo(99.9) == Semaforo.NARANJA
    assert semaforo(85) == Semaforo.NARANJA
    assert semaforo(84.99) == Semaforo.ROJO
    assert semaforo(0) == Semaforo.ROJO
    # Sin resultado cargado no hay color: no está en rojo, está sin medir.
    assert semaforo(None) is None


def test_el_porcentaje_va_de_cero_a_cien_y_es_obligatorio(equipo):
    """Sin sobrecumplimiento: el % que se registra no pasa de 100 ni baja de 0."""
    jefe, julian, _daniel = equipo
    objetivo = objetivo_de(julian, jefe, '100')
    _empezar_el_mes(objetivo.periodo)
    ruta = f'{RUTA}/objetivos/{objetivo.pk}/resultado'
    cliente = cliente_de(julian)

    for fuera_de_rango in ('101', '-1'):
        respuesta = cliente.put(ruta, {'porcentajeCumplimiento': fuera_de_rango}, format='json')
        assert respuesta.status_code == 400
        assert 'de 0 a 100' in str(respuesta.data)

    sin_porcentaje = cliente.put(ruta, {'observacion': 'Ya está'}, format='json')
    assert sin_porcentaje.status_code == 400
    assert not Resultado.objects.exists()

    assert cliente.put(ruta, {'porcentajeCumplimiento': '100'}, format='json').status_code == 200
    assert cliente.put(ruta, {'porcentajeCumplimiento': '0'}, format='json').status_code == 200


# ── Congelamiento por calendario (A9) ──────────────────────────────────────


def _empezar_el_mes(periodo):
    """Corre el reloj: deja el mes del objetivo en el pasado para las pruebas."""
    Objetivo.objects.filter(periodo=periodo).update(periodo=primer_dia(date.today()))
    Periodo.objects.filter(periodo=periodo).update(periodo=primer_dia(date.today()))
    return primer_dia(date.today())


def test_los_objetivos_del_mes_en_curso_estan_congelados(equipo):
    """A9: se editan hasta el último día del mes anterior; después, no."""
    jefe, julian, _daniel = equipo
    objetivo = objetivo_de(julian, jefe, '100')
    mes_en_curso = _empezar_el_mes(objetivo.periodo)
    objetivo.refresh_from_db()

    respuesta = cliente_de(jefe).patch(
        f'{RUTA}/objetivos/{objetivo.pk}', {'peso': '50'}, format='json'
    )

    assert respuesta.status_code == 400
    assert 'congelados' in str(respuesta.data)
    assert objetivo.periodo == mes_en_curso
    # Y tampoco se puede borrar.
    assert cliente_de(jefe).delete(f'{RUTA}/objetivos/{objetivo.pk}').status_code == 400


def test_el_mes_entrante_si_se_edita(equipo):
    jefe, julian, _daniel = equipo
    objetivo = objetivo_de(julian, jefe, '100')

    respuesta = cliente_de(jefe).patch(
        f'{RUTA}/objetivos/{objetivo.pk}', {'peso': '60'}, format='json'
    )

    assert respuesta.status_code == 200, respuesta.data
    assert respuesta.json()['editable'] is True


def test_people_habilita_la_edicion_de_un_mes_congelado(app_performance, equipo):
    """A9: solo People la habilita, sin pedir al CEO, y siempre hasta una fecha."""
    jefe, julian, _daniel = equipo
    people = crear_usuario(
        'people@supli.tech', app_performance, ['performance:periodos:manage']
    )
    objetivo = objetivo_de(julian, jefe, '100')
    mes = _empezar_el_mes(objetivo.periodo)
    ruta = f'{RUTA}/periodos/{mes:%Y-%m}/edicion'
    hasta = date.today() + timedelta(days=2)

    sin_permiso = cliente_de(jefe).post(ruta, {'hasta': hasta.isoformat()}, format='json')
    assert sin_permiso.status_code == 403

    sin_fecha = cliente_de(people).post(ruta, {'motivo': 'Falta tiempo'}, format='json')
    assert sin_fecha.status_code == 400
    ayer = (date.today() - timedelta(days=1)).isoformat()
    assert cliente_de(people).post(ruta, {'hasta': ayer}, format='json').status_code == 400

    # El motivo es opcional: no hay que decir quién lo autorizó.
    abierto = cliente_de(people).post(ruta, {'hasta': hasta.isoformat()}, format='json')
    assert abierto.status_code == 200, abierto.data
    assert 'hasta el' in abierto.json()['mensaje']

    registro = Periodo.objects.get(periodo=mes)
    assert registro.edicion_habilitada is True
    assert registro.edicion_hasta == hasta
    assert registro.habilitada_por == people
    assert registro.fecha_habilitacion is not None

    # Con la excepción abierta, el jefe vuelve a editar.
    editado = cliente_de(jefe).patch(
        f'{RUTA}/objetivos/{objetivo.pk}', {'peso': '80'}, format='json'
    )
    assert editado.status_code == 200, editado.data

    # Y People la vuelve a cerrar.
    cerrado = cliente_de(people).post(
        f'{RUTA}/periodos/{mes:%Y-%m}/edicion', {'habilitada': False}, format='json'
    )
    assert cerrado.status_code == 200
    assert Periodo.objects.get(periodo=mes).edicion_habilitada is False


def test_la_edicion_habilitada_se_cierra_sola_al_pasar_la_fecha(equipo):
    jefe, julian, _daniel = equipo
    objetivo = objetivo_de(julian, jefe, '100')
    mes = _empezar_el_mes(objetivo.periodo)
    registro = Periodo.objects.create(
        periodo=mes, edicion_habilitada=True, edicion_hasta=date.today() - timedelta(days=1)
    )

    respuesta = cliente_de(jefe).patch(
        f'{RUTA}/objetivos/{objetivo.pk}', {'peso': '80'}, format='json'
    )
    assert respuesta.status_code == 400
    assert 'cerró el' in str(respuesta.data)

    # People la amplía con otra fecha y se vuelve a editar.
    registro.edicion_hasta = date.today()
    registro.save(update_fields=['edicion_hasta'])
    assert cliente_de(jefe).patch(
        f'{RUTA}/objetivos/{objetivo.pk}', {'peso': '80'}, format='json'
    ).status_code == 200


# ── CEO: define los suyos y su resultado queda aprobado ───────────────────


def _rol_ceo(usuario):
    Permission.objects.get_or_create(
        code='performance:objetivos:autogestion',
        defaults={
            'name': 'Autogestión',
            'application': Application.objects.get(code='objetivos-kpis'),
        },
    )
    rol = Role.objects.create(code=f'ceo-{usuario.pk}', name='CEO')
    rol.permissions.set(
        Permission.objects.filter(
            code__in=['performance:objetivos:autogestion', 'performance:objetivos:view_all']
        )
    )
    usuario.roles.add(rol)


def test_el_ceo_define_sus_objetivos_y_su_resultado_queda_aprobado(app_performance, equipo):
    jefe, julian, _daniel = equipo
    ceo = crear_usuario('ceo@supli.tech', app_performance, cargo='CEO')
    _rol_ceo(ceo)
    cliente = cliente_de(ceo)

    opciones = cliente.get(f'{RUTA}/opciones').json()
    assert ceo.pk in {p['id'] for p in opciones['equipo']}
    assert opciones['capacidades']['puedeAutogestionar'] is True
    # Ve a toda la organización, aunque no sea su jefe.
    assert {jefe.pk, julian.pk} <= {p['id'] for p in opciones['compania']}

    creado = cliente.post(
        f'{RUTA}/objetivos',
        {'colaborador': ceo.pk, 'periodo': OCTUBRE.isoformat(), 'objetivo': 'Crecer',
         'kpi': 'Revenue', 'peso': '100'},
        format='json',
    )
    assert creado.status_code == 201, creado.data
    # Pero no le define objetivos a quien no es de su equipo.
    ajeno = cliente.post(
        f'{RUTA}/objetivos',
        {'colaborador': julian.pk, 'periodo': OCTUBRE.isoformat(), 'objetivo': 'X',
         'kpi': 'Y', 'peso': '10'},
        format='json',
    )
    assert ajeno.status_code == 403

    objetivo = Objetivo.objects.get(colaborador=ceo)
    _empezar_el_mes(objetivo.periodo)
    resultado = cliente.put(
        f'{RUTA}/objetivos/{objetivo.pk}/resultado',
        {'porcentajeCumplimiento': '90'},
        format='json',
    ).json()
    assert resultado['estadoValidacion'] == EstadoValidacion.VALIDADO
    assert [paso['accion'] for paso in resultado['historial']] == ['cargado', 'validado']

    # Es su propio jefe: la app lo muestra como quien aprueba y puede volver a decidir.
    fila = cliente.get(f'{RUTA}/mis-objetivos').json()[0]
    assert fila['aprobadorNombre'] == ceo.full_name
    assert (fila['puedeCargar'], fila['puedeValidar']) == (True, True)
    assert cliente.post(
        f'{RUTA}/objetivos/{objetivo.pk}/validar', {'estado': 'validado'}, format='json'
    ).status_code == 200


def test_el_ceo_que_tambien_es_people_se_aprueba_a_si_mismo(app_performance, equipo):
    """Con el rol de People encima, la regla de no validarse lo propio no lo bloquea."""
    ceo = crear_usuario(
        'ceo@supli.tech', app_performance, ['performance:objetivos:manage_all'], cargo='CEO'
    )
    _rol_ceo(ceo)
    objetivo = objetivo_de(ceo, ceo, '100')
    _empezar_el_mes(objetivo.periodo)

    resultado = cliente_de(ceo).put(
        f'{RUTA}/objetivos/{objetivo.pk}/resultado',
        {'porcentajeCumplimiento': '100'},
        format='json',
    )

    assert resultado.status_code == 200, resultado.data
    assert resultado.json()['estadoValidacion'] == EstadoValidacion.VALIDADO
    assert cliente_de(ceo).post(
        f'{RUTA}/objetivos/{objetivo.pk}/validar', {'estado': 'validado'}, format='json'
    ).status_code == 200


def test_quien_no_tiene_jefe_ni_el_rol_no_se_aprueba_solo(app_performance):
    """Un dato faltante en Odoo no convierte a nadie en su propio aprobador."""
    sin_jefe = crear_usuario('sinjefe@supli.tech', app_performance)
    objetivo = objetivo_de(sin_jefe, sin_jefe, '100')
    _empezar_el_mes(objetivo.periodo)
    cliente = cliente_de(sin_jefe)

    resultado = cliente.put(
        f'{RUTA}/objetivos/{objetivo.pk}/resultado',
        {'porcentajeCumplimiento': '100'},
        format='json',
    )

    assert resultado.json()['estadoValidacion'] == EstadoValidacion.PENDIENTE
    assert cliente.post(
        f'{RUTA}/objetivos/{objetivo.pk}/validar', {'estado': 'validado'}, format='json'
    ).status_code == 403


def test_el_admin_no_se_autoaprueba(app_performance, equipo):
    """La autogestión hay que asignarla: el admin no la hereda con sus permisos."""
    _jefe, _julian, _daniel = equipo
    admin = crear_usuario('admin@supli.tech', app_performance)
    User.objects.filter(pk=admin.pk).update(kind=User.Kind.ADMIN)
    admin.refresh_from_db()
    objetivo = objetivo_de(admin, admin, '100')
    _empezar_el_mes(objetivo.periodo)

    resultado = cliente_de(admin).put(
        f'{RUTA}/objetivos/{objetivo.pk}/resultado',
        {'porcentajeCumplimiento': '90'},
        format='json',
    ).json()
    assert resultado['estadoValidacion'] == EstadoValidacion.PENDIENTE


# ── Resultados y evidencias (A5) ───────────────────────────────────────────


def test_el_colaborador_registra_su_porcentaje_con_la_evidencia(equipo):
    jefe, julian, _daniel = equipo
    objetivo = objetivo_de(julian, jefe, '100')
    _empezar_el_mes(objetivo.periodo)

    respuesta = cliente_de(julian).put(
        f'{RUTA}/objetivos/{objetivo.pk}/resultado',
        {
            'porcentajeCumplimiento': '90',
            'evidencias': [
                {'nombre': 'Tablero', 'linkSoporte': 'https://supli.sharepoint.com/tablero'}
            ],
        },
        format='json',
    )

    assert respuesta.status_code == 200, respuesta.data
    datos = respuesta.json()
    # El % es el que registró la persona, y de ahí sale el color.
    assert datos['porcentajeCumplimiento'] == '90.00'
    assert datos['semaforo'] == Semaforo.NARANJA
    # Queda pendiente hasta que el jefe revise la evidencia y lo apruebe.
    assert datos['estadoValidacion'] == EstadoValidacion.PENDIENTE
    assert datos['evidencias'][0]['linkSoporte'] == 'https://supli.sharepoint.com/tablero'


def test_el_resultado_lo_carga_el_responsable_no_cualquiera(app_performance, equipo):
    jefe, julian, daniel = equipo
    objetivo = objetivo_de(julian, jefe, '100', responsable_resultado=jefe)
    _empezar_el_mes(objetivo.periodo)

    ajeno = cliente_de(daniel).put(
        f'{RUTA}/objetivos/{objetivo.pk}/resultado',
        {'porcentajeCumplimiento': '100'},
        format='json',
    )
    assert ajeno.status_code == 403

    del_responsable = cliente_de(jefe).put(
        f'{RUTA}/objetivos/{objetivo.pk}/resultado',
        {'porcentajeCumplimiento': '100'},
        format='json',
    )
    assert del_responsable.status_code == 200, del_responsable.data


def test_no_se_carga_el_resultado_de_un_mes_que_no_ha_empezado(equipo):
    jefe, julian, _daniel = equipo
    objetivo = objetivo_de(julian, jefe, '100')

    respuesta = cliente_de(julian).put(
        f'{RUTA}/objetivos/{objetivo.pk}/resultado',
        {'porcentajeCumplimiento': '100'},
        format='json',
    )

    assert respuesta.status_code == 400
    assert 'todavía no empieza' in str(respuesta.data)


def test_el_jefe_valida_el_resultado_y_quien_lo_cargo_no(equipo):
    jefe, julian, _daniel = equipo
    objetivo = objetivo_de(julian, jefe, '100')
    _empezar_el_mes(objetivo.periodo)
    cliente_de(julian).put(
        f'{RUTA}/objetivos/{objetivo.pk}/resultado',
        {'porcentajeCumplimiento': '100'},
        format='json',
    )

    propio = cliente_de(julian).post(
        f'{RUTA}/objetivos/{objetivo.pk}/validar', {'estado': 'validado'}, format='json'
    )
    assert propio.status_code == 403

    sin_razon = cliente_de(jefe).post(
        f'{RUTA}/objetivos/{objetivo.pk}/validar', {'estado': 'rechazado'}, format='json'
    )
    assert sin_razon.status_code == 400

    validado = cliente_de(jefe).post(
        f'{RUTA}/objetivos/{objetivo.pk}/validar',
        {'estado': 'validado', 'observacion': 'Soporte revisado.'},
        format='json',
    )
    assert validado.status_code == 200
    assert validado.json()['estadoValidacion'] == EstadoValidacion.VALIDADO
    assert validado.json()['validadoPorNombre'] == jefe.full_name


def test_el_colaborador_carga_su_resultado_y_el_jefe_tambien_puede(equipo, app_performance):
    """El colaborador sube su evidencia y el jefe la aprueba; el jefe también puede cargarla."""
    jefe, julian, daniel = equipo
    objetivo = objetivo_de(julian, jefe, '100')
    _empezar_el_mes(objetivo.periodo)
    ruta = f'{RUTA}/objetivos/{objetivo.pk}/resultado'
    cuerpo = {'porcentajeCumplimiento': '100'}

    assert cliente_de(julian).put(ruta, cuerpo, format='json').status_code == 200
    assert cliente_de(jefe).put(ruta, cuerpo, format='json').status_code == 200
    # Un compañero que no es jefe ni People no la carga.
    assert cliente_de(daniel).put(ruta, cuerpo, format='json').status_code in (403, 404)


def test_el_jefe_que_cargo_el_resultado_tambien_lo_valida(equipo):
    """El responsable por defecto es el jefe: si carga él, no se queda sin poder validar."""
    jefe, julian, _daniel = equipo
    objetivo = objetivo_de(julian, jefe, '100', responsable_resultado=jefe)
    _empezar_el_mes(objetivo.periodo)
    cliente_de(jefe).put(
        f'{RUTA}/objetivos/{objetivo.pk}/resultado',
        {'porcentajeCumplimiento': '100'},
        format='json',
    )

    validado = cliente_de(jefe).post(
        f'{RUTA}/objetivos/{objetivo.pk}/validar', {'estado': 'validado'}, format='json'
    )

    assert validado.status_code == 200


def test_el_jefe_deja_feedback_sin_pisar_la_observacion_del_colaborador(equipo):
    jefe, julian, daniel = equipo
    objetivo = objetivo_de(julian, jefe, '100')
    _empezar_el_mes(objetivo.periodo)
    cliente_de(julian).put(
        f'{RUTA}/objetivos/{objetivo.pk}/resultado',
        {'porcentajeCumplimiento': '100', 'observacion': 'Entregado el viernes.'},
        format='json',
    )
    ruta = f'{RUTA}/objetivos/{objetivo.pk}/feedback'

    # Ni el colaborador ni un compañero comentan su propio resultado.
    propio = cliente_de(julian).post(ruta, {'feedback': 'Voy bien.'}, format='json')
    assert propio.status_code == 403
    assert cliente_de(daniel).post(ruta, {'feedback': 'Voy bien.'}, format='json').status_code in (
        403,
        404,
    )

    dado = cliente_de(jefe).post(ruta, {'feedback': 'Falta el acta firmada.'}, format='json')
    assert dado.status_code == 200
    assert dado.json()['feedback'] == 'Falta el acta firmada.'
    assert dado.json()['feedbackPorNombre'] == jefe.full_name
    # La observación de quien cargó queda intacta.
    assert dado.json()['observacion'] == 'Entregado el viernes.'

    # Devolver con razón guarda esa razón como feedback, también sin pisar la observación.
    devuelto = cliente_de(jefe).post(
        f'{RUTA}/objetivos/{objetivo.pk}/validar',
        {'estado': 'rechazado', 'observacion': 'Sube el acta.'},
        format='json',
    ).json()
    assert devuelto['feedback'] == 'Sube el acta.'
    assert devuelto['observacion'] == 'Entregado el viernes.'

    # El colaborador ve el feedback en su propio resultado.
    visto = cliente_de(julian).get(f'{RUTA}/mis-objetivos').json()
    assert visto and visto[0]['resultado']['feedback'] == 'Sube el acta.'


def test_el_historial_guarda_cada_paso_con_su_motivo(equipo):
    """Cargar, devolver con motivo, corregir, comentar y validar: todo queda registrado."""
    jefe, julian, _daniel = equipo
    objetivo = objetivo_de(julian, jefe, '100')
    _empezar_el_mes(objetivo.periodo)
    resultado = f'{RUTA}/objetivos/{objetivo.pk}/resultado'
    validar = f'{RUTA}/objetivos/{objetivo.pk}/validar'

    cliente_de(julian).put(resultado, {'porcentajeCumplimiento': '0'}, format='json')
    cliente_de(jefe).post(
        validar, {'estado': 'rechazado', 'observacion': 'Falta el acta.'}, format='json'
    )
    acta = {'nombre': 'Acta', 'linkSoporte': 'https://supli.sharepoint.com/acta'}
    cliente_de(julian).put(
        resultado, {'porcentajeCumplimiento': '100', 'evidencias': [acta]}, format='json'
    )
    cliente_de(jefe).post(
        f'{RUTA}/objetivos/{objetivo.pk}/feedback', {'feedback': 'Ahora sí.'}, format='json'
    )
    cliente_de(jefe).post(validar, {'estado': 'validado'}, format='json')

    # El colaborador lo ve en su propio resultado, en orden.
    historial = cliente_de(julian).get(f'{RUTA}/mis-objetivos').json()[0]['resultado']['historial']
    assert [paso['accion'] for paso in historial] == [
        'cargado',
        'rechazado',
        'corregido',
        'feedback',
        'validado',
    ]
    rechazo = historial[1]
    assert rechazo['comentario'] == 'Falta el acta.'
    assert rechazo['autorNombre'] == jefe.full_name
    # Cada paso guarda el % de ese momento, aunque después se corrija.
    assert float(historial[0]['porcentajeCumplimiento']) == 0
    assert float(historial[2]['porcentajeCumplimiento']) == 100
    # Y las evidencias de ese momento: así el jefe ve «antes → ahora».
    assert historial[0]['evidencias'] == []
    assert historial[2]['evidencias'] == [acta]


def test_corregir_el_resultado_devuelve_la_validacion_a_pendiente(equipo):
    jefe, julian, _daniel = equipo
    objetivo = objetivo_de(julian, jefe, '100')
    _empezar_el_mes(objetivo.periodo)
    cliente = cliente_de(julian)
    cliente.put(
        f'{RUTA}/objetivos/{objetivo.pk}/resultado',
        {'porcentajeCumplimiento': '100'},
        format='json',
    )
    cliente_de(jefe).post(
        f'{RUTA}/objetivos/{objetivo.pk}/validar', {'estado': 'validado'}, format='json'
    )

    corregido = cliente.put(
        f'{RUTA}/objetivos/{objetivo.pk}/resultado', {'porcentajeCumplimiento': '0'}, format='json'
    )

    assert corregido.json()['estadoValidacion'] == EstadoValidacion.PENDIENTE
    assert corregido.json()['porcentajeCumplimiento'] == '0.00'


# ── Asesores y promotores: carga el jefe, aprueba el Trade Marketing Manager ─


def _con_resultado_de(objetivo, quien, porcentaje='95'):
    return cliente_de(quien).put(
        f'{RUTA}/objetivos/{objetivo.pk}/resultado',
        {'porcentajeCumplimiento': porcentaje},
        format='json',
    )


def test_el_asesor_no_registra_su_resultado_lo_registra_su_jefe(punto_de_venta):
    tmm, lider, asesor, promotora = punto_de_venta
    del_asesor = objetivo_de(asesor, lider, '100')
    de_la_promotora = objetivo_de(promotora, lider, '100')
    _empezar_el_mes(del_asesor.periodo)

    propio = _con_resultado_de(del_asesor, asesor)
    assert propio.status_code == 403
    assert 'jefe inmediato' in str(propio.data)
    assert _con_resultado_de(de_la_promotora, promotora).status_code == 403
    # Tampoco lo registra el Trade Marketing Manager: él lo aprueba.
    assert _con_resultado_de(del_asesor, tmm).status_code == 403

    assert _con_resultado_de(del_asesor, lider).status_code == 200
    assert _con_resultado_de(de_la_promotora, lider).status_code == 200


def test_el_resultado_del_asesor_lo_aprueba_el_trade_marketing_manager(punto_de_venta):
    tmm, lider, asesor, _promotora = punto_de_venta
    objetivo = objetivo_de(asesor, lider, '100')
    _empezar_el_mes(objetivo.periodo)
    _con_resultado_de(objetivo, lider)
    validar = f'{RUTA}/objetivos/{objetivo.pk}/validar'

    # El Trade Leader registró el %: no lo aprueba él.
    del_lider = cliente_de(lider).post(validar, {'estado': 'validado'}, format='json')
    assert del_lider.status_code == 403
    assert tmm.full_name in str(del_lider.data)

    del_tmm = cliente_de(tmm).post(
        validar, {'estado': 'validado', 'observacion': 'Evidencia revisada.'}, format='json'
    )
    assert del_tmm.status_code == 200, del_tmm.data
    assert del_tmm.json()['validadoPorNombre'] == tmm.full_name


def test_el_tmm_ve_a_los_asesores_que_aprueba_pero_no_les_define_objetivos(punto_de_venta):
    tmm, lider, asesor, promotora = punto_de_venta
    objetivo_de(asesor, lider, '100')
    cliente = cliente_de(tmm)

    opciones = cliente.get(f'{RUTA}/opciones').json()
    assert {p['id'] for p in opciones['equipo']} == {lider.pk}
    assert {p['id'] for p in opciones['apruebaResultados']} == {asesor.pk, promotora.pk}
    ficha = next(p for p in opciones['apruebaResultados'] if p['id'] == asesor.pk)
    assert ficha['asesorOPromotor'] is True
    assert ficha['aprobador'] == tmm.full_name

    filas = cliente.get(f'{RUTA}/objetivos?colaborador={asesor.pk}&periodo={MES}').json()
    assert len(filas) == 1
    assert (filas[0]['puedeCargar'], filas[0]['puedeValidar']) == (False, True)
    assert filas[0]['aprobadorNombre'] == tmm.full_name

    nuevo = cliente.post(
        f'{RUTA}/objetivos',
        {
            'colaborador': promotora.pk,
            'periodo': OCTUBRE.isoformat(),
            'objetivo': 'Vender 20 líneas',
            'kpi': 'Líneas activadas',
            'peso': '10',
        },
        format='json',
    )
    assert nuevo.status_code == 403


def test_el_lider_ve_quien_carga_y_quien_aprueba_a_su_asesor(punto_de_venta):
    _tmm, lider, asesor, _promotora = punto_de_venta
    objetivo_de(asesor, lider, '100')

    filas = cliente_de(lider).get(f'{RUTA}/objetivos?colaborador={asesor.pk}&periodo={MES}')

    assert (filas.json()[0]['puedeCargar'], filas.json()[0]['puedeValidar']) == (True, False)
    # Y el asesor, en «Mis objetivos», ve que no le toca cargar.
    propios = cliente_de(asesor).get(f'{RUTA}/mis-objetivos?periodo={MES}').json()
    assert propios[0]['puedeCargar'] is False


# ── Cortes de tiempo (A8) ──────────────────────────────────────────────────


def test_el_q_es_trimestral_no_de_cuatro_meses():
    assert rango('trimestre', 2026, 1) == (date(2026, 1, 1), date(2026, 3, 1))
    assert rango('trimestre', 2026, 3) == (date(2026, 7, 1), date(2026, 9, 1))
    assert rango('trimestre', 2026, 4) == (date(2026, 10, 1), date(2026, 12, 1))
    assert rango('semestre', 2026, 2) == (date(2026, 7, 1), date(2026, 12, 1))
    assert rango('anio', 2026) == (date(2026, 1, 1), date(2026, 12, 1))
    assert etiqueta_corte('trimestre', 2026, 3) == '3Q · Jul–Sep 2026'


def test_el_acumulado_pondera_lo_medido_y_pinta_el_semaforo(equipo):
    jefe, julian, _daniel = equipo
    mes = primer_dia(date.today())
    dos = objetivo_de(julian, jefe, '50', periodo=mes)
    objetivo_de(julian, jefe, '50', periodo=mes, objetivo='Otro objetivo')
    cliente_de(julian).put(
        f'{RUTA}/objetivos/{dos.pk}/resultado', {'porcentajeCumplimiento': '80'}, format='json'
    )

    datos = cliente_de(jefe).get(
        f'{RUTA}/acumulado?tipo=trimestre&anio={mes.year}&indice={(mes.month - 1) // 3 + 1}'
    ).json()

    fila = next(f for f in datos['colaboradores'] if f['colaborador'] == julian.pk)
    assert fila['objetivos'] == 2
    assert fila['medidos'] == 1
    # Se pondera sobre lo medido: el objetivo sin resultado no cuenta como cero.
    assert fila['cumplimiento'] == 80.0
    assert fila['semaforo'] == Semaforo.ROJO
    assert datos['cortes']['verdeDesde'] == 100.0
    assert datos['label'].endswith(str(mes.year))


def test_el_tablero_muestra_a_cada_quien_lo_que_le_toca(equipo, app_performance):
    jefe, julian, daniel = equipo
    people = crear_usuario(
        'people@supli.tech', app_performance, permisos=['performance:objetivos:manage_all']
    )
    ajeno = crear_usuario('ajeno@supli.tech', app_performance)

    def ids(usuario, extra=''):
        datos = cliente_de(usuario).get(f'{RUTA}/acumulado?tipo=mes{extra}').json()
        return datos['alcance'], {f['colaborador'] for f in datos['colaboradores']}

    # Líder: solo sus personas a cargo, ni él mismo ni nadie más.
    assert ids(jefe) == ('equipo', {julian.pk, daniel.pk})
    # Colaborador sin equipo: no tiene tablero.
    assert cliente_de(julian).get(f'{RUTA}/acumulado?tipo=mes').status_code == 403
    # People: la compañía entera.
    alcance, todos = ids(people)
    assert alcance == 'compania'
    assert {jefe.pk, julian.pk, daniel.pk, ajeno.pk, people.pk} <= todos


def test_el_top_lo_ve_todo_el_mundo_y_solo_lleva_a_los_medidos(equipo):
    jefe, julian, daniel = equipo
    mes = primer_dia(date.today())
    objetivo = objetivo_de(julian, jefe, '100', periodo=mes)
    objetivo_de(daniel, jefe, '100', periodo=mes)
    _empezar_el_mes(mes)
    cliente_de(julian).put(
        f'{RUTA}/objetivos/{objetivo.pk}/resultado',
        {'porcentajeCumplimiento': '100'},
        format='json',
    )

    # Daniel es un colaborador sin equipo: el tablero no es para él…
    assert cliente_de(daniel).get(f'{RUTA}/acumulado?tipo=mes').status_code == 403

    # …pero el Top sí: le muestra a Julian, que es quien tiene resultado.
    top = cliente_de(daniel).get(f'{RUTA}/acumulado?tipo=mes&alcance=top').json()
    assert [f['colaborador'] for f in top['colaboradores']] == [julian.pk]


# ── Carga de objetivos por Excel ───────────────────────────────────────────


ENCABEZADOS_EXCEL = ('objetivo', 'kpi', 'peso', 'fuente_datos')

#: Una plantilla de la metodología anterior, con tipo de medición, meta y
#: fórmula, y con el responsable por correo: se sigue leyendo, sin esas columnas.
ENCABEZADOS_VIEJOS = (
    'objetivo',
    'kpi',
    'tipo_medicion',
    'unidad',
    'meta',
    'peso',
    'umbral_cumplimiento',
    'permite_sobrecumplimiento',
    'formula',
    'fuente_datos',
    'responsable_correo',
)


def _xlsx(filas, encabezados=ENCABEZADOS_EXCEL):
    """Arma en memoria un .xlsx como el que subiría una persona."""
    libro = openpyxl.Workbook()
    hoja = libro.active
    hoja.title = 'Datos'
    hoja.append(list(encabezados))
    for fila in filas:
        hoja.append(list(fila))
    buffer = BytesIO()
    libro.save(buffer)
    buffer.seek(0)
    buffer.name = 'objetivos.xlsx'
    return buffer


def _fila(objetivo='Entregar el portal', peso='50', encabezados=ENCABEZADOS_EXCEL, **extra):
    valores = {
        'objetivo': objetivo,
        'kpi': 'Portal en producción',
        'tipo_medicion': 'proporcional',
        'unidad': 'unidades',
        'meta': '10',
        'peso': peso,
        'umbral_cumplimiento': None,
        'permite_sobrecumplimiento': 'No',
        'formula': None,
        'fuente_datos': 'Tablero de BI',
        'responsable_correo': None,
    }
    valores.update(extra)
    return tuple(valores[columna] for columna in encabezados)


def _importar(cliente, colaborador, filas, modo='agregar', encabezados=ENCABEZADOS_EXCEL):
    return cliente.post(
        f'{RUTA}/objetivos/importar',
        {
            'archivo': _xlsx(filas, encabezados),
            'colaborador': colaborador.pk,
            'periodo': OCTUBRE.isoformat(),
            'modo': modo,
        },
        format='multipart',
    )


def test_la_plantilla_de_objetivos_trae_encabezados_e_instrucciones(equipo):
    jefe, _julian, _daniel = equipo

    respuesta = cliente_de(jefe).get(f'{RUTA}/objetivos/plantilla')

    assert respuesta.status_code == 200
    assert respuesta['Content-Disposition'].endswith('.xlsx"')
    libro = openpyxl.load_workbook(BytesIO(respuesta.content))
    assert libro.sheetnames == ['Datos', 'Instrucciones']
    # Sin tipo de medición, meta ni fórmula: todo se mide en % de cumplimiento.
    assert [celda.value for celda in libro['Datos'][1]] == list(ENCABEZADOS_EXCEL)
    texto = ' '.join(
        str(celda.value)
        for fila in libro['Instrucciones'].iter_rows()
        for celda in fila
        if celda.value
    )
    assert 'deben sumar 100' in texto
    assert '% de cumplimiento' in texto


def test_el_jefe_carga_los_objetivos_de_su_equipo_por_excel(equipo):
    jefe, julian, _daniel = equipo

    respuesta = _importar(
        cliente_de(jefe),
        julian,
        [_fila('Entregar el portal', peso='60'), _fila('Publicar tableros', peso='40')],
    )

    assert respuesta.status_code == 200, respuesta.data
    datos = respuesta.json()
    assert datos['created'] == 2
    assert datos['completo'] is True
    assert datos['pesoAsignado'] == 100.0
    objetivos = Objetivo.objects.filter(colaborador=julian, periodo=OCTUBRE)
    assert objetivos.count() == 2
    # El registrado_por es quien sube el archivo, no quien lo llenó.
    assert objetivos.first().registrado_por == jefe
    assert set(objetivos.values_list('tipo_medicion', flat=True)) == {TipoMedicion.PORCENTAJE}


def test_el_excel_no_pasa_de_cien_entre_todas_las_filas(equipo):
    """Fila por fila cada peso es válido; lo que no puede pasar es la suma."""
    jefe, julian, _daniel = equipo

    respuesta = _importar(
        cliente_de(jefe),
        julian,
        [_fila('Uno', peso='60'), _fila('Dos', peso='60')],
    )

    assert respuesta.status_code == 400
    assert '120' in str(respuesta.data)
    assert Objetivo.objects.count() == 0


def test_el_excel_cuenta_lo_que_la_persona_ya_tenia(equipo):
    jefe, julian, _daniel = equipo
    objetivo_de(julian, jefe, '70')

    respuesta = _importar(cliente_de(jefe), julian, [_fila('Nuevo', peso='40')])

    assert respuesta.status_code == 400
    # El aviso dice cuánto queda, no solo que no cabe.
    assert 'Solo queda 30%' in str(respuesta.data['filas'][0]['errores'])
    assert Objetivo.objects.count() == 1


def test_el_modo_reemplazar_deja_solo_lo_del_archivo(equipo):
    jefe, julian, _daniel = equipo
    objetivo_de(julian, jefe, '70')

    respuesta = _importar(
        cliente_de(jefe), julian, [_fila('Nuevo', peso='100')], modo='reemplazar'
    )

    assert respuesta.status_code == 200, respuesta.data
    assert respuesta.json()['deleted'] == 1
    assert [o.objetivo for o in Objetivo.objects.all()] == ['Nuevo']


def test_una_fila_mala_cancela_toda_la_carga(equipo):
    jefe, julian, _daniel = equipo

    respuesta = _importar(
        cliente_de(jefe),
        julian,
        [_fila('Buena', peso='50'), _fila('Sin peso', peso='0')],
    )

    assert respuesta.status_code == 400
    assert respuesta.data['filas'][0]['fila'] == 3
    assert 'peso' in str(respuesta.data['filas'][0]['errores']).lower()
    assert Objetivo.objects.count() == 0


def test_un_excel_viejo_se_sigue_leyendo_y_queda_en_porcentaje(equipo):
    """Las columnas de la metodología anterior no rompen la carga ni se guardan."""
    jefe, julian, _daniel = equipo

    respuesta = _importar(
        cliente_de(jefe),
        julian,
        [
            _fila(
                'Uno',
                peso='100',
                encabezados=ENCABEZADOS_VIEJOS,
                tipo_medicion='a-ojo',
                formula='logrado * 2',
            )
        ],
        encabezados=ENCABEZADOS_VIEJOS,
    )

    assert respuesta.status_code == 200, respuesta.data
    objetivo = Objetivo.objects.get()
    assert objetivo.tipo_medicion == TipoMedicion.PORCENTAJE
    assert (objetivo.meta_valor, objetivo.formula) == (None, '')


def test_el_responsable_del_resultado_es_siempre_el_jefe_directo(equipo):
    """Por formulario o por Excel: no se escoge, sale de la jerarquía."""
    jefe, julian, daniel = equipo

    # Un archivo viejo que todavía trae la columna no la impone.
    respuesta = _importar(
        cliente_de(jefe),
        julian,
        [
            _fila(
                'Uno',
                peso='100',
                encabezados=ENCABEZADOS_VIEJOS,
                responsable_correo=daniel.email,
            )
        ],
        encabezados=ENCABEZADOS_VIEJOS,
    )
    assert respuesta.status_code == 200, respuesta.data
    assert Objetivo.objects.get().responsable_resultado == jefe

    # Y por la API tampoco se puede poner a otra persona.
    objetivo = Objetivo.objects.get()
    editado = cliente_de(jefe).patch(
        f'{RUTA}/objetivos/{objetivo.pk}', {'responsableResultado': daniel.pk}, format='json'
    )
    assert editado.status_code == 200, editado.data
    objetivo.refresh_from_db()
    assert objetivo.responsable_resultado == jefe


def test_nadie_carga_por_excel_los_objetivos_de_otro_equipo(app_performance, equipo):
    jefe, julian, _daniel = equipo
    ajeno = crear_usuario('ajeno@supli.tech', app_performance)

    respuesta = _importar(cliente_de(ajeno), julian, [_fila('Uno')])

    assert respuesta.status_code == 403
    assert Objetivo.objects.count() == 0


def test_no_se_carga_el_excel_de_un_mes_congelado(app_performance, equipo):
    jefe, julian, _daniel = equipo
    cliente = cliente_de(jefe)
    # El mes en curso ya está congelado: se define hasta el último día del anterior.
    respuesta = cliente.post(
        f'{RUTA}/objetivos/importar',
        {
            'archivo': _xlsx([_fila('Uno')]),
            'colaborador': julian.pk,
            'periodo': primer_dia(date.today()).isoformat(),
        },
        format='multipart',
    )

    assert respuesta.status_code == 400
    assert 'congelados' in str(respuesta.data)


def test_la_plantilla_se_llena_y_se_sube_tal_cual(equipo):
    """El ciclo real: descargar, borrar el ejemplo, llenar y subir."""
    jefe, julian, _daniel = equipo
    cliente = cliente_de(jefe)

    descargada = cliente.get(f'{RUTA}/objetivos/plantilla')
    libro = openpyxl.load_workbook(BytesIO(descargada.content))
    hoja = libro['Datos']
    hoja.delete_rows(2)  # la fila de ejemplo
    hoja.append(['Entregar el portal', 'Portal en producción', 100, 'Tablero de BI'])
    buffer = BytesIO()
    libro.save(buffer)
    buffer.seek(0)
    buffer.name = 'plantilla-llena.xlsx'

    respuesta = cliente.post(
        f'{RUTA}/objetivos/importar',
        {'archivo': buffer, 'colaborador': julian.pk, 'periodo': OCTUBRE.isoformat()},
        format='multipart',
    )

    assert respuesta.status_code == 200, respuesta.data
    objetivo = Objetivo.objects.get()
    assert objetivo.peso == Decimal('100.00')
    assert objetivo.fuente_datos == 'Tablero de BI'
    assert objetivo.tipo_medicion == TipoMedicion.PORCENTAJE
