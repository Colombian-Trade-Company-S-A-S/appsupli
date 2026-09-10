from django.db import models


class TimeStampedModel(models.Model):
    """Base con auditoría de fechas para todos los modelos del negocio."""

    created_at = models.DateTimeField('creado el', auto_now_add=True)
    updated_at = models.DateTimeField('actualizado el', auto_now=True)

    class Meta:
        abstract = True
