"""
Valoración de desempeño: configuración, ciclos, evaluación y resultados.

Los informes (dashboard, consolidado y exportes) viven en `views_reports.py`.
"""
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from . import scoring
from .api_permissions import (
    CanConfigure,
    CanManageCycles,
    CanManageHierarchy,
    CanManagePlans,
    CanReadConfig,
    HasValuationApp,
    can_manage_cycles,
    can_manage_plans,
    can_publish_results,
    can_view_all,
    can_view_dashboard,
    can_view_results,
    capabilities,
    is_leader,
)
from .models import (
    LIKERT_LABELS,
    ActionPlan,
    ActionPlanStatus,
    Answer,
    Assignment,
    AssignmentStatus,
    Competency,
    Cycle,
    EvaluationType,
    EvaluatorRole,
    Question,
    QuestionType,
    Result,
    ValuationSettings,
)
from .serializers import (
    CHOICES,
    ActionPlanSerializer,
    AssignmentSerializer,
    CompetencySerializer,
    CycleSerializer,
    HierarchySerializer,
    MyAssignmentSerializer,
    PersonSerializer,
    QuestionSerializer,
    ResultSerializer,
    SubmitSerializer,
    ValuationSettingsSerializer,
)

User = get_user_model()


class ValuationViewSet(viewsets.ModelViewSet):
    """Base: todo el módulo exige tener la aplicación asignada."""

    permission_classes = [HasValuationApp]


def questions_for(assignment: Assignment):
    """Preguntas que aplican a una asignación, según su tipo y el ciclo."""
    return list(
        Question.objects.filter(evaluation_type=assignment.evaluation_type, is_active=True)
        .exclude(id__in=assignment.cycle.excluded_questions or [])
        .order_by('competency__order', 'order', 'id')
    )


# ───────────────────────────────────────────────────────────────────────────
# Configuración: competencias y preguntas
# ───────────────────────────────────────────────────────────────────────────

