"""
Serializadores de Objetivos y KPIs.

Acá viven las reglas que dependen de los datos —la meta obligatoria, el tope de
seis objetivos, la ponderación que no puede pasar de 100—; los permisos viven
en las vistas. El JSON sale en camelCase, como el resto de la API.
"""
from decimal import Decimal

from django.db.models import Sum
from rest_framework import serializers

from apps.accounts.models import User

from .cumplimiento import FormulaInvalida, evaluar_formula
from .models import (
    MAXIMO_OBJETIVOS,
    PONDERACION_COMPLETA,
    EstadoObjetivo,
    EstadoPeriodo,
    Objetivo,
    Periodo,
    TipoMedicion,
)


def primer_dia(fecha):
    """El periodo siempre es el primer día del mes: así lo guarda y lo compara."""
    return fecha.replace(day=1)


class PersonaSerializer(serializers.ModelSerializer):
    """La ficha mínima de alguien, para los desplegables y las tablas."""

    nombre = serializers.CharField(source='full_name', read_only=True)
    cargo = serializers.CharField(source='position', read_only=True)
    area = serializers.CharField(source='area.name', default='', read_only=True)
    jefe = serializers.CharField(source='manager.full_name', default='', read_only=True)

    class Meta:
        model = User
        fields = (
            'id',
            'nombre',
            'cargo',
            'area',
            'jefe',
            'direccion',
            'organizacion',
            'regional',
            'punto_venta',
        )


class ObjetivoSerializer(serializers.ModelSerializer):
    colaborador_nombre = serializers.CharField(source='colaborador.full_name', read_only=True)
    colaborador_cargo = serializers.CharField(source='colaborador.position', read_only=True)
    registrado_por_nombre = serializers.CharField(
        source='registrado_por.full_name', read_only=True
    )
    responsable_nombre = serializers.CharField(
        source='responsable_resultado.full_name', default='', read_only=True
    )
    tipo_medicion_label = serializers.CharField(
        source='get_tipo_medicion_display', read_only=True
    )
    unidad_label = serializers.CharField(source='get_unidad_display', read_only=True)
    editable = serializers.SerializerMethodField()

    class Meta:
        model = Objetivo
        fields = (
            'id',
            'colaborador',
            'colaborador_nombre',
            'colaborador_cargo',
            'registrado_por',
            'registrado_por_nombre',
            'periodo',
            'objetivo',
            'kpi',
            'peso',
            'tipo_medicion',
            'tipo_medicion_label',
            'unidad',
            'unidad_label',
            'meta_valor',
            'umbral_cumplimiento',
            'permite_sobrecumplimiento',
            'tope_cumplimiento',
            'formula',
            'fuente_datos',
            'responsable_resultado',
            'responsable_nombre',
            'estado',
            'editable',
            'created_at',
        )
        read_only_fields = ('registrado_por', 'estado')

    def get_editable(self, obj) -> bool:
        """Un objetivo congelado ya no se toca: el mes está en medición."""
        return not obj.congelado

    def validate_periodo(self, valor):
        return primer_dia(valor)

    def validate_peso(self, valor):
        if valor <= 0:
            raise serializers.ValidationError('El peso debe ser mayor que cero.')
        if valor > PONDERACION_COMPLETA:
            raise serializers.ValidationError('El peso de un objetivo no puede pasar de 100%.')
        return valor

    def validate(self, datos):
        instancia = self.instance
        colaborador = datos.get('colaborador') or getattr(instancia, 'colaborador', None)
        periodo = datos.get('periodo') or getattr(instancia, 'periodo', None)
        tipo = datos.get('tipo_medicion') or getattr(instancia, 'tipo_medicion', None)
        meta = datos.get('meta_valor', getattr(instancia, 'meta_valor', None))
        formula = datos.get('formula', getattr(instancia, 'formula', '') or '')

        # El mes en medición ya congeló sus objetivos (regla 5).
        if periodo:
            estado = (
                Periodo.objects.filter(periodo=periodo).values_list('estado', flat=True).first()
            )
            if estado and estado != EstadoPeriodo.DEFINICION:
                raise serializers.ValidationError(
                    'El periodo ya no está en definición: los objetivos quedaron congelados.'
                )

        # La meta es obligatoria salvo en binario, donde el resultado es sí/no.
        if tipo == TipoMedicion.BINARIO:
            datos['meta_valor'] = None
        elif tipo in (TipoMedicion.PROPORCIONAL, TipoMedicion.PROPORCIONAL_INVERSO):
            if meta is None:
                raise serializers.ValidationError(
                    {'metaValor': 'Este tipo de medición necesita una meta.'}
                )
            if meta <= 0:
                raise serializers.ValidationError(
                    {
                        'metaValor': 'La meta debe ser mayor que cero para poder '
                        'comparar contra ella.'
                    }
                )
        elif tipo == TipoMedicion.FORMULA:
            if not formula.strip():
                raise serializers.ValidationError({'formula': 'Escribe la fórmula de medición.'})
            try:
                # Se evalúa con datos de prueba: si no corre ahora, tampoco va a
                # correr en octubre, y es mejor enterarse al guardarla.
                evaluar_formula(formula, {'logrado': 1.0, 'meta': float(meta or 1)})
            except FormulaInvalida as exc:
                raise serializers.ValidationError({'formula': str(exc)}) from exc

        if tipo != TipoMedicion.FORMULA:
            datos['formula'] = ''

        # Tope de seis objetivos y ponderación que no se pasa de 100 (reglas 1 y 2).
        if colaborador and periodo:
            hermanos = Objetivo.objects.filter(colaborador=colaborador, periodo=periodo)
            if instancia:
                hermanos = hermanos.exclude(pk=instancia.pk)
            if not instancia and hermanos.count() >= MAXIMO_OBJETIVOS:
                raise serializers.ValidationError(
                    f'{colaborador.full_name} ya tiene {MAXIMO_OBJETIVOS} objetivos este mes, '
                    'que es el máximo.'
                )
            peso = datos.get('peso') or getattr(instancia, 'peso', Decimal('0'))
            acumulado = hermanos.aggregate(total=Sum('peso'))['total'] or Decimal('0')
            if acumulado + peso > PONDERACION_COMPLETA:
                disponible = PONDERACION_COMPLETA - acumulado
                raise serializers.ValidationError(
                    {
                        'peso': f'Solo queda {disponible:g}% por asignar en el mes '
                        f'de {colaborador.full_name}.'
                    }
                )
        return datos


class ResumenPonderacionSerializer(serializers.Serializer):
    """Lo que alimenta el banner del 100% del formulario."""

    colaborador = serializers.IntegerField()
    colaborador_nombre = serializers.CharField()
    objetivos = serializers.IntegerField()
    peso_asignado = serializers.DecimalField(max_digits=6, decimal_places=2)
    peso_disponible = serializers.DecimalField(max_digits=6, decimal_places=2)
    completo = serializers.BooleanField()


class PeriodoSerializer(serializers.ModelSerializer):
    estado_label = serializers.CharField(source='get_estado_display', read_only=True)
    abierto_por_nombre = serializers.CharField(
        source='abierto_por.full_name', default='', read_only=True
    )

    class Meta:
        model = Periodo
        fields = (
            'id',
            'periodo',
            'estado',
            'estado_label',
            'abierto_por',
            'abierto_por_nombre',
            'fecha_apertura',
            'fecha_cierre',
        )
        read_only_fields = fields


def estado_inicial_objetivo() -> str:
    """El estado con el que nace un objetivo mientras el mes está en definición."""
    return EstadoObjetivo.BORRADOR
