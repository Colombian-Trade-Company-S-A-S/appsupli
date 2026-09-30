"""
Serializadores de Objetivos y KPIs.

Acá viven las reglas que dependen de los datos —la meta obligatoria, el tope de
seis objetivos, la ponderación que no puede pasar de 100—; los permisos viven
en las vistas. El JSON sale en camelCase, como el resto de la API.
"""
from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone
from rest_framework import serializers

from apps.accounts.models import User

from .cumplimiento import FormulaInvalida, evaluar_formula, semaforo
from .models import (
    CRITERIOS_CUALITATIVOS,
    MAXIMO_OBJETIVOS,
    PONDERACION_COMPLETA,
    EstadoObjetivo,
    Evidencia,
    Objetivo,
    Periodo,
    Resultado,
    TipoMedicion,
)
from .periodos import primer_dia, puede_editarse


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


class EvidenciaSerializer(serializers.ModelSerializer):
    """El soporte del resultado: siempre un enlace (A5), nunca un archivo subido."""

    class Meta:
        model = Evidencia
        fields = ('id', 'nombre', 'link_soporte', 'created_at')
        read_only_fields = ('id', 'created_at')

    def validate_link_soporte(self, valor):
        if not valor.strip():
            raise serializers.ValidationError(
                'Pega el enlace del soporte en SharePoint o OneDrive.'
            )
        return valor.strip()


class ResultadoSerializer(serializers.ModelSerializer):
    """
    Lo ejecutado de un objetivo, con sus evidencias.

    El porcentaje no se recibe nunca: lo calcula el motor con el tipo de
    medición del objetivo, y el color sale de los cortes del semáforo.
    """

    evidencias = EvidenciaSerializer(many=True, required=False)
    cargado_por_nombre = serializers.CharField(
        source='cargado_por.full_name', default='', read_only=True
    )
    validado_por_nombre = serializers.CharField(
        source='validado_por.full_name', default='', read_only=True
    )
    estado_validacion_label = serializers.CharField(
        source='get_estado_validacion_display', read_only=True
    )
    semaforo = serializers.SerializerMethodField()

    class Meta:
        model = Resultado
        fields = (
            'id',
            'objetivo',
            'resultado_ejecutado',
            'porcentaje_cumplimiento',
            'semaforo',
            'cargado_por',
            'cargado_por_nombre',
            'fecha_carga',
            'estado_validacion',
            'estado_validacion_label',
            'validado_por',
            'validado_por_nombre',
            'fecha_validacion',
            'observacion',
            'evidencias',
        )
        read_only_fields = (
            'id',
            'objetivo',
            'porcentaje_cumplimiento',
            'cargado_por',
            'fecha_carga',
            'estado_validacion',
            'validado_por',
            'fecha_validacion',
        )

    def get_semaforo(self, obj) -> str | None:
        return semaforo(obj.porcentaje_cumplimiento)

    def validate_resultado_ejecutado(self, valor):
        if valor is None:
            raise serializers.ValidationError('Escribe el resultado ejecutado.')
        if valor < 0:
            raise serializers.ValidationError('El resultado no puede ser negativo.')
        return valor

    def validate(self, datos):
        """El resultado de una meta cualitativa son criterios cumplidos, no unidades."""
        objetivo = self.instance.objetivo if self.instance else self.context.get('objetivo')
        valor = datos.get('resultado_ejecutado')
        if objetivo and valor is not None:
            cualitativa = objetivo.tipo_medicion == TipoMedicion.CUALITATIVA
            if cualitativa and valor > CRITERIOS_CUALITATIVOS:
                raise serializers.ValidationError(
                    {
                        'resultadoEjecutado': 'Una meta cualitativa se mide en criterios '
                        f'cumplidos: de 0 a {CRITERIOS_CUALITATIVOS}.'
                    }
                )
            if objetivo.tipo_medicion == TipoMedicion.BINARIO and valor > 1:
                raise serializers.ValidationError(
                    {'resultadoEjecutado': 'Un objetivo binario se carga con 1 (cumple) o 0 (no).'}
                )
        return datos


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
    resultado = ResultadoSerializer(read_only=True)
    cumplimiento = serializers.SerializerMethodField()
    semaforo = serializers.SerializerMethodField()

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
            'resultado',
            'cumplimiento',
            'semaforo',
            'created_at',
        )
        read_only_fields = ('registrado_por', 'estado')

    def get_editable(self, obj) -> bool:
        """
        Si el objetivo todavía se puede tocar.

        El mes se congela solo cuando empieza (A9); antes de eso se edita, y
        después solo si People habilitó la excepción.
        """
        registros = self.context.get('periodos')
        registro = (
            registros.get(obj.periodo)
            if registros is not None
            else Periodo.objects.filter(periodo=obj.periodo).first()
        )
        puede, _motivo = puede_editarse(obj.periodo, registro, timezone.localdate())
        return puede

    def get_cumplimiento(self, obj) -> float | None:
        """El % del objetivo, si ya tiene resultado cargado."""
        resultado = getattr(obj, 'resultado', None)
        if resultado is None or resultado.porcentaje_cumplimiento is None:
            return None
        return float(resultado.porcentaje_cumplimiento)

    def get_semaforo(self, obj) -> str | None:
        return semaforo(self.get_cumplimiento(obj))

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

        # El mes se congela solo cuando empieza (A9), y People puede reabrirlo.
        if periodo:
            registro = Periodo.objects.filter(periodo=periodo).first()
            puede, motivo = puede_editarse(periodo, registro, timezone.localdate())
            if not puede:
                raise serializers.ValidationError(motivo)

        # La meta es obligatoria salvo en binario, donde el resultado es sí/no,
        # y en cualitativa, donde son siempre dos criterios.
        if tipo == TipoMedicion.BINARIO:
            datos['meta_valor'] = None
        elif tipo == TipoMedicion.CUALITATIVA:
            datos['meta_valor'] = Decimal(CRITERIOS_CUALITATIVOS)
            datos['permite_sobrecumplimiento'] = False
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
    habilitada_por_nombre = serializers.CharField(
        source='habilitada_por.full_name', default='', read_only=True
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
            'edicion_habilitada',
            'habilitada_por',
            'habilitada_por_nombre',
            'fecha_habilitacion',
            'motivo_habilitacion',
        )
        read_only_fields = fields


def estado_inicial_objetivo() -> str:
    """El estado con el que nace un objetivo mientras el mes está en definición."""
    return EstadoObjetivo.BORRADOR
