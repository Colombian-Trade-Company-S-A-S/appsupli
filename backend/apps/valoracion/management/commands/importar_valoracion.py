"""
Trae la valoración del sistema anterior (xppcoltrade, módulo_valoracion).

    python manage.py importar_valoracion --origen "postgresql://usuario:clave@host:5432/base"
    python manage.py importar_valoracion --simular      # corre todo y revierte al final
    python manage.py importar_valoracion --reemplazar   # borra lo que haya y vuelve a traer

La conexión de origen también se puede pasar en VALORACION_ORIGEN_URL.

Copia competencias, preguntas, ciclos, asignaciones, respuestas, planes de acción
y la configuración, conservando los IDs: los ciclos guardan los IDs de sus
preguntas excluidas. Los resultados no se copian: se recalculan con el motor de
este proyecto (el anterior guardaba el detalle con otras claves) y se comparan
con los del origen para confirmar que cuadran.

Las personas se emparejan por correo y, si no, por usuario. Quien no exista aquí
se crea inactivo y sin contraseña, para no perder su historial.
"""
import os

import psycopg
from django.core.management.base import BaseCommand, CommandError
from django.core.management.color import no_style
from django.db import connection, transaction
from psycopg import sql
from psycopg.rows import dict_row

from apps.accounts.models import Area, User
from apps.valoracion import scoring
from apps.valoracion.models import (
    ActionPlan,
    Answer,
    Assignment,
    Competency,
    Cycle,
    Question,
    Result,
    ValuationSettings,
)

# Código de área del sistema anterior → nombre del área aquí.
AREAS = {
    'ceo': 'Presidencia',
    'direccion_comercial': 'Direccion Comercial',
    'direccion_operaciones': 'Direccion de Operaciones',
    'tecnologia': 'Tech',
    'accounting': 'Accounting',
    'finanzas': 'Finance',
    'sales': 'Sales',
    'logistics': 'Logistics',
    'procurement': 'Procurement',
    'trade': 'Trade Marketing',
    'brands': 'Brands',
    'bi': 'Business Intelligence',
    'sales_corporativo': 'Sales Corporativo',
    'sales_retail': 'Sales Retail',
    'people': 'People',
    'quality': 'Quality',
}

# En orden de borrado: las preguntas y competencias están protegidas.
MODELOS = [ActionPlan, Result, Answer, Assignment, Cycle, Question, Competency]


