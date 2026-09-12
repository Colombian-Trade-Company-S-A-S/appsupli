"""
Pruebas del módulo de valoración.

Cubren lo que no se puede verificar a ojo: el motor de cálculo (ponderaciones,
semáforo, consolidado entre ciclos), el candado de publicación y quién puede
ver qué.
"""
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Application, Area, Permission, Role, User
from apps.valoracion import scoring
from apps.valoracion.models import (
    Answer,
    Assignment,
    AssignmentStatus,
    Competency,
    Cycle,
    CycleStatus,
    EvaluationType,
    EvaluatorRole,
    Level,
    Question,
    QuestionType,
    Result,
    ValuationSettings,
    level_for,
)

pytestmark = pytest.mark.django_db


# ── Utilidades ─────────────────────────────────────────────────────────────

@pytest.fixture
def app_valoracion():
    from apps.valoracion.management.commands.seed_valoracion_app import PERMISOS

    app = Application.objects.create(
        code='valoracion', name='Valoración', base_path='/inicio/valoracion', order=300
    )
    for code, name in PERMISOS:
        Permission.objects.create(code=code, name=name, application=app)
    return app


def crear_usuario(email, app=None, *, kind=User.Kind.COLLABORATOR, manager=None, **extra):
    usuario = User.objects.create_user(
        email=email,
        username=email.split('@')[0],
        first_name=email.split('@')[0].title(),
        password='clave-de-prueba-123',
        kind=kind,
        manager=manager,
        **extra,
    )
    if app:
        usuario.applications.add(app)
    return usuario


def dar_rol(usuario, codigo_rol, codigos_permiso):
    rol = Role.objects.create(code=codigo_rol, name=codigo_rol)
    rol.permissions.set(Permission.objects.filter(code__in=codigos_permiso))
    usuario.roles.add(rol)
    return rol


def cliente_de(usuario) -> APIClient:
    cliente = APIClient()
    cliente.force_authenticate(user=usuario)
    return cliente


@pytest.fixture
def banco():
    """Dos competencias con dos preguntas likert cada una, tipo liderazgo."""
    competencias = [
        Competency.objects.create(code='A', name='CULTURA', order=1),
        Competency.objects.create(code='B', name='EJECUCIÓN', order=2),
    ]
    preguntas = []
    for competencia in competencias:
        for indice in range(2):
            preguntas.append(
                Question.objects.create(
                    competency=competencia,
                    statement=f'{competencia.code}{indice} enunciado',
                    evaluation_type=EvaluationType.LEADER,
                    question_type=QuestionType.LIKERT,
                    order=indice,
                )
            )
    return preguntas


@pytest.fixture
def ciclo():
    ahora = timezone.now()
    return Cycle.objects.create(
        name='Q2 2026',
        evaluation_type=EvaluationType.LEADER,
        start_date=ahora - timedelta(days=1),
        end_date=ahora + timedelta(days=10),
        status=CycleStatus.ACTIVE,
    )


def responder(asignacion, preguntas, valor):
    for pregunta in preguntas:
        Answer.objects.create(assignment=asignacion, question=pregunta, value=valor)
    asignacion.status = AssignmentStatus.COMPLETED
    asignacion.completed_at = timezone.now()
    asignacion.save()


# ── Semáforo ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    'porcentaje,esperado',
    [
        (100, Level.REFERENT),
        (90, Level.REFERENT),
        (89.9, Level.CONSOLIDATED),
        (75, Level.CONSOLIDATED),
        (60, Level.DEVELOPING),
        (40, Level.SUPPORT),
        (39.9, Level.INTERVENTION),
        (0, Level.INTERVENTION),
        (None, Level.INTERVENTION),
    ],
)
def test_semaforo_respeta_los_rangos(porcentaje, esperado):
    assert level_for(porcentaje) == esperado


# ── Motor de cálculo ───────────────────────────────────────────────────────

def test_puntaje_de_una_asignacion_es_el_promedio_sobre_cinco(banco, ciclo):
    jefe = crear_usuario('jefe@supli.tech')
    evaluado = crear_usuario('evaluado@supli.tech', manager=jefe)
    asignacion = Assignment.objects.create(
        cycle=ciclo,
        evaluator=jefe,
        evaluatee=evaluado,
        evaluator_role=EvaluatorRole.MANAGER,
        evaluation_type=EvaluationType.LEADER,
    )
    responder(asignacion, banco, 4)
    assert scoring.assignment_score(asignacion) == pytest.approx(80.0)


