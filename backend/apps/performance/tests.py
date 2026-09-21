"""
Pruebas de Objetivos y KPIs: permisos, reglas de negocio y motor de cálculo.

Las reglas que se prueban acá son las del §6 de la especificación técnica; el
número de cada una va en el nombre de la prueba cuando aplica.
"""
from datetime import date
from decimal import Decimal

import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from apps.accounts.models import Application, Permission, Role, User
from apps.performance.cumplimiento import (
    FormulaInvalida,
    calcular_cumplimiento,
    cumplimiento_total,
    evaluar_formula,
)
from apps.performance.models import (
    EstadoObjetivo,
    EstadoPeriodo,
    Objetivo,
    Periodo,
    TipoMedicion,
    Unidad,
)

pytestmark = pytest.mark.django_db

OCTUBRE = date(2026, 10, 1)
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
        'tipo_medicion': TipoMedicion.BINARIO,
        'unidad': Unidad.SI_NO,
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


# ── Motor de cálculo (§5) ──────────────────────────────────────────────────


def test_el_binario_es_todo_o_nada():
    objetivo = Objetivo(tipo_medicion=TipoMedicion.BINARIO, tope_cumplimiento=100)
    assert calcular_cumplimiento(objetivo, 1) == Decimal('100.00')
    assert calcular_cumplimiento(objetivo, 0) == Decimal('0.00')


def test_el_proporcional_divide_lo_logrado_entre_la_meta():
    objetivo = Objetivo(
        tipo_medicion=TipoMedicion.PROPORCIONAL, meta_valor=Decimal('8'), tope_cumplimiento=100
    )
    assert calcular_cumplimiento(objetivo, 6) == Decimal('75.00')
    # Sin sobrecumplimiento, pasarse de la meta se topa en 100.
    assert calcular_cumplimiento(objetivo, 10) == Decimal('100.00')

    objetivo.permite_sobrecumplimiento = True
    assert calcular_cumplimiento(objetivo, 10) == Decimal('125.00')


def test_el_proporcional_inverso_premia_el_valor_mas_bajo():
    """Menos es mejor: días, costos, tickets."""
    objetivo = Objetivo(
        tipo_medicion=TipoMedicion.PROPORCIONAL_INVERSO,
        meta_valor=Decimal('2'),
        tope_cumplimiento=100,
    )
    assert calcular_cumplimiento(objetivo, 2) == Decimal('100.00')
    assert calcular_cumplimiento(objetivo, 4) == Decimal('50.00')
    # Ejecutar cero es el mejor resultado posible, no una división por cero.
    assert calcular_cumplimiento(objetivo, 0) == Decimal('100.00')


def test_la_formula_solo_evalua_aritmetica_con_logrado_y_meta():
    assert evaluar_formula('logrado / meta * 100', {'logrado': 5, 'meta': 10}) == 50
    assert evaluar_formula('min(logrado / meta * 100, 120)', {'logrado': 20, 'meta': 10}) == 120

    for peligrosa in (
        '__import__("os").system("dir")',
        'open("password.txt").read()',
        'otra_variable * 2',
        'logrado.__class__',
    ):
        with pytest.raises(FormulaInvalida):
            evaluar_formula(peligrosa, {'logrado': 1, 'meta': 1})


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
            'periodo': '2026-10-01',
            'objetivo': 'Entregar el portal de autogestión BI',
            'kpi': 'Portal en producción',
            'peso': '30',
            'tipoMedicion': 'binario',
            'unidad': 'si_no',
        },
        format='json',
    )

    assert respuesta.status_code == 201, respuesta.data
    creado = Objetivo.objects.get()
    assert creado.registrado_por == jefe
    assert creado.estado == EstadoObjetivo.BORRADOR
    # El responsable del resultado, si no se dice otra cosa, es el colaborador.
    assert creado.responsable_resultado == julian
    # El mes se abre solo con el primer objetivo.
    assert Periodo.objects.get(periodo=OCTUBRE).estado == EstadoPeriodo.DEFINICION


def test_nadie_define_sus_propios_objetivos(equipo):
    """Regla 3: el objetivo lo crea el jefe o People, nunca el colaborador."""
    _, julian, _ = equipo

    respuesta = cliente_de(julian).post(
        f'{RUTA}/objetivos',
        {
            'colaborador': julian.pk,
            'periodo': '2026-10-01',
            'objetivo': 'Auto-asignarme algo fácil',
            'kpi': 'Lo que yo diga',
            'peso': '100',
            'tipoMedicion': 'binario',
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
            'periodo': '2026-10-01',
            'objetivo': 'Objetivo de otro equipo',
            'kpi': 'KPI',
            'peso': '10',
            'tipoMedicion': 'binario',
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
            'periodo': '2026-10-01',
            'objetivo': 'Objetivo transversal de People',
            'kpi': 'KPI',
            'peso': '20',
            'tipoMedicion': 'binario',
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
            'periodo': '2026-10-01',
            'objetivo': 'El séptimo',
            'kpi': 'KPI',
            'peso': '10',
            'tipoMedicion': 'binario',
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
            'periodo': '2026-10-01',
            'objetivo': 'Uno que se pasa',
            'kpi': 'KPI',
            'peso': '30',
            'tipoMedicion': 'binario',
        },
        format='json',
    )

    assert respuesta.status_code == 400
    assert 'Solo queda 20%' in str(respuesta.data)