class Command(BaseCommand):
    help = 'Trae competencias, preguntas, ciclos y respuestas de la valoración anterior.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--origen',
            default=os.environ.get('VALORACION_ORIGEN_URL', ''),
            help='URL o cadena de conexión del Postgres de origen.',
        )
        parser.add_argument(
            '--schema',
            default='BdModuloValoracion',
            help='Esquema de Postgres donde viven las tablas de origen.',
        )
        parser.add_argument(
            '--reemplazar',
            action='store_true',
            help='Borra la valoración actual antes de importar.',
        )
        parser.add_argument(
            '--simular',
            action='store_true',
            help='Hace toda la importación y la revierte al final.',
        )

    def handle(self, *args, **options):
        if not options['origen']:
            raise CommandError('Falta la conexión de origen (--origen o VALORACION_ORIGEN_URL).')
        self.schema = options['schema']

        with psycopg.connect(options['origen'], row_factory=dict_row) as origen:
            self.cursor = origen.cursor()
            with transaction.atomic():
                self._preparar_destino(options['reemplazar'])
                self._importar()
                if options['simular']:
                    transaction.set_rollback(True)
                    self.stdout.write(self.style.WARNING('Simulación: no se guardó nada.'))
                else:
                    self.stdout.write(self.style.SUCCESS('Importación guardada.'))

    # ── Pasos ───────────────────────────────────────────────────────────────

    def _preparar_destino(self, reemplazar: bool) -> None:
        ocupados = [m._meta.verbose_name_plural for m in MODELOS if m.objects.exists()]
        if ocupados and not reemplazar:
            raise CommandError(
                f'Ya hay datos de valoración ({", ".join(ocupados)}). '
                'Usa --reemplazar para borrarlos y volver a importar.'
            )
        for modelo in MODELOS:
            modelo.objects.all().delete()

    def _importar(self) -> None:
        self.origen_usuarios = {f['id']: f for f in self._filas('user_usuario')}
        self.personas = self._emparejar_personas()
        self.creadas: list[User] = []

        n = self._copiar(
            Competency,
            self._filas('valoracion_competencias'),
            lambda f: Competency(
                id=f['id'],
                code=f['codigo'],
                name=f['nombre'],
                description=f['descripcion'],
                order=f['orden'],
                is_active=f['activa'],
            ),
        )
        self._contar('competencias', n)

        n = self._copiar(
            Question,
            self._filas('valoracion_preguntas'),
            lambda f: Question(
                id=f['id'],
                competency_id=f['competencia_id'],
                statement=f['enunciado'],
                evaluation_type=f['tipo_evaluacion'],
                question_type=f['tipo_pregunta'],
                weight=f['peso'],
                order=f['orden'],
                is_required=f['obligatoria'],
                is_active=f['activa'],
            ),
        )
        self._contar('preguntas', n)

        n = self._copiar(
            Cycle,
            self._filas('valoracion_ciclos'),
            lambda f: Cycle(
                id=f['id'],
                name=f['nombre'],
                description=f['descripcion'],
                evaluation_type=f['tipo'],
                start_date=f['fecha_inicio'],
                end_date=f['fecha_cierre'],
                status=f['estado'],
                is_anonymous=f['anonimato'],
                comments_required=f['comentarios_obligatorios'],
                manager_weight=f['peso_jefe_lider'],
                team_weight=f['peso_equipo_lider'],
                excluded_questions=f['preguntas_excluidas'] or [],
                created_by=self._persona(f['creado_por_id']),
            ),
        )
        self._contar('ciclos', n)

        n = self._copiar(
            Assignment,
            self._filas('valoracion_asignaciones'),
            lambda f: Assignment(
                id=f['id'],
                cycle_id=f['ciclo_id'],
                evaluator=self._persona(f['evaluador_id']),
                evaluatee=self._persona(f['evaluado_id']),
                evaluator_role=f['rol_evaluador'],
                evaluation_type=f['tipo_evaluacion'],
                status=f['estado'],
                is_active=f['activa'],
                agreements=f['observaciones_acuerdos'],
                started_at=f['fecha_inicio_respuesta'],
                completed_at=f['fecha_completada'],
            ),
        )
        self._contar('asignaciones', n)

        n = self._copiar(
            Answer,
            self._filas('valoracion_respuestas'),
            lambda f: Answer(
                id=f['id'],
                assignment_id=f['asignacion_id'],
                question_id=f['pregunta_id'],
                value=f['valor'],
                text=f['respuesta_abierta'],
                answered_at=f['fecha_respuesta'],
            ),
        )
        self._contar('respuestas', n)

        # Los IDs se trajeron a mano: la secuencia debe seguir desde el mayor.
        with connection.cursor() as cursor:
            for consulta in connection.ops.sequence_reset_sql(no_style(), MODELOS):
                cursor.execute(consulta)

        self._importar_configuracion()

        for ciclo in Cycle.objects.all():
            scoring.recompute_cycle(ciclo)
        resultados_origen = {f['id']: f for f in self._filas('valoracion_resultados')}
        self._contar('resultados recalculados', Result.objects.count())
        self._comparar_resultados(resultados_origen)

        self._importar_planes(resultados_origen)

        for persona in self.creadas:
            self.stdout.write(
                self.style.WARNING(
                    f'  Creada inactiva (no estaba en la plataforma): {persona.full_name} '
                    f'<{persona.email}>'
                )
            )

    def _importar_configuracion(self) -> None:
        filas = self._filas('valoracion_configuracion')
        if not filas:
            return
        fila = filas[0]
        ajustes = ValuationSettings.load()
        ajustes.results_published = fila['resultados_publicados']
        ajustes.published_at = fila['fecha_publicacion']
        ajustes.updated_by = self._persona(fila['actualizado_por_id'])
        ajustes.save()
        estado = 'publicados' if ajustes.results_published else 'bloqueados'
        self.stdout.write(f'  configuración: resultados {estado}')

    def _importar_planes(self, resultados_origen: dict) -> None:
        # Los resultados se recalcularon con IDs nuevos: se ubican por ciclo y persona.
        resultados = {(r.cycle_id, r.evaluatee_id): r for r in Result.objects.all()}
        sin_resultado = 0

        def plan(f):
            nonlocal sin_resultado
            origen = resultados_origen[f['resultado_id']]
            resultado = resultados.get(
                (origen['ciclo_id'], self._persona(origen['evaluado_id']).pk)
            )
            if resultado is None:
                sin_resultado += 1
                return None
            return ActionPlan(
                result=resultado,
                description=f['descripcion'],
                owner=self._persona(f['responsable_id']),
                due_date=f['fecha_compromiso'],
                status=f['estado'],
                evidence_url=f['evidencia_url'],
                notes=f['observaciones'],
                created_by=self._persona(f['creado_por_id']),
            )

        self._contar('planes de acción', self._copiar(
            ActionPlan, self._filas('valoracion_planes_accion'), plan
        ))
        if sin_resultado:
            self.stdout.write(
                self.style.WARNING(f'  {sin_resultado} plan(es) sin resultado aquí; se omitieron.')
            )

    def _comparar_resultados(self, resultados_origen: dict) -> None:
        """Confirma que el motor de aquí llega al mismo porcentaje que el anterior."""
        actuales = {(r.cycle_id, r.evaluatee_id): r for r in Result.objects.all()}
        diferencias = []
        for fila in resultados_origen.values():
            persona = self._persona(fila['evaluado_id'])
            resultado = actuales.get((fila['ciclo_id'], persona.pk))
            antes = float(fila['porcentaje'])
            ahora = float(resultado.percentage) if resultado else None
            if ahora is None or abs(antes - ahora) > 0.05:
                diferencias.append((persona.full_name, antes, ahora))

        if not diferencias:
            self.stdout.write(
                self.style.SUCCESS(
                    f'  Los {len(resultados_origen)} resultados cuadran con el sistema anterior.'
                )
            )
            return
        self.stdout.write(
            self.style.WARNING(f'  {len(diferencias)} resultado(s) no cuadran con el anterior:')
        )
        for nombre, antes, ahora in diferencias:
            self.stdout.write(f'    {nombre}: antes {antes}% · ahora {ahora}%')

    # ── Personas ────────────────────────────────────────────────────────────

    def _emparejar_personas(self) -> dict[int, User]:
        """ID de la persona en el origen → su usuario aquí (por correo o usuario)."""
        usuarios = list(User.objects.all())
        por_correo = {u.email.lower(): u for u in usuarios}
        por_usuario = {u.username.lower(): u for u in usuarios}
        personas = {}
        for id_origen, fila in self.origen_usuarios.items():
            usuario = por_correo.get(fila['email'].lower()) or por_usuario.get(
                fila['username'].lower()
            )
            if usuario:
                personas[id_origen] = usuario
        return personas

    def _persona(self, id_origen: int | None) -> User | None:
        if id_origen is None:
            return None
        if id_origen not in self.personas:
            self.personas[id_origen] = self._crear_persona(self.origen_usuarios[id_origen])
        return self.personas[id_origen]

    def _crear_persona(self, fila: dict) -> User:
        """Crea inactiva, sin contraseña, a una persona que ya no está en la plataforma."""
        usuario = User(
            email=fila['email'].lower(),
            username=fila['username'],
            first_name=fila['nombre'],
            last_name=fila['apellido'] or '',
            position=fila['cargo'] or '',
            area=Area.objects.filter(name=AREAS.get(fila['area'] or '')).first(),
            manager=self.personas.get(fila['jefe_directo_id']),
            kind=(
                User.Kind.LEADER if fila['tipo_usuario'] == 'lider' else User.Kind.COLLABORATOR
            ),
            is_active=False,
        )
        usuario.set_unusable_password()
        usuario.save()
        self.creadas.append(usuario)
        return usuario

    # ── Utilidades ──────────────────────────────────────────────────────────

    def _filas(self, tabla: str) -> list[dict]:
        self.cursor.execute(
            sql.SQL('SELECT * FROM {}.{} ORDER BY id').format(
                sql.Identifier(self.schema), sql.Identifier(tabla)
            )
        )
        return self.cursor.fetchall()

    def _copiar(self, modelo, filas: list[dict], construir) -> int:
        pares = [(objeto, fila) for fila in filas if (objeto := construir(fila)) is not None]
        objetos = modelo.objects.bulk_create([o for o, _f in pares], batch_size=500)
        # bulk_create pisa `created_at` con la hora actual: se deja la del origen.
        for objeto, (_o, fila) in zip(objetos, pares, strict=True):
            fecha = fila.get('fecha_creacion') or fila.get('fecha_respuesta')
            if fecha:
                objeto.created_at = fecha
        modelo.objects.bulk_update(objetos, ['created_at'], batch_size=500)
        return len(objetos)

    def _contar(self, que: str, cuantos: int) -> None:
        self.stdout.write(f'  {que}: {cuantos}')