def test_liderazgo_pondera_jefe_60_equipo_40(banco, ciclo):
    lider = crear_usuario('lider@supli.tech', kind=User.Kind.LEADER)
    jefe = crear_usuario('jefe@supli.tech')
    lider.manager = jefe
    lider.save()
    colaborador = crear_usuario('colab@supli.tech', manager=lider)

    del_jefe = Assignment.objects.create(
        cycle=ciclo,
        evaluator=jefe,
        evaluatee=lider,
        evaluator_role=EvaluatorRole.MANAGER,
        evaluation_type=EvaluationType.LEADER,
    )
    del_equipo = Assignment.objects.create(
        cycle=ciclo,
        evaluator=colaborador,
        evaluatee=lider,
        evaluator_role=EvaluatorRole.TEAM,
        evaluation_type=EvaluationType.LEADER,
    )
    responder(del_jefe, banco, 5)  # 100%
    responder(del_equipo, banco, 3)  # 60%

    resultado = scoring.recompute_result(ciclo, lider)
    # 100 × 0.6 + 60 × 0.4 = 84
    assert float(resultado.percentage) == pytest.approx(84.0)
    assert resultado.level == Level.CONSOLIDATED
    assert resultado.evaluators_total == 2
    assert resultado.evaluators_manager == 1
    assert resultado.evaluators_team == 1


def test_autoevaluacion_no_suma_si_hay_mirada_externa(banco, ciclo):
    jefe = crear_usuario('jefe@supli.tech')
    persona = crear_usuario('persona@supli.tech', manager=jefe)

    del_jefe = Assignment.objects.create(
        cycle=ciclo,
        evaluator=jefe,
        evaluatee=persona,
        evaluator_role=EvaluatorRole.MANAGER,
        evaluation_type=EvaluationType.LEADER,
    )
    auto = Assignment.objects.create(
        cycle=ciclo,
        evaluator=persona,
        evaluatee=persona,
        evaluator_role=EvaluatorRole.SELF,
        evaluation_type=EvaluationType.LEADER,
    )
    responder(del_jefe, banco, 3)  # 60%
    responder(auto, banco, 5)  # 100%, solo referencia

    resultado = scoring.recompute_result(ciclo, persona)
    assert float(resultado.percentage) == pytest.approx(60.0)
    assert float(resultado.self_score) == pytest.approx(100.0)


def test_solo_autoevaluacion_se_usa_como_referencia(banco, ciclo):
    persona = crear_usuario('persona@supli.tech')
    auto = Assignment.objects.create(
        cycle=ciclo,
        evaluator=persona,
        evaluatee=persona,
        evaluator_role=EvaluatorRole.SELF,
        evaluation_type=EvaluationType.LEADER,
    )
    responder(auto, banco, 4)
    resultado = scoring.recompute_result(ciclo, persona)
    assert float(resultado.percentage) == pytest.approx(80.0)


def test_detalle_por_competencia_y_brecha_de_autopercepcion(banco, ciclo):
    jefe = crear_usuario('jefe@supli.tech')
    persona = crear_usuario('persona@supli.tech', manager=jefe)
    del_jefe = Assignment.objects.create(
        cycle=ciclo,
        evaluator=jefe,
        evaluatee=persona,
        evaluator_role=EvaluatorRole.MANAGER,
        evaluation_type=EvaluationType.LEADER,
    )
    auto = Assignment.objects.create(
        cycle=ciclo,
        evaluator=persona,
        evaluatee=persona,
        evaluator_role=EvaluatorRole.SELF,
        evaluation_type=EvaluationType.LEADER,
    )
    responder(del_jefe, banco, 2)
    responder(auto, banco, 5)

    items, competencias = scoring.item_detail(ciclo, persona)
    assert len(items) == 4
    assert len(competencias) == 2
    primero = items[0]
    assert primero['manager_average'] == 2
    assert primero['self_average'] == 5
    assert primero['self_gap'] == 3  # se ve 3 puntos por encima del jefe
    assert primero['average'] == pytest.approx(3.5)
    assert sum(d['count'] for d in primero['distribution']) == 2


