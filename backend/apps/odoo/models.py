"""Bitácora de sincronizaciones con Odoo: quién la corrió, con qué opciones y qué cambió."""
from django.conf import settings
from django.db import models


class Sincronizacion(models.Model):
    class Estado(models.TextChoices):
        OK = 'ok', 'Correcta'
        ERROR = 'error', 'Con error'

    iniciada_at = models.DateTimeField('iniciada el', auto_now_add=True)
    terminada_at = models.DateTimeField('terminada el', null=True, blank=True)
    ejecutada_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sincronizaciones_odoo',
        verbose_name='ejecutada por',
        help_text='Vacío cuando la corre el comando programado.',
    )
    crear = models.BooleanField('crear nuevos', default=False)
    actualizar = models.BooleanField('actualizar información', default=False)
    desactivar = models.BooleanField('desactivar bajas', default=False)
    eliminar = models.BooleanField('eliminar a quien no está en Odoo', default=False)
    simulacion = models.BooleanField(
        'vista previa', default=False, help_text='Se calculó lo que cambiaría, sin guardar nada.'
    )
    estado = models.CharField('estado', max_length=10, choices=Estado.choices, default=Estado.OK)
    resumen = models.JSONField('resumen', default=dict, blank=True)
    excepciones = models.JSONField('excepciones', default=list, blank=True)
    error = models.TextField('error', blank=True)

    class Meta:
        verbose_name = 'sincronización con Odoo'
        verbose_name_plural = 'sincronizaciones con Odoo'
        ordering = ('-iniciada_at',)

    def __str__(self) -> str:
        tipo = 'Vista previa' if self.simulacion else 'Sincronización'
        return f'{tipo} del {self.iniciada_at:%Y-%m-%d %H:%M} ({self.get_estado_display()})'
