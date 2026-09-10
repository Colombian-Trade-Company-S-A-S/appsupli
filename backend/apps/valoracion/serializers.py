"""Serializers del módulo de valoración."""
from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import (
    ActionPlan,
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

User = get_user_model()


class PersonSerializer(serializers.ModelSerializer):
    """Persona vista desde el módulo: lo justo para tablas y selectores."""

    full_name = serializers.CharField(read_only=True)
    area_name = serializers.CharField(source='area.name', read_only=True, default='')
    manager_name = serializers.CharField(source='manager.full_name', read_only=True, default='')

    class Meta:
        model = User
        fields = (
            'id',
            'full_name',
            'email',
            'position',
            'kind',
            'area',
            'area_name',
            'manager',
            'manager_name',
            'is_active',
        )


class CompetencySerializer(serializers.ModelSerializer):
    label = serializers.CharField(read_only=True)
    question_count = serializers.IntegerField(source='questions.count', read_only=True)

    class Meta:
        model = Competency
        fields = (
            'id',
            'code',
            'name',
            'label',
            'description',
            'order',
            'is_active',
            'question_count',
        )


class QuestionSerializer(serializers.ModelSerializer):
    competency_label = serializers.CharField(source='competency.label', read_only=True)
    competency_code = serializers.CharField(source='competency.code', read_only=True)
    evaluation_type_label = serializers.CharField(
        source='get_evaluation_type_display', read_only=True
    )
    question_type_label = serializers.CharField(source='get_question_type_display', read_only=True)

    class Meta:
        model = Question
        fields = (
            'id',
            'competency',
            'competency_code',
            'competency_label',
            'statement',
            'evaluation_type',
            'evaluation_type_label',
            'question_type',
            'question_type_label',
            'weight',
            'order',
            'is_required',
            'is_active',
        )


class CycleSerializer(serializers.ModelSerializer):
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    effective_status = serializers.CharField(read_only=True)
    effective_status_label = serializers.CharField(
        source='effective_status_display', read_only=True
    )
    evaluation_type_label = serializers.CharField(
        source='get_evaluation_type_display', read_only=True
    )
    created_by_name = serializers.CharField(
        source='created_by.full_name', read_only=True, default=''
    )
    is_open = serializers.SerializerMethodField()
    progress = serializers.SerializerMethodField()

    class Meta:
        model = Cycle
        fields = (
            'id',
            'name',
            'description',
            'evaluation_type',
            'evaluation_type_label',
            'start_date',
            'end_date',
            'status',
            'status_label',
            'effective_status',
            'effective_status_label',
            'is_anonymous',
            'comments_required',
            'manager_weight',
            'team_weight',
            'excluded_questions',
            'created_by_name',
            'is_open',
            'progress',
        )

    def get_is_open(self, cycle: Cycle) -> bool:
        return cycle.is_open()

    def get_progress(self, cycle: Cycle) -> dict:
        """Avance del ciclo. Se sirve del `annotate` de la vista cuando existe."""
        total = getattr(cycle, 'assignments_total', None)
        completed = getattr(cycle, 'assignments_completed', None)
        if total is None:
            activas = cycle.assignments.filter(is_active=True)
            total = activas.count()
            completed = activas.filter(status=AssignmentStatus.COMPLETED).count()
        return {
            'total': total,
            'completed': completed,
            'pending': total - completed,
            'percentage': round(completed * 100.0 / total, 1) if total else 0.0,
        }

    def validate(self, attrs):
        inicio = attrs.get('start_date', getattr(self.instance, 'start_date', None))
        cierre = attrs.get('end_date', getattr(self.instance, 'end_date', None))
        if inicio and cierre and cierre <= inicio:
            raise serializers.ValidationError(
                {'end_date': ['La fecha de cierre debe ser posterior a la de inicio.']}
            )
        jefe = attrs.get('manager_weight', getattr(self.instance, 'manager_weight', 60))
        equipo = attrs.get('team_weight', getattr(self.instance, 'team_weight', 40))
        if jefe + equipo != 100:
            raise serializers.ValidationError(
                {'manager_weight': ['Los pesos de jefe y equipo deben sumar 100.']}
            )
        return attrs


class AssignmentSerializer(serializers.ModelSerializer):
    evaluator_name = serializers.CharField(source='evaluator.full_name', read_only=True)
    evaluatee_name = serializers.CharField(source='evaluatee.full_name', read_only=True)
    evaluatee_position = serializers.CharField(source='evaluatee.position', read_only=True)
    evaluator_role_label = serializers.CharField(
        source='get_evaluator_role_display', read_only=True
    )
    evaluation_type_label = serializers.CharField(
        source='get_evaluation_type_display', read_only=True
    )
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    cycle_name = serializers.CharField(source='cycle.name', read_only=True)

    class Meta:
        model = Assignment
        fields = (
            'id',
            'cycle',
            'cycle_name',
            'evaluator',
            'evaluator_name',
            'evaluatee',
            'evaluatee_name',
            'evaluatee_position',
            'evaluator_role',
            'evaluator_role_label',
            'evaluation_type',
            'evaluation_type_label',
            'status',
            'status_label',
            'is_active',
            'agreements',
            'started_at',
            'completed_at',
        )
        read_only_fields = ('status', 'agreements', 'started_at', 'completed_at')

    def validate(self, attrs):
        evaluador = attrs.get('evaluator', getattr(self.instance, 'evaluator', None))
        evaluado = attrs.get('evaluatee', getattr(self.instance, 'evaluatee', None))
        rol = attrs.get('evaluator_role', getattr(self.instance, 'evaluator_role', None))

        if evaluador and evaluado and evaluador == evaluado and rol != EvaluatorRole.SELF:
            raise serializers.ValidationError(
                {'evaluatee': ['Nadie se evalúa a sí mismo salvo con el rol Autoevaluación.']}
            )
        if rol == EvaluatorRole.SELF and evaluador != evaluado:
            raise serializers.ValidationError(
                {
                    'evaluator_role': [
                        'En una autoevaluación el evaluador y el evaluado son la misma persona.'
                    ]
                }
            )

        ciclo = attrs.get('cycle', getattr(self.instance, 'cycle', None))
        tipo = attrs.get('evaluation_type', getattr(self.instance, 'evaluation_type', None))
        if ciclo and tipo and ciclo.evaluation_type != 'mixta' and ciclo.evaluation_type != tipo:
            raise serializers.ValidationError(
                {
                    'evaluation_type': [
                        f'El ciclo «{ciclo.name}» solo admite evaluaciones de tipo '
                        f'{ciclo.get_evaluation_type_display()}.'
                    ]
                }
            )
        return attrs


class MyAssignmentSerializer(serializers.ModelSerializer):
    """Una tarjeta de «Mis evaluaciones»: a quién califico y cómo voy."""

    cycle_name = serializers.CharField(source='cycle.name', read_only=True)
    cycle_end_date = serializers.DateTimeField(source='cycle.end_date', read_only=True)
    evaluatee_name = serializers.CharField(source='evaluatee.full_name', read_only=True)
    evaluatee_position = serializers.CharField(source='evaluatee.position', read_only=True)
    evaluatee_area = serializers.CharField(
        source='evaluatee.area.name', read_only=True, default=''
    )
    evaluator_role_label = serializers.CharField(
        source='get_evaluator_role_display', read_only=True
    )
    evaluation_type_label = serializers.CharField(
        source='get_evaluation_type_display', read_only=True
    )
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    questions_total = serializers.IntegerField(read_only=True)
    questions_answered = serializers.IntegerField(read_only=True)
    can_answer = serializers.BooleanField(read_only=True)
    blocked_reason = serializers.CharField(read_only=True, allow_null=True)

    class Meta:
        model = Assignment
        fields = (
            'id',
            'cycle',
            'cycle_name',
            'cycle_end_date',
            'evaluatee_name',
            'evaluatee_position',
            'evaluatee_area',
            'evaluator_role',
            'evaluator_role_label',
            'evaluation_type',
            'evaluation_type_label',
            'status',
            'status_label',
            'completed_at',
            'questions_total',
            'questions_answered',
            'can_answer',
            'blocked_reason',
        )


class AnswerInputSerializer(serializers.Serializer):
    """Una respuesta tal como llega del formulario."""

    question = serializers.IntegerField()
    value = serializers.IntegerField(required=False, allow_null=True, min_value=1, max_value=5)
    text = serializers.CharField(required=False, allow_blank=True, default='')


class SubmitSerializer(serializers.Serializer):
    """Guardar borrador o enviar una evaluación."""

    action = serializers.ChoiceField(choices=('borrador', 'enviar'), default='borrador')
    agreements = serializers.CharField(required=False, allow_blank=True, default='')
    answers = AnswerInputSerializer(many=True)


class AnswerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Answer
        fields = ('question', 'value', 'text')


class ResultSerializer(serializers.ModelSerializer):
    cycle_name = serializers.CharField(source='cycle.name', read_only=True)
    evaluatee_name = serializers.CharField(source='evaluatee.full_name', read_only=True)
    evaluatee_position = serializers.CharField(source='evaluatee.position', read_only=True)
    evaluatee_area = serializers.CharField(
        source='evaluatee.area.name', read_only=True, default=''
    )
    level_label = serializers.CharField(source='get_level_display', read_only=True)
    evaluation_type_label = serializers.CharField(
        source='get_evaluation_type_display', read_only=True
    )

    class Meta:
        model = Result
        fields = (
            'id',
            'cycle',
            'cycle_name',
            'evaluatee',
            'evaluatee_name',
            'evaluatee_position',
            'evaluatee_area',
            'evaluation_type',
            'evaluation_type_label',
            'score',
            'percentage',
            'level',
            'level_label',
            'manager_score',
            'team_score',
            'self_score',
            'evaluators_total',
            'evaluators_manager',
            'evaluators_team',
            'evaluators_self',
            'competency_detail',
            'strengths',
            'gaps',
            'computed_at',
        )


class ActionPlanSerializer(serializers.ModelSerializer):
    owner_name = serializers.CharField(source='owner.full_name', read_only=True)
    created_by_name = serializers.CharField(
        source='created_by.full_name', read_only=True, default=''
    )
    evaluatee_name = serializers.CharField(source='result.evaluatee.full_name', read_only=True)
    cycle_name = serializers.CharField(source='result.cycle.name', read_only=True)
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)

    class Meta:
        model = ActionPlan
        fields = (
            'id',
            'result',
            'evaluatee_name',
            'cycle_name',
            'description',
            'owner',
            'owner_name',
            'due_date',
            'status',
            'status_label',
            'evidence_url',
            'notes',
            'created_by_name',
            'is_overdue',
            'created_at',
        )