def test_la_meta_es_obligatoria_salvo_en_binario(equipo):
    jefe, julian, _ = equipo
    cliente = cliente_de(jefe)
    base = {
        'colaborador': julian.pk,
        'periodo': '2026-10-01',
        'objetivo': 'Publicar tableros validados',
        'kpi': 'Tableros publicados',
        'peso': '25',
        'tipoMedicion': 'proporcional',
        'unidad': 'unidades',
    }

    sin_meta = cliente.post(f'{RUTA}/objetivos', base, format='json')
    assert sin_meta.status_code == 400

    en_cero = cliente.post(f'{RUTA}/objetivos', {**base, 'metaValor': '0'}, format='json')
    assert en_cero.status_code == 400

    con_meta = cliente.post(f'{RUTA}/objetivos', {**base, 'metaValor': '8'}, format='json')
    assert con_meta.status_code == 201, con_meta.data


def test_la_formula_se_valida_al_guardarla(equipo):
    jefe, julian, _ = equipo
    base = {
        'colaborador': julian.pk,
        'periodo': '2026-10-01',
        'objetivo': 'Índice compuesto',
        'kpi': 'Índice',
        'peso': '25',
        'tipoMedicion': 'formula',
        'metaValor': '10',
    }

    mala = cliente_de(jefe).post(
        f'{RUTA}/objetivos', {**base, 'formula': '__import__("os")'}, format='json'
    )
    assert mala.status_code == 400

    buena = cliente_de(jefe).post(
        f'{RUTA}/objetivos', {**base, 'formula': 'logrado / meta * 100'}, format='json'
    )
    assert buena.status_code == 201, buena.data


# ── Periodo (§6, reglas 1 y 5) ─────────────────────────────────────────────


def test_activar_el_mes_exige_que_todos_sumen_cien(app_performance, equipo):
    jefe, julian, daniel = equipo
    people = crear_usuario('people@supli.tech', app_performance, ['performance:periodos:manage'])
    objetivo_de(julian, jefe, '100')
    objetivo_de(daniel, jefe, '60')

    respuesta = cliente_de(people).post(f'{RUTA}/periodos/2026-10/activar')

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

    respuesta = cliente_de(people).post(f'{RUTA}/periodos/2026-10/activar')

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

    respuesta = cliente_de(jefe).post(f'{RUTA}/periodos/2026-10/activar')

    assert respuesta.status_code == 403
    assert Objetivo.objects.filter(estado=EstadoObjetivo.CONGELADO).count() == 0


# ── Consulta (§6, regla 6 y §7) ────────────────────────────────────────────


def test_el_colaborador_consulta_los_suyos_en_solo_lectura(equipo):
    jefe, julian, daniel = equipo
    objetivo_de(julian, jefe, '100')
    objetivo_de(daniel, jefe, '100')

    respuesta = cliente_de(julian).get(f'{RUTA}/mis-objetivos?periodo=2026-10')

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

    del_jefe = cliente_de(jefe).get(f'{RUTA}/objetivos?periodo=2026-10').json()
    assert {fila['colaborador'] for fila in del_jefe} == {julian.pk}

    del_ceo = cliente_de(ceo).get(f'{RUTA}/objetivos?periodo=2026-10').json()
    assert {fila['colaborador'] for fila in del_ceo} == {julian.pk, ajeno.pk}


def test_el_historico_no_se_pisa_al_cambiar_de_mes(equipo):
    """Regla 6: cada (persona, mes) es un registro aparte."""
    jefe, julian, _ = equipo
    objetivo_de(julian, jefe, '100')
    objetivo_de(julian, jefe, '100', periodo=date(2026, 11, 1))

    octubre = cliente_de(jefe).get(f'{RUTA}/objetivos?colaborador={julian.pk}&periodo=2026-10')
    noviembre = cliente_de(jefe).get(f'{RUTA}/objetivos?colaborador={julian.pk}&periodo=2026-11')

    assert len(octubre.json()) == 1
    assert len(noviembre.json()) == 1
    assert Objetivo.objects.filter(colaborador=julian).count() == 2


def test_el_resumen_dice_cuanto_falta_para_el_cien(equipo):
    jefe, julian, _ = equipo
    objetivo_de(julian, jefe, '30')
    objetivo_de(julian, jefe, '25', objetivo='Otro')

    datos = cliente_de(jefe).get(f'{RUTA}/periodos/2026-10/resumen?colaborador={julian.pk}').json()

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
    assert len(datos['tiposMedicion']) == len(TipoMedicion.choices)
    assert datos['capacidades']['esLider'] is True


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
