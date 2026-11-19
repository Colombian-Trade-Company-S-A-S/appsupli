from django.contrib import admin

from .models import (
    HitoPlanner,
    IncidenciaCalidad,
    MovimientoTarea,
    Parametros,
    PlanPlanner,
    RecalculoPlanner,
    ResultadoSemana,
    Sincronizacion,
    Snapshot,
    TareaMedicion,
)


@admin.register(PlanPlanner)
class PlanPlannerAdmin(admin.ModelAdmin):
    list_display = (
        'titulo',
        'grupo_nombre',
        'colaborador',
        'activo',
        'accesible',
        'ultima_lectura_at',
    )
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
    list_display = (
        'colaborador',
        'anio',
        'semana',
        'pct_weekly',
        'pct_daily',
        'hito',
        'indice',
        'final',
    )
    list_filter = ('anio', 'semana', 'final')


@admin.register(HitoPlanner)
class HitoPlannerAdmin(admin.ModelAdmin):
    list_display = ('colaborador', 'anio', 'semana', 'titulo', 'total_items')
    list_filter = ('anio', 'semana')


class MovimientoInline(admin.TabularInline):
    model = MovimientoTarea
    extra = 0


@admin.register(TareaMedicion)
class TareaMedicionAdmin(admin.ModelAdmin):
    list_display = ('titulo', 'plan', 'anio', 'semana', 'en_linea_base', 'entro_at', 'completada')
    list_filter = ('anio', 'semana', 'en_linea_base')
    inlines = (MovimientoInline,)


@admin.register(IncidenciaCalidad)
class IncidenciaCalidadAdmin(admin.ModelAdmin):
    list_display = ('tipo', 'severidad', 'plan', 'colaborador', 'semana', 'abierta')
    list_filter = ('abierta', 'severidad', 'tipo')


@admin.register(Parametros)
class ParametrosAdmin(admin.ModelAdmin):
    list_display = (
        'pk',
        'peso_weekly',
        'peso_daily',
        'peso_hito',
        'vigente_desde',
        'vigente_hasta',
    )


@admin.register(RecalculoPlanner)
class RecalculoPlannerAdmin(admin.ModelAdmin):
    list_display = ('hecho_at', 'anio', 'semana', 'resultados', 'autorizado_por')