class ValuationSettingsSerializer(serializers.ModelSerializer):
    updated_by_name = serializers.CharField(
        source='updated_by.full_name', read_only=True, default=''
    )

    class Meta:
        model = ValuationSettings
        fields = ('results_published', 'published_at', 'updated_by_name', 'updated_at')
        read_only_fields = ('published_at', 'updated_at')


class HierarchySerializer(serializers.ModelSerializer):
    """Fila de la pantalla de jerarquía: cargo y jefe directo."""

    full_name = serializers.CharField(read_only=True)
    area_name = serializers.CharField(source='area.name', read_only=True, default='')
    manager_name = serializers.CharField(source='manager.full_name', read_only=True, default='')
    team_count = serializers.IntegerField(source='team.count', read_only=True)

    class Meta:
        model = User
        fields = (
            'id',
            'full_name',
            'email',
            'area_name',
            'position',
            'kind',
            'manager',
            'manager_name',
            'team_count',
        )
        read_only_fields = ('email',)

    def validate_manager(self, manager):
        """Nadie es su propio jefe, ni cierra un ciclo en el organigrama."""
        if manager is None:
            return manager
        persona = self.instance
        if persona and manager.pk == persona.pk:
            raise serializers.ValidationError('Una persona no puede ser su propio jefe.')
        visto = set()
        actual = manager
        while actual is not None:
            if persona and actual.pk == persona.pk:
                raise serializers.ValidationError(
                    'Ese cambio crearía un ciclo en la jerarquía: la persona ya es '
                    'jefe de quien intentas asignarle.'
                )
            if actual.pk in visto:
                break
            visto.add(actual.pk)
            actual = actual.manager
        return manager


# Opciones fijas que el frontend necesita para pintar formularios y filtros.
CHOICES = {
    'evaluation_types': [{'value': v, 'label': etiqueta} for v, etiqueta in EvaluationType.choices],
    'cycle_types': [{'value': v, 'label': etiqueta} for v, etiqueta in Cycle.TYPE_CHOICES],
    'question_types': [{'value': v, 'label': etiqueta} for v, etiqueta in QuestionType.choices],
    'evaluator_roles': [{'value': v, 'label': etiqueta} for v, etiqueta in EvaluatorRole.choices],
    'assignment_status': [
        {'value': v, 'label': etiqueta} for v, etiqueta in AssignmentStatus.choices
    ],
}
