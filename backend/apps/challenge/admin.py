from django.contrib import admin

from .models import CriterioReto, Participacion, Reto, Valoracion


class CriterioInline(admin.TabularInline):
    model = CriterioReto
    extra = 0


@admin.register(Reto)
class RetoAdmin(admin.ModelAdmin):
    list_display = ('titulo', 'categoria', 'estado', 'cierra_el', 'creado_por')
    list_filter = ('estado', 'categoria')
    search_fields = ('titulo',)
    inlines = [CriterioInline]


@admin.register(Participacion)
class ParticipacionAdmin(admin.ModelAdmin):
    list_display = ('reto', 'participante', 'estado', 'puntaje_final', 'es_ganador')
    list_filter = ('estado', 'es_ganador')


@admin.register(Valoracion)
class ValoracionAdmin(admin.ModelAdmin):
    list_display = ('participacion', 'evaluador', 'es_jurado', 'puntaje', 'no_cumple')