def test_consolidado_entre_ciclos_pondera_por_calificaciones(banco):
    """1 calificación al 60% + 4 al 90% → 84% con 5 calificaciones."""
    ahora = timezone.now()
    persona = crear_usuario('persona@supli.tech')
    ciclo_1 = Cycle.objects.create(
        name='C1',
        evaluation_type=EvaluationType.LEADER,
        start_date=ahora - timedelta(days=60),
        end_date=ahora - timedelta(days=50),
    )
    ciclo_2 = Cycle.objects.create(
        name='C2',
        evaluation_type=EvaluationType.LEADER,
        start_date=ahora - timedelta(days=10),
        end_date=ahora,
    )
    Result.objects.create(
        cycle=ciclo_1,
        evaluatee=persona,
        evaluation_type=EvaluationType.LEADER,
        percentage=60,
        evaluators_total=1,
    )
    Result.objects.create(
        cycle=ciclo_2,
        evaluatee=persona,
        evaluation_type=EvaluationType.LEADER,
        percentage=90,
        evaluators_total=4,
    )

    consolidado = scoring.consolidate_people(
        list(Result.objects.select_related('cycle', 'evaluatee'))
    )
    assert len(consolidado) == 1
    fila = consolidado[0]
    assert fila['percentage'] == pytest.approx(84.0)
    assert fila['evaluations'] == 5
    assert fila['cycles'] == 2
    assert fila['trend'] == 30.0


def test_sin_evaluaciones_completadas_se_borra_el_resultado(banco, ciclo):
    jefe = crear_usuario('jefe@supli.tech')
    persona = crear_usuario('persona@supli.tech', manager=jefe)
    asignacion = Assignment.objects.create(
        cycle=ciclo,
        evaluator=jefe,
        evaluatee=persona,
        evaluator_role=EvaluatorRole.MANAGER,
        evaluation_type=EvaluationType.LEADER,
    )
    responder(asignacion, banco, 4)
    assert scoring.recompute_result(ciclo, persona) is not None

    asignacion.is_active = False
    asignacion.save()
    assert scoring.recompute_result(ciclo, persona) is None
    assert not Result.objects.filter(cycle=ciclo, evaluatee=persona).exists()


# ── Ciclos: ventana de fechas ──────────────────────────────────────────────

def test_ciclo_activo_pero_vencido_no_admite_respuestas():
    ahora = timezone.now()
    ciclo = Cycle.objects.create(
        name='Vencido',
        evaluation_type=EvaluationType.LEADER,
        start_date=ahora - timedelta(days=20),
        end_date=ahora - timedelta(days=1),
        status=CycleStatus.ACTIVE,
    )
    assert not ciclo.is_open()
    assert ciclo.effective_status == 'vencido'
    assert 'cerró' in ciclo.unavailable_reason()


# ── API: responder una evaluación ──────────────────────────────────────────

def test_borrador_y_envio_de_una_evaluacion(app_valoracion, banco, ciclo):
    jefe = crear_usuario('jefe@supli.tech', app_valoracion)
    persona = crear_usuario('persona@supli.tech', app_valoracion, manager=jefe)
    asignacion = Assignment.objects.create(
        cycle=ciclo,
        evaluator=jefe,
        evaluatee=persona,
        evaluator_role=EvaluatorRole.MANAGER,
        evaluation_type=EvaluationType.LEADER,
    )
    cliente = cliente_de(jefe)

    # El formulario no revela la competencia de cada pregunta.
    detalle = cliente.get(f'/api/valoracion/mis-evaluaciones/{asignacion.id}')
    assert detalle.status_code == 200
    assert len(detalle.data['questions']) == 4
    assert 'competency' not in detalle.data['questions'][0]

    # Borrador parcial: queda en progreso, no completada.
    respuesta = cliente.post(
        f'/api/valoracion/mis-evaluaciones/{asignacion.id}/guardar',
        {'action': 'borrador', 'answers': [{'question': banco[0].id, 'value': 4}]},
        format='json',
    )
    assert respuesta.status_code == 200
    assert respuesta.data['status'] == AssignmentStatus.IN_PROGRESS
    assert respuesta.data['answered'] == 1

    # Envío incompleto: NO se pierde lo escrito, solo se avisa qué falta.
    respuesta = cliente.post(
        f'/api/valoracion/mis-evaluaciones/{asignacion.id}/guardar',
        {'action': 'enviar', 'answers': [{'question': banco[0].id, 'value': 5}]},
        format='json',
    )
    assert respuesta.status_code == 200
    assert respuesta.data['completed'] is False
    assert len(respuesta.data['missing_questions']) == 3
    asignacion.refresh_from_db()
    assert asignacion.status == AssignmentStatus.IN_PROGRESS
    assert Answer.objects.get(assignment=asignacion, question=banco[0]).value == 5

    # Envío completo.
    respuesta = cliente.post(
        f'/api/valoracion/mis-evaluaciones/{asignacion.id}/guardar',
        {
            'action': 'enviar',
            'agreements': 'Acordamos revisar en 30 días.',
            'answers': [{'question': p.id, 'value': 4} for p in banco],
        },
        format='json',
    )
    assert respuesta.data['completed'] is True
    asignacion.refresh_from_db()
    assert asignacion.status == AssignmentStatus.COMPLETED

    # Una vez enviada, queda bloqueada.
    respuesta = cliente.post(
        f'/api/valoracion/mis-evaluaciones/{asignacion.id}/guardar',
        {'action': 'borrador', 'answers': []},
        format='json',
    )
    assert respuesta.status_code == 400


