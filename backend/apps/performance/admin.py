from django.contrib import admin

from .models import Evidencia, Objetivo, Periodo, Resultado


@admin.register(Periodo)
class PeriodoAdmin(admin.ModelAdmin):
    list_display = ('periodo', 'estado', 'abierto_por', 'fecha_apertura')
    list_filter = ('estado',)


@admin.register(Objetivo)
class ObjetivoAdmin(admin.ModelAdmin):
    list_display = ('colaborador', 'periodo', 'objetivo', 'peso', 'tipo_medicion', 'estado')
    list_filter = ('periodo', 'estado', 'tipo_medicion')
    search_fields = ('objetivo', 'kpi', 'colaborador__first_name', 'colaborador__last_name')
    autocomplete_fields = ('colaborador', 'registrado_por', 'responsable_resultado')


@admin.register(Resultado)
class ResultadoAdmin(admin.ModelAdmin):
    list_display = (
        'objetivo',
        'resultado_ejecutado',
        'porcentaje_cumplimiento',
        'estado_validacion',
    )
    list_filter = ('estado_validacion',)


@admin.register(Evidencia)
class EvidenciaAdmin(admin.ModelAdmin):
    list_display = ('resultado', 'tipo', 'nombre')
    list_filter = ('tipo',)
