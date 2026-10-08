from django.contrib import admin

from .models import Sincronizacion


@admin.register(Sincronizacion)
class SincronizacionAdmin(admin.ModelAdmin):
    list_display = ('iniciada_at', 'ejecutada_por', 'simulacion', 'crear', 'actualizar', 'desactivar', 'estado')
    list_filter = ('estado', 'simulacion')
    readonly_fields = [f.name for f in Sincronizacion._meta.fields]