def test_nadie_responde_evaluaciones_ajenas(app_valoracion, banco, ciclo):
    jefe = crear_usuario('jefe@supli.tech', app_valoracion)
    persona = crear_usuario('persona@supli.tech', app_valoracion, manager=jefe)
    intruso = crear_usuario('intruso@supli.tech', app_valoracion)
    asignacion = Assignment.objects.create(
        cycle=ciclo,
        evaluator=jefe,
        evaluatee=persona,
        evaluator_role=EvaluatorRole.MANAGER,
        evaluation_type=EvaluationType.LEADER,
    )
    respuesta = cliente_de(intruso).get(f'/api/valoracion/mis-evaluaciones/{asignacion.id}')
    assert respuesta.status_code == 404


def test_sin_la_app_asignada_no_hay_modulo(app_valoracion):
    fuera = crear_usuario('fuera@supli.tech')  # sin la app
    assert cliente_de(fuera).get('/api/valoracion/resumen').status_code == 403


# ── API: permisos de configuración ─────────────────────────────────────────

def test_configurar_preguntas_exige_permiso(app_valoracion):
    colaborador = crear_usuario('colab@supli.tech', app_valoracion)
    configurador = crear_usuario('bi@supli.tech', app_valoracion)
    dar_rol(configurador, 'bi', ['valoracion:config:manage'])

    competencia = Competency.objects.create(code='A', name='CULTURA')
    cuerpo = {
        'competency': competencia.id,
        'statement': 'Nueva pregunta',
        'evaluationType': EvaluationType.LEADER,
        'questionType': QuestionType.LIKERT,
    }
    ruta = '/api/valoracion/preguntas'
    assert cliente_de(colaborador).post(ruta, cuerpo, format='json').status_code == 403
    assert cliente_de(configurador).post(ruta, cuerpo, format='json').status_code == 201


def test_solo_quien_administra_ciclos_consolida(app_valoracion, ciclo):
    colaborador = crear_usuario('colab@supli.tech', app_valoracion)
    people = crear_usuario('people@supli.tech', app_valoracion)
    dar_rol(people, 'people', ['valoracion:cycles:manage'])

    ruta = f'/api/valoracion/ciclos/{ciclo.id}/consolidar'
    assert cliente_de(colaborador).post(ruta).status_code == 403
    assert cliente_de(people).post(ruta).status_code == 200


# ── API: candado de publicación ────────────────────────────────────────────

def test_mis_resultados_estan_bloqueados_hasta_publicar(app_valoracion, banco, ciclo):
    jefe = crear_usuario('jefe@supli.tech', app_valoracion)
    persona = crear_usuario('persona@supli.tech', app_valoracion, manager=jefe)
    asignacion = Assignment.objects.create(
        cycle=ciclo,
        evaluator=jefe,
        evaluatee=persona,
        evaluator_role=EvaluatorRole.MANAGER,
        evaluation_type=EvaluationType.LEADER,
    )
    responder(asignacion, banco, 4)
    scoring.recompute_result(ciclo, persona)

    cliente = cliente_de(persona)
    assert cliente.get('/api/valoracion/resultados/mis-resultados').status_code == 403

    # Quien no tiene el permiso tampoco puede publicar.
    assert cliente.patch(
        '/api/valoracion/configuracion', {'resultsPublished': True}, format='json'
    ).status_code == 403

    people = crear_usuario('people@supli.tech', app_valoracion)
    dar_rol(people, 'people', ['valoracion:results:publish'])
    assert cliente_de(people).patch(
        '/api/valoracion/configuracion', {'resultsPublished': True}, format='json'
    ).status_code == 200

    respuesta = cliente.get('/api/valoracion/resultados/mis-resultados')
    assert respuesta.status_code == 200
    assert respuesta.data['consolidated']['percentage'] == pytest.approx(80.0)


