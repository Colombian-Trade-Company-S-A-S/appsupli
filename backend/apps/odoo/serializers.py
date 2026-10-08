from rest_framework import serializers

from .models import Sincronizacion


class SincronizacionSerializer(serializers.ModelSerializer):
    ejecutada_por_nombre = serializers.CharField(source='ejecutada_por.full_name', default='', read_only=True)

    class Meta:
        model = Sincronizacion
        fields = (
            'id', 'iniciada_at', 'terminada_at', 'ejecutada_por_nombre', 'crear', 'actualizar',
            'desactivar', 'eliminar', 'simulacion', 'estado', 'resumen', 'excepciones', 'error',
        )


class OpcionesSincronizacionSerializer(serializers.Serializer):
    crear = serializers.BooleanField(default=False)
    actualizar = serializers.BooleanField(default=False)
    desactivar = serializers.BooleanField(default=False)
    eliminar = serializers.BooleanField(default=False)
    simular = serializers.BooleanField(default=False)

    def validate(self, datos):
        if not (datos['crear'] or datos['actualizar'] or datos['desactivar'] or datos['eliminar']):
            raise serializers.ValidationError('Elige al menos una opción.')
        return datos
