from django.contrib import admin

from .models import (
    IncidenciaCalidad,
    Parametros,
    PlanPlanner,
    ResultadoSemana,
    Sincronizacion,
    Snapshot,
    ValidacionHito,
)


@admin.register(PlanPlanner)
class PlanPlannerAdmin(admin.ModelAdmin):
    list_display = ('titulo', 'grupo_nombre', 'colaborador', 'activo', 'accesible', 'ultima_lectura_at')
    list_filter = ('activo', 'accesible', 'grupo_nombre')
    search_fields = ('titulo', 'plan_id', 'colaborador__first_name', 'colaborador__last_name')
    raw_id_fields = ('colaborador',)


@admin.register(Sincronizacion)
class SincronizacionAdmin(admin.ModelAdmin):
    list_display = ('iniciada_at', 'tipo', 'semana', 'estado', 'planes_leidos', 'ejecutada_por')
    list_filter = ('tipo', 'estado')


@admin.register(Snapshot)
class SnapshotAdmin(admin.ModelAdmin):
    list_display = ('plan', 'anio', 'semana', 'tipo', 'tomado_at')
    list_filter = ('tipo', 'anio', 'semana')


@admin.register(ResultadoSemana)
class ResultadoSemanaAdmin(admin.ModelAdmin):
    list_display = ('colaborador', 'anio', 'semana', 'pct_weekly', 'pct_daily', 'hito', 'indice', 'final')
    list_filter = ('anio', 'semana', 'final')


@admin.register(ValidacionHito)
class ValidacionHitoAdmin(admin.ModelAdmin):
    list_display = ('colaborador', 'anio', 'semana', 'estado', 'validado_por', 'validado_at')
    list_filter = ('estado', 'anio', 'semana')


@admin.register(IncidenciaCalidad)
class IncidenciaCalidadAdmin(admin.ModelAdmin):
    list_display = ('tipo', 'severidad', 'plan', 'colaborador', 'semana', 'abierta')
    list_filter = ('abierta', 'severidad', 'tipo')


admin.site.register(Parametros)