# ── API: visibilidad de resultados ─────────────────────────────────────────

def test_cada_quien_ve_lo_que_le_corresponde(app_valoracion, banco, ciclo):
    ValuationSettings.load()
    jefe = crear_usuario('jefe@supli.tech', app_valoracion, kind=User.Kind.LEADER)
    persona = crear_usuario('persona@supli.tech', app_valoracion, manager=jefe)
    ajeno = crear_usuario('ajeno@supli.tech', app_valoracion)

    asignacion = Assignment.objects.create(
        cycle=ciclo,
        evaluator=jefe,
        evaluatee=persona,
        evaluator_role=EvaluatorRole.MANAGER,
        evaluation_type=EvaluationType.LEADER,
    )
    responder(asignacion, banco, 4)
    resultado = scoring.recompute_result(ciclo, persona)

    # El jefe directo sí; alguien de otro equipo no.
    assert cliente_de(jefe).get(f'/api/valoracion/resultados/{resultado.id}').status_code == 200
    assert cliente_de(ajeno).get(f'/api/valoracion/resultados/{resultado.id}').status_code == 404

    # El dashboard exige permiso de informes.
    assert cliente_de(jefe).get('/api/valoracion/dashboard').status_code == 403
    ceo = crear_usuario('ceo@supli.tech', app_valoracion)
    dar_rol(ceo, 'ceo', ['valoracion:results:view_all', 'valoracion:dashboard:view'])
    respuesta = cliente_de(ceo).get('/api/valoracion/dashboard')
    assert respuesta.status_code == 200
    assert respuesta.data['company_average'] == pytest.approx(80.0)
    assert respuesta.data['totals']['people'] == 1


def test_promedio_de_lideres_cuenta_la_evaluacion_de_liderazgo(app_valoracion, banco, ciclo):
    """Líder es quien se evaluó con el modelo de liderazgo, no el tipo de su cuenta."""
    evaluador = crear_usuario('evaluador@supli.tech', app_valoracion)
    evaluado_lider = crear_usuario('coordinador@supli.tech', app_valoracion)
    lider_de_cuenta = crear_usuario('lider@supli.tech', app_valoracion, kind=User.Kind.LEADER)
    for evaluado, tipo, valor in (
        (evaluado_lider, EvaluationType.LEADER, 5),
        (lider_de_cuenta, EvaluationType.OPERATIONAL, 3),
    ):
        asignacion = Assignment.objects.create(
            cycle=ciclo,
            evaluator=evaluador,
            evaluatee=evaluado,
            evaluator_role=EvaluatorRole.MANAGER,
            evaluation_type=tipo,
        )
        responder(asignacion, banco, valor)
        scoring.recompute_result(ciclo, evaluado)

    ceo = crear_usuario('ceo@supli.tech', app_valoracion)
    dar_rol(ceo, 'ceo', ['valoracion:dashboard:view'])
    datos = cliente_de(ceo).get('/api/valoracion/dashboard').data
    assert datos['leaders_count'] == 1
    assert datos['leaders_average'] == pytest.approx(100.0)


def test_ciclo_anonimo_oculta_al_evaluador(app_valoracion, banco):
    ahora = timezone.now()
    ciclo = Cycle.objects.create(
        name='Anónimo',
        evaluation_type=EvaluationType.LEADER,
        start_date=ahora - timedelta(days=1),
        end_date=ahora + timedelta(days=5),
        status=CycleStatus.ACTIVE,
        is_anonymous=True,
    )
    ValuationSettings.objects.create(pk=1, results_published=True)
    jefe = crear_usuario('jefe@supli.tech', app_valoracion, kind=User.Kind.LEADER)
    persona = crear_usuario('persona@supli.tech', app_valoracion, manager=jefe)
    asignacion = Assignment.objects.create(
        cycle=ciclo,
        evaluator=jefe,
        evaluatee=persona,
        evaluator_role=EvaluatorRole.MANAGER,
        evaluation_type=EvaluationType.LEADER,
    )
    responder(asignacion, banco, 4)
    resultado = scoring.recompute_result(ciclo, persona)

    propio = cliente_de(persona).get(f'/api/valoracion/resultados/{resultado.id}')
    assert propio.data['ratings'][0]['evaluator'] == 'Anónimo'

    people = crear_usuario('people@supli.tech', app_valoracion)
    dar_rol(people, 'people', ['valoracion:results:view_all'])
    visto = cliente_de(people).get(f'/api/valoracion/resultados/{resultado.id}')
    assert visto.data['ratings'][0]['evaluator'] == jefe.full_name


