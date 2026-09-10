"""Admin de Django para la valoración: útil para soporte y correcciones puntuales."""
from django.contrib import admin

from .models import (
    ActionPlan,
    Answer,
    Assignment,
    Competency,
    Cycle,
    Question,
    Result,
    ValuationSettings,
)


@admin.register(Competency)
class CompetencyAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'order', 'is_active')
    list_filter = ('is_active',)
    search_fields = ('code', 'name')


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = (
        'statement', 'competency', 'evaluation_type', 'question_type', 'weight', 'is_active'
    )
    list_filter = ('evaluation_type', 'question_type', 'is_active', 'competency')
    search_fields = ('statement',)
    autocomplete_fields = ('competency',)


@admin.register(Cycle)
class CycleAdmin(admin.ModelAdmin):
    list_display = ('name', 'evaluation_type', 'status', 'start_date', 'end_date')
    list_filter = ('status', 'evaluation_type')
    search_fields = ('name',)


@admin.register(Assignment)
class AssignmentAdmin(admin.ModelAdmin):
    list_display = ('cycle', 'evaluator', 'evaluatee', 'evaluator_role', 'status', 'is_active')
    list_filter = ('cycle', 'status', 'evaluator_role', 'evaluation_type', 'is_active')
    search_fields = ('evaluator__first_name', 'evaluatee__first_name', 'evaluatee__email')
    autocomplete_fields = ('evaluator', 'evaluatee')


@admin.register(Answer)
class AnswerAdmin(admin.ModelAdmin):
    list_display = ('assignment', 'question', 'value', 'answered_at')
    list_filter = ('value',)


@admin.register(Result)
class ResultAdmin(admin.ModelAdmin):
    list_display = ('evaluatee', 'cycle', 'percentage', 'level', 'evaluators_total', 'computed_at')
    list_filter = ('cycle', 'level', 'evaluation_type')
    search_fields = ('evaluatee__first_name', 'evaluatee__last_name', 'evaluatee__email')


@admin.register(ActionPlan)
class ActionPlanAdmin(admin.ModelAdmin):
    list_display = ('description', 'owner', 'due_date', 'status')
    list_filter = ('status',)


@admin.register(ValuationSettings)
class ValuationSettingsAdmin(admin.ModelAdmin):
    list_display = ('__str__', 'published_at', 'updated_by')

    def has_add_permission(self, request) -> bool:
        # Fila única: se crea sola con `ValuationSettings.load()`.
        return not ValuationSettings.objects.exists()