class CompetencyViewSet(ValuationViewSet):
    queryset = Competency.objects.prefetch_related('questions').order_by('order', 'code')
    serializer_class = CompetencySerializer
    search_fields = ('code', 'name')
    filterset_fields = ('is_active',)
    pagination_class = None

    def get_permissions(self):
        regla = CanReadConfig if self.request.method in ('GET', 'HEAD') else CanConfigure
        return [HasValuationApp(), regla()]

    def destroy(self, request, *args, **kwargs):
        competencia = self.get_object()
        if competencia.questions.exists():
            return Response(
                {
                    'code': 'protected',
                    'message': (
                        f'«{competencia.label}» tiene {competencia.questions.count()} pregunta(s). '
                        'Muévelas o desactiva la competencia en vez de eliminarla.'
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)


class QuestionViewSet(ValuationViewSet):
    queryset = Question.objects.select_related('competency').order_by(
        'competency__order', 'order', 'id'
    )
    serializer_class = QuestionSerializer
    search_fields = ('statement',)
    filterset_fields = ('competency', 'evaluation_type', 'question_type', 'is_active')
    pagination_class = None

    def get_permissions(self):
        regla = CanReadConfig if self.request.method in ('GET', 'HEAD') else CanConfigure
        return [HasValuationApp(), regla()]

    def destroy(self, request, *args, **kwargs):
        pregunta = self.get_object()
        if pregunta.answers.exists():
            return Response(
                {
                    'code': 'protected',
                    'message': (
                        'Esta pregunta ya tiene respuestas y borrarla alteraría resultados '
                        'ya calculados. Desactívala: dejará de aparecer en los ciclos nuevos.'
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)


# ───────────────────────────────────────────────────────────────────────────
# Ciclos y asignaciones
# ───────────────────────────────────────────────────────────────────────────

class CycleViewSet(ValuationViewSet):
    serializer_class = CycleSerializer
    search_fields = ('name',)
    filterset_fields = ('status', 'evaluation_type')
    pagination_class = None

    def get_queryset(self):
        activas = Q(assignments__is_active=True)
        return (
            Cycle.objects.select_related('created_by')
            .annotate(
                assignments_total=Count('assignments', filter=activas, distinct=True),
                assignments_completed=Count(
                    'assignments',
                    filter=activas & Q(assignments__status=AssignmentStatus.COMPLETED),
                    distinct=True,
                ),
            )
            .order_by('-start_date')
        )

    def get_permissions(self):
        # Cualquiera con la app ve los ciclos (los necesita para filtrar sus
        # resultados); solo quien administra el módulo los modifica.
        regla = None if self.request.method in ('GET', 'HEAD') else CanManageCycles
        return [HasValuationApp()] + ([regla()] if regla else [])

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def destroy(self, request, *args, **kwargs):
        ciclo = self.get_object()
        respondidas = Assignment.objects.filter(
            cycle=ciclo, status__in=(AssignmentStatus.IN_PROGRESS, AssignmentStatus.COMPLETED)
        ).count()
        if respondidas:
            return Response(
                {
                    'code': 'protected',
                    'message': (
                        f'El ciclo tiene {respondidas} evaluación(es) con respuestas. '
                        'Ciérralo o cancélalo en vez de eliminarlo.'
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['get'], permission_classes=[HasValuationApp, CanManageCycles])
    def asignaciones(self, request, pk=None):
        """GET /ciclos/{id}/asignaciones — el tablero de quién evalúa a quién."""
        ciclo = self.get_object()
        qs = Assignment.objects.filter(cycle=ciclo).select_related(
            'evaluator', 'evaluatee', 'cycle'
        )
        rol = request.query_params.get('evaluator_role')
        estado = request.query_params.get('status')
        if rol:
            qs = qs.filter(evaluator_role=rol)
        if estado:
            qs = qs.filter(status=estado)
        qs = qs.order_by('evaluatee__first_name', 'evaluator__first_name')
        return Response(AssignmentSerializer(qs, many=True).data)

    @action(detail=True, methods=['post'], url_path='generar-asignaciones')
    def generar_asignaciones(self, request, pk=None):
        """Crea las asignaciones leyendo el organigrama (`User.manager`).

        · Ciclo de liderazgo → cada persona evalúa a su jefe (rol equipo).
        · Ciclo operativo    → cada jefe evalúa a su gente (rol jefe).
        · Ciclo mixto        → ambas.
        """
        ciclo = self.get_object()
        areas = request.data.get('areas') or []
        con_autoevaluacion = bool(request.data.get('self_evaluation'))

        personas = User.objects.filter(is_active=True, manager__isnull=False).select_related(
            'manager'
        )
        if areas:
            personas = personas.filter(area_id__in=areas)

        creadas = omitidas = 0

        def crear(evaluador, evaluado, rol, tipo):
            nonlocal creadas, omitidas
            if not evaluador.is_active or not evaluado.is_active:
                omitidas += 1
                return
            if evaluador.pk == evaluado.pk and rol != EvaluatorRole.SELF:
                omitidas += 1
                return
            _, nueva = Assignment.objects.get_or_create(
                cycle=ciclo,
                evaluator=evaluador,
                evaluatee=evaluado,
                defaults={'evaluator_role': rol, 'evaluation_type': tipo},
            )
            creadas += nueva
            omitidas += not nueva

        with transaction.atomic():
            for persona in personas:
                jefe = persona.manager
                # Si se acotó por áreas, el jefe también debe estar dentro:
                # una evaluación cruzada entre áreas no seleccionadas confunde.
                if areas and jefe.area_id not in {int(a) for a in areas}:
                    omitidas += 1
                    continue
                if ciclo.evaluation_type == EvaluationType.LEADER:
                    crear(persona, jefe, EvaluatorRole.TEAM, EvaluationType.LEADER)
                elif ciclo.evaluation_type == EvaluationType.OPERATIONAL:
                    crear(jefe, persona, EvaluatorRole.MANAGER, EvaluationType.OPERATIONAL)
                else:
                    crear(jefe, persona, EvaluatorRole.MANAGER, EvaluationType.OPERATIONAL)
                    crear(persona, jefe, EvaluatorRole.TEAM, EvaluationType.LEADER)

                if con_autoevaluacion:
                    tipo = (
                        EvaluationType.LEADER
                        if ciclo.evaluation_type == EvaluationType.LEADER
                        else EvaluationType.OPERATIONAL
                    )
                    crear(persona, persona, EvaluatorRole.SELF, tipo)

        return Response(
            {
                'created': creadas,
                'skipped': omitidas,
                'message': f'{creadas} asignación(es) creadas, {omitidas} omitidas.',
            }
        )

    @action(detail=True, methods=['post'])
    def consolidar(self, request, pk=None):
        """Corre el motor de cálculo sobre todo el ciclo. Es reejecutable."""
        ciclo = self.get_object()
        procesados = scoring.recompute_cycle(ciclo)
        return Response(
            {
                'processed': procesados,
                'message': (
                    f'Se consolidaron los resultados de {procesados} persona(s).'
                    if procesados
                    else 'Todavía no hay evaluaciones completadas para consolidar.'
                ),
            }
        )

    @action(detail=True, methods=['get'], permission_classes=[HasValuationApp, CanManageCycles])
    def pendientes(self, request, pk=None):
        """Quiénes no han respondido: el seguimiento del ciclo."""
        ciclo = self.get_object()
        qs = (
            Assignment.objects.filter(cycle=ciclo, is_active=True)
            .exclude(status=AssignmentStatus.COMPLETED)
            .select_related('evaluator', 'evaluatee', 'cycle')
            .order_by('evaluator__first_name', 'evaluatee__first_name')
        )
        filas = []
        for asignacion in qs:
            filas.append(
                {
                    **AssignmentSerializer(asignacion).data,
                    'answered': scoring.answered_count(asignacion),
                    'evaluator_email': asignacion.evaluator.email,
                }
            )
        return Response({'items': filas, 'total': len(filas), 'progress': _cycle_progress(ciclo)})


def _cycle_progress(ciclo) -> dict:
    activas = Assignment.objects.filter(cycle=ciclo, is_active=True)
    total = activas.count()
    completadas = activas.filter(status=AssignmentStatus.COMPLETED).count()
    return {
        'total': total,
        'completed': completadas,
        'pending': total - completadas,
        'percentage': round(completadas * 100.0 / total, 1) if total else 0.0,
    }


class AssignmentViewSet(ValuationViewSet):
    queryset = Assignment.objects.select_related('cycle', 'evaluator', 'evaluatee').order_by(
        'cycle', 'evaluatee__first_name'
    )
    serializer_class = AssignmentSerializer
    permission_classes = [HasValuationApp, CanManageCycles]
    filterset_fields = ('cycle', 'evaluator', 'evaluatee', 'status', 'evaluator_role', 'is_active')
    pagination_class = None

    def destroy(self, request, *args, **kwargs):
        asignacion = self.get_object()
        ciclo, evaluado = asignacion.cycle, asignacion.evaluatee
        respuesta = super().destroy(request, *args, **kwargs)
        # El consolidado ya no debe cargar con una evaluación que se borró.
        scoring.recompute_result(ciclo, evaluado)
        return respuesta

    @action(detail=True, methods=['post'])
    def reabrir(self, request, pk=None):
        """Borra las respuestas y deja la evaluación lista para rehacerse.

        Se usa cuando alguien califica por error. Recalcula el consolidado,
        porque esa evaluación deja de pesar de inmediato.
        """
        asignacion = self.get_object()
        with transaction.atomic():
            borradas = Answer.objects.filter(assignment=asignacion).delete()[0]
            asignacion.status = AssignmentStatus.PENDING
            asignacion.started_at = None
            asignacion.completed_at = None
            asignacion.agreements = ''
            asignacion.save()
            scoring.recompute_result(asignacion.cycle, asignacion.evaluatee)
        return Response(
            {
                **self.get_serializer(asignacion).data,
                'message': f'Evaluación reabierta ({borradas} respuesta(s) borradas).',
            }
        )

    @action(detail=True, methods=['post'], url_path='toggle-activa')
    def toggle_activa(self, request, pk=None):
        """Activa o desactiva la asignación sin borrar lo respondido."""
        asignacion = self.get_object()
        asignacion.is_active = not asignacion.is_active
        asignacion.save(update_fields=['is_active', 'updated_at'])
        scoring.recompute_result(asignacion.cycle, asignacion.evaluatee)
        return Response(self.get_serializer(asignacion).data)


# ───────────────────────────────────────────────────────────────────────────
# Mis evaluaciones: responder lo asignado
# ───────────────────────────────────────────────────────────────────────────

class MyEvaluationViewSet(viewsets.ReadOnlyModelViewSet):
    """Lo que a mí me toca calificar. No necesita permisos: es trabajo propio."""

    serializer_class = MyAssignmentSerializer
    permission_classes = [HasValuationApp]
    pagination_class = None

    def get_queryset(self):
        return (
            Assignment.objects.filter(evaluator=self.request.user, is_active=True)
            .select_related('cycle', 'evaluatee', 'evaluatee__area')
            .order_by('status', 'cycle__end_date', 'evaluatee__first_name')
        )

    def _decorate(self, asignacion):
        preguntas = questions_for(asignacion)
        asignacion.questions_total = len(preguntas)
        asignacion.questions_answered = scoring.answered_count(asignacion)
        motivo = (
            'Esta asignación fue desactivada por el administrador del módulo.'
            if not asignacion.is_active
            else asignacion.cycle.unavailable_reason()
        )
        if asignacion.status == AssignmentStatus.COMPLETED:
            motivo = 'Ya enviaste esta evaluación; no se puede modificar.'
        asignacion.blocked_reason = motivo
        asignacion.can_answer = motivo is None
        return asignacion

    def list(self, request, *args, **kwargs):
        asignaciones = [self._decorate(a) for a in self.get_queryset()]
        estado = request.query_params.get('status')
        if estado:
            asignaciones = [a for a in asignaciones if a.status == estado]
        return Response(self.get_serializer(asignaciones, many=True).data)

    def retrieve(self, request, *args, **kwargs):
        """El formulario: preguntas + lo que ya llevaba respondido.

        Nunca se envía la competencia de cada pregunta: es información interna
        y el evaluador no debe verla al calificar.
        """
        asignacion = self._decorate(self.get_object())
        preguntas = questions_for(asignacion)
        respuestas = {
            r.question_id: r for r in Answer.objects.filter(assignment=asignacion)
        }
        return Response(
            {
                'assignment': self.get_serializer(asignacion).data,
                'cycle': {
                    'id': asignacion.cycle_id,
                    'name': asignacion.cycle.name,
                    'description': asignacion.cycle.description,
                    'end_date': asignacion.cycle.end_date,
                    'is_anonymous': asignacion.cycle.is_anonymous,
                    'comments_required': asignacion.cycle.comments_required,
                },
                'agreements': asignacion.agreements,
                'scale': [
                    {'value': valor, 'label': LIKERT_LABELS[valor]}
                    for valor in (5, 4, 3, 2, 1)
                ],
                'questions': [
                    {
                        'id': p.id,
                        'statement': p.statement,
                        'question_type': p.question_type,
                        'is_required': p.is_required,
                        'order': indice + 1,
                        'value': getattr(respuestas.get(p.id), 'value', None),
                        'text': getattr(respuestas.get(p.id), 'text', '') or '',
                    }
                    for indice, p in enumerate(preguntas)
                ],
            }
        )

    @action(detail=True, methods=['post'])
    def guardar(self, request, pk=None):
        """Guarda borrador o envía la evaluación.

        Un envío incompleto NO se rechaza: se guarda igual como borrador y se
        avisa qué falta. Rechazarlo haría perder decenas de respuestas ya
        escritas, que fue el problema que tenía la versión anterior.
        """
        asignacion = self.get_object()
        if asignacion.status == AssignmentStatus.COMPLETED:
            raise ValidationError(
                {'detail': 'Esta evaluación ya fue enviada y no se puede modificar.'}
            )

        motivo = (
            'Esta asignación fue desactivada por el administrador del módulo.'
            if not asignacion.is_active
            else asignacion.cycle.unavailable_reason()
        )
        if motivo:
            raise ValidationError({'detail': motivo})

        entrada = SubmitSerializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        datos = entrada.validated_data
        enviar = datos['action'] == 'enviar'
        acuerdos = (datos.get('agreements') or '').strip()

        preguntas = {p.id: p for p in questions_for(asignacion)}
        recibidas = {
            r['question']: (r.get('value'), (r.get('text') or '').strip())
            for r in datos['answers']
            if r['question'] in preguntas
        }

        faltantes = []
        for pregunta in preguntas.values():
            valor, texto = recibidas.get(pregunta.id, (None, ''))
            if pregunta.question_type != QuestionType.LIKERT:
                valor = None
            if not (enviar and pregunta.is_required):
                continue
            if pregunta.question_type == QuestionType.LIKERT and valor is None:
                faltantes.append(pregunta.id)
            elif pregunta.question_type == QuestionType.OPEN and not texto:
                faltantes.append(pregunta.id)

        faltan_acuerdos = enviar and asignacion.cycle.comments_required and not acuerdos
        completar = enviar and not faltantes and not faltan_acuerdos
        ahora = timezone.now()

        with transaction.atomic():
            # Guardado en bloque: un update_or_create por pregunta abría dos
            # savepoints cada uno y con 50+ preguntas el envío se pasaba del
            # timeout, abortaba la transacción y se perdía todo lo respondido.
            existentes = {r.question_id: r for r in Answer.objects.filter(assignment=asignacion)}
            crear, actualizar = [], []
            for pregunta in preguntas.values():
                valor, texto = recibidas.get(pregunta.id, (None, ''))
                if pregunta.question_type != QuestionType.LIKERT:
                    valor = None
                actual = existentes.get(pregunta.id)
                if actual is None:
                    if valor is None and not texto:
                        continue
                    crear.append(
                        Answer(
                            assignment=asignacion,
                            question=pregunta,
                            value=valor,
                            text=texto,
                            answered_at=ahora,
                        )
                    )
                elif actual.value != valor or actual.text != texto:
                    actual.value = valor
                    actual.text = texto
                    actual.answered_at = ahora
                    actualizar.append(actual)

            if crear:
                Answer.objects.bulk_create(crear, batch_size=200)
            if actualizar:
                Answer.objects.bulk_update(
                    actualizar, ['value', 'text', 'answered_at', 'updated_at'], batch_size=200
                )

            hay_contenido = bool(crear or actualizar or acuerdos or existentes)
            asignacion.agreements = acuerdos
            if hay_contenido and asignacion.started_at is None:
                asignacion.started_at = ahora
            if completar:
                asignacion.status = AssignmentStatus.COMPLETED
                asignacion.completed_at = ahora
            elif hay_contenido and asignacion.status == AssignmentStatus.PENDING:
                asignacion.status = AssignmentStatus.IN_PROGRESS
            asignacion.save()

        if completar:
            mensaje = 'Evaluación enviada. Gracias por completarla.'
        elif enviar:
            partes = []
            if faltantes:
                partes.append(f'{len(faltantes)} pregunta(s) sin responder')
            if faltan_acuerdos:
                partes.append('las observaciones y acuerdos')
            mensaje = (
                'Guardamos todo lo que llevas, pero aún falta '
                + ' y '.join(partes)
                + '. Complétalo y vuelve a enviar.'
            )
        else:
            mensaje = 'Borrador guardado. Puedes continuar más tarde.'

        return Response(
            {
                'status': asignacion.status,
                'completed': completar,
                'missing_questions': faltantes,
                'missing_agreements': faltan_acuerdos,
                'answered': scoring.answered_count(asignacion),
                'total': len(preguntas),
                'message': mensaje,
            }
        )


# ───────────────────────────────────────────────────────────────────────────
# Resultados
# ───────────────────────────────────────────────────────────────────────────

def visible_results(user):
    """Resultados que una persona puede ver, según su rol en el módulo."""
    qs = Result.objects.select_related(
        'cycle', 'evaluatee', 'evaluatee__area', 'evaluatee__manager'
    )
    if can_view_all(user) or can_view_dashboard(user):
        return qs
    if is_leader(user):
        return qs.filter(Q(evaluatee=user) | Q(evaluatee__manager=user))
    return qs.filter(evaluatee=user)


def _require_published(user):
    """«Mis resultados» y los planes nacen bloqueados para el equipo."""
    if not can_view_results(user):
        raise PermissionDenied(
            'Los resultados aún no están publicados. El área de People los habilitará '
            'cuando termine la ronda de evaluaciones.'
        )


class ResultViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ResultSerializer
    permission_classes = [HasValuationApp]
    filterset_fields = ('cycle', 'evaluatee', 'evaluation_type', 'level')
    pagination_class = None

    def get_queryset(self):
        return visible_results(self.request.user).order_by('-cycle__start_date', '-percentage')

    def retrieve(self, request, *args, **kwargs):
        """Detalle: KPIs, competencias, ítem por ítem y quién calificó qué."""
        resultado = self.get_object()
        usuario = request.user
        if resultado.evaluatee_id == usuario.pk:
            _require_published(usuario)

        asignaciones = list(
            Assignment.objects.filter(
                cycle=resultado.cycle,
                evaluatee=resultado.evaluatee,
                status=AssignmentStatus.COMPLETED,
                is_active=True,
            ).select_related('evaluator')
        )

        rol = request.query_params.get('evaluator_role') or ''
        if rol in EvaluatorRole.values:
            filtradas = [a for a in asignaciones if a.evaluator_role == rol]
        else:
            rol, filtradas = '', asignaciones

        items, competencias = scoring.item_detail(
            resultado.cycle, resultado.evaluatee, filtradas
        )
        buscar = (request.query_params.get('search') or '').strip().lower()
        if buscar:
            items = [
                i
                for i in items
                if buscar in i['statement'].lower() or buscar in i['competency_label'].lower()
            ]

        # Con ciclo anónimo solo quien ve toda la compañía sabe quién calificó.
        mostrar_evaluador = not resultado.cycle.is_anonymous or can_view_all(usuario)

        def nombre(asignacion):
            return asignacion.evaluator.full_name if mostrar_evaluador else 'Anónimo'

        def calificacion(asignacion):
            puntaje = scoring.assignment_score(asignacion)
            return {
                'evaluator': nombre(asignacion),
                'role': asignacion.evaluator_role,
                'role_label': asignacion.get_evaluator_role_display(),
                'percentage': round(puntaje, 1),
                'score': round(puntaje / 100.0 * 5.0, 2),
                'completed_at': asignacion.completed_at,
            }

        calificaciones = sorted(
            (calificacion(a) for a in asignaciones),
            key=lambda c: c['percentage'],
            reverse=True,
        )

        por_id = {a.id: a for a in asignaciones}
        abiertas = [
            {
                'statement': r.question.statement,
                'text': r.text,
                'evaluator': nombre(por_id[r.assignment_id]),
                'role_label': por_id[r.assignment_id].get_evaluator_role_display(),
            }
            for r in Answer.objects.filter(assignment__in=asignaciones)
            .exclude(text='')
            .select_related('question')
            if r.assignment_id in por_id
        ]

        acuerdos = [
            {
                'evaluator': nombre(a),
                'role_label': a.get_evaluator_role_display(),
                'text': a.agreements,
            }
            for a in asignaciones
            if a.agreements
        ]

        ordenados = sorted(items, key=lambda i: i['average'], reverse=True)
        return Response(
            {
                'result': ResultSerializer(resultado).data,
                'items': items,
                'competencies': competencias,
                'best_items': ordenados[:5],
                'worst_items': list(reversed(ordenados[-5:])) if ordenados else [],
                'ratings': calificaciones,
                'open_answers': abiertas,
                'agreements': acuerdos,
                'evaluators_count': len(asignaciones),
                'filtered_count': len(filtradas),
                'evaluator_role': rol,
                'show_evaluator': mostrar_evaluador,
                'can_manage_plans': can_manage_plans(usuario),
            }
        )

    @action(detail=False, methods=['get'], url_path='mis-resultados')
    def mis_resultados(self, request):
        """Mi propio consolidado más el detalle por ciclo."""
        _require_published(request.user)
        resultados = list(
            Result.objects.filter(evaluatee=request.user)
            .select_related('cycle', 'evaluatee', 'evaluatee__area', 'evaluatee__manager')
            .order_by('-cycle__start_date')
        )
        consolidado = scoring.consolidate_people(resultados)
        return Response(
            {
                'results': ResultSerializer(resultados, many=True).data,
                'consolidated': consolidado[0] if consolidado else None,
            }
        )

    @action(detail=False, methods=['get'])
    def equipo(self, request):
        """Resultados del equipo. El líder ve su gente; People y CEO, todo."""
        usuario = request.user
        if not (is_leader(usuario) or can_view_all(usuario) or can_view_dashboard(usuario)):
            raise PermissionDenied('Esta pantalla es para quienes tienen personas a cargo.')

        ve_todo = can_view_all(usuario) or can_view_dashboard(usuario)
        if ve_todo:
            base = Result.objects.all()
        else:
            base = Result.objects.filter(evaluatee__manager=usuario)

        from .views_reports import filtered_results

        resultados, consolidado, filtros = filtered_results(request, base)
        promedio = (
            round(sum(c['percentage'] for c in consolidado) / len(consolidado), 1)
            if consolidado
            else 0.0
        )
        return Response(
            {
                'results': ResultSerializer(resultados, many=True).data,
                'consolidated': consolidado,
                'filters': filtros,
                'average': promedio,
                'scope': 'company' if ve_todo else 'team',
            }
        )


# ───────────────────────────────────────────────────────────────────────────
# Planes de acción
# ───────────────────────────────────────────────────────────────────────────

class ActionPlanViewSet(ValuationViewSet):
    serializer_class = ActionPlanSerializer
    filterset_fields = ('status', 'owner', 'result')
    pagination_class = None

    def get_permissions(self):
        regla = None if self.request.method in ('GET', 'HEAD') else CanManagePlans
        return [HasValuationApp()] + ([regla()] if regla else [])

    def get_queryset(self):
        usuario = self.request.user
        qs = ActionPlan.objects.select_related(
            'result', 'result__cycle', 'result__evaluatee', 'owner', 'created_by'
        ).order_by('status', 'due_date')
        if can_view_all(usuario) or can_view_dashboard(usuario):
            return qs
        # Cada quien ve los planes propios, los de su gente y los que le tocan.
        return qs.filter(
            Q(owner=usuario)
            | Q(result__evaluatee=usuario)
            | Q(result__evaluatee__manager=usuario)
        ).distinct()

    def list(self, request, *args, **kwargs):
        _require_published(request.user)
        return super().list(request, *args, **kwargs)

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'], url_path='marcar')
    def marcar(self, request, pk=None):
        """Cambia el estado del plan (pendiente → en proceso → cumplido)."""
        plan = self.get_object()
        nuevo = request.data.get('status')
        if nuevo not in ActionPlanStatus.values:
            raise ValidationError({'status': ['Estado no válido.']})
        plan.status = nuevo
        plan.save(update_fields=['status', 'updated_at'])
        return Response(self.get_serializer(plan).data)


# ───────────────────────────────────────────────────────────────────────────
# Jerarquía
# ───────────────────────────────────────────────────────────────────────────

class HierarchyViewSet(viewsets.ModelViewSet):
    """Cargo y jefe directo. Es la base de «quién evalúa a quién»."""

    serializer_class = HierarchySerializer
    permission_classes = [HasValuationApp, CanManageHierarchy]
    http_method_names = ['get', 'patch', 'head', 'options']
    pagination_class = None
    filterset_fields = ('area', 'kind', 'is_active')
    search_fields = ('first_name', 'last_name', 'email', 'position')

    def get_queryset(self):
        return (
            User.objects.filter(is_active=True)
            .select_related('area', 'manager')
            .prefetch_related('team')
            .order_by('first_name', 'last_name')
        )


# ───────────────────────────────────────────────────────────────────────────
# Configuración del módulo y resumen del home
# ───────────────────────────────────────────────────────────────────────────

class SettingsView(APIView):
    """Interruptor global de publicación de resultados."""

    permission_classes = [HasValuationApp]

    def get(self, request):
        config = ValuationSettings.load()
        return Response(
            {
                **ValuationSettingsSerializer(config).data,
                'progress': scoring.progress_snapshot(),
                'can_publish': can_publish_results(request.user),
            }
        )

    def patch(self, request):
        if not can_publish_results(request.user):
            raise PermissionDenied(
                'Solo People, Data o Tech pueden habilitar o bloquear los resultados.'
            )
        publicar = bool(request.data.get('results_published'))
        config = ValuationSettings.load()
        config.results_published = publicar
        config.published_at = timezone.now() if publicar else None
        config.updated_by = request.user
        config.save()
        return Response(
            {
                **ValuationSettingsSerializer(config).data,
                'progress': scoring.progress_snapshot(),
                'can_publish': True,
                'message': (
                    'Resultados habilitados para todo el equipo.'
                    if publicar
                    else 'Resultados bloqueados. El equipo ya no los ve.'
                ),
            }
        )


@api_view(['GET'])
@permission_classes([HasValuationApp])
def summary(request):
    """Home del módulo: qué puede hacer esta persona y cómo va todo."""
    usuario = request.user
    config = ValuationSettings.load()
    mis_asignaciones = Assignment.objects.filter(evaluator=usuario, is_active=True)
    abiertas = mis_asignaciones.filter(
        Cycle.open_filter('cycle__')
    ).exclude(status=AssignmentStatus.COMPLETED)

    datos = {
        'capabilities': capabilities(usuario),
        'my_pending': abiertas.count(),
        'my_total': mis_asignaciones.count(),
        'my_results': Result.objects.filter(evaluatee=usuario).count(),
        'team_size': usuario.team.filter(is_active=True).count(),
        'settings': ValuationSettingsSerializer(config).data,
        'progress': scoring.progress_snapshot(),
        'active_cycles': CycleSerializer(
            Cycle.objects.filter(Cycle.open_filter()).order_by('end_date'), many=True
        ).data,
    }

    if can_manage_cycles(usuario) or can_view_dashboard(usuario):
        datos['catalog'] = {
            'competencies': Competency.objects.filter(is_active=True).count(),
            'questions': Question.objects.filter(is_active=True).count(),
            'cycles': Cycle.objects.count(),
            'people_evaluated': Result.objects.values('evaluatee').distinct().count(),
        }
    return Response(datos)


@api_view(['GET'])
@permission_classes([HasValuationApp])
def options(request):
    """Catálogos para formularios y filtros del módulo."""
    cargos = list(
        User.objects.exclude(position='')
        .values_list('position', flat=True)
        .distinct()
        .order_by('position')
    )
    jefes = User.objects.filter(team__isnull=False).distinct().order_by('first_name', 'last_name')
    from apps.accounts.models import Area

    from .models import Level

    return Response(
        {
            **CHOICES,
            'levels': [{'value': v, 'label': etiqueta} for v, etiqueta in Level.choices],
            'areas': [
                {'value': a.id, 'label': a.name}
                for a in Area.objects.filter(is_active=True).order_by('name')
            ],
            'positions': cargos,
            'teams': [{'value': j.id, 'label': j.full_name} for j in jefes],
            'people': PersonSerializer(
                User.objects.filter(is_active=True)
                .select_related('area', 'manager')
                .order_by('first_name', 'last_name'),
                many=True,
            ).data,
            'cycles': [
                {'value': c.id, 'label': c.name}
                for c in Cycle.objects.order_by('-start_date')
            ],
        }
    )