# ── API: generación de asignaciones por jerarquía ──────────────────────────

def test_generar_asignaciones_desde_el_organigrama(app_valoracion):
    area = Area.objects.create(name='Trade')
    people = crear_usuario('people@supli.tech', app_valoracion, area=area)
    dar_rol(people, 'people', ['valoracion:cycles:manage'])

    lider = crear_usuario('lider@supli.tech', app_valoracion, kind=User.Kind.LEADER, area=area)
    uno = crear_usuario('uno@supli.tech', app_valoracion, manager=lider, area=area)
    dos = crear_usuario('dos@supli.tech', app_valoracion, manager=lider, area=area)

    ahora = timezone.now()
    ciclo = Cycle.objects.create(
        name='Mixto',
        evaluation_type='mixta',
        start_date=ahora,
        end_date=ahora + timedelta(days=5),
    )
    respuesta = cliente_de(people).post(
        f'/api/valoracion/ciclos/{ciclo.id}/generar-asignaciones', {}, format='json'
    )
    assert respuesta.status_code == 200

    # Cada colaborador: su jefe lo evalúa (operativo) y él evalúa a su jefe.
    assert Assignment.objects.filter(
        cycle=ciclo, evaluator=lider, evaluatee=uno, evaluator_role=EvaluatorRole.MANAGER
    ).exists()
    assert Assignment.objects.filter(
        cycle=ciclo, evaluator=dos, evaluatee=lider, evaluator_role=EvaluatorRole.TEAM
    ).exists()
    # Es idempotente: repetirla no duplica.
    total = Assignment.objects.filter(cycle=ciclo).count()
    cliente_de(people).post(
        f'/api/valoracion/ciclos/{ciclo.id}/generar-asignaciones', {}, format='json'
    )
    assert Assignment.objects.filter(cycle=ciclo).count() == total


def test_reabrir_borra_respuestas_y_recalcula(app_valoracion, banco, ciclo):
    people = crear_usuario('people@supli.tech', app_valoracion)
    dar_rol(people, 'people', ['valoracion:cycles:manage'])
    jefe = crear_usuario('jefe@supli.tech', app_valoracion)
    persona = crear_usuario('persona@supli.tech', app_valoracion, manager=jefe)
    asignacion = Assignment.objects.create(
        cycle=ciclo,
        evaluator=jefe,
        evaluatee=persona,
        evaluator_role=EvaluatorRole.MANAGER,
        evaluation_type=EvaluationType.LEADER,
    )
    responder(asignacion, banco, 4)
    scoring.recompute_result(ciclo, persona)
    assert Result.objects.filter(evaluatee=persona).exists()

    respuesta = cliente_de(people).post(f'/api/valoracion/asignaciones/{asignacion.id}/reabrir')
    assert respuesta.status_code == 200
    asignacion.refresh_from_db()
    assert asignacion.status == AssignmentStatus.PENDING
    assert not Answer.objects.filter(assignment=asignacion).exists()
    assert not Result.objects.filter(evaluatee=persona).exists()


# ── API: jerarquía ─────────────────────────────────────────────────────────

def test_la_jerarquia_no_admite_ciclos(app_valoracion):
    people = crear_usuario('people@supli.tech', app_valoracion)
    dar_rol(people, 'people', ['valoracion:hierarchy:manage'])
    jefe = crear_usuario('jefe@supli.tech', app_valoracion)
    persona = crear_usuario('persona@supli.tech', app_valoracion, manager=jefe)

    cliente = cliente_de(people)
    # Poner a la persona como jefe de su propio jefe cerraría el organigrama.
    respuesta = cliente.patch(
        f'/api/valoracion/jerarquia/{jefe.id}', {'manager': persona.id}, format='json'
    )
    assert respuesta.status_code == 400

    respuesta = cliente.patch(
        f'/api/valoracion/jerarquia/{persona.id}',
        {'position': 'Analista Senior'},
        format='json',
    )
    assert respuesta.status_code == 200
    persona.refresh_from_db()
    assert persona.position == 'Analista Senior'
