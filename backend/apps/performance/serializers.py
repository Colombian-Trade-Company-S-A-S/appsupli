"""
Serializadores de Objetivos y KPIs.

Acá viven las reglas que dependen de los datos —el % de 0 a 100, el tope de
seis objetivos, la ponderación que no puede pasar de 100—; los permisos viven
en las vistas. El JSON sale en camelCase, como el resto de la API.
"""
from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone
from rest_framework import serializers

from apps.accounts.models import User

from .api_permissions import (
    aprobador_de,
    es_asesor_o_promotor,
    puede_cargar_resultado,
    puede_validar_resultado,
)
from .cumplimiento import semaforo
from .models import (
    CUMPLIMIENTO_MAXIMO,
    MAXIMO_OBJETIVOS,
    PONDERACION_COMPLETA,
    EstadoObjetivo,
    Evidencia,
    HistorialResultado,
    Objetivo,
    Periodo,
    Resultado,
    TipoMedicion,
    Unidad,
)
from .periodos import primer_dia, puede_editarse


class PersonaSerializer(serializers.ModelSerializer):
    """
    La ficha mínima de alguien, para los desplegables y las tablas.

    Quien la pida debe traer `manager__manager` con `select_related`: el
    aprobador de un asesor es el jefe de su jefe.
    """

    nombre = serializers.CharField(source='full_name', read_only=True)
    cargo = serializers.CharField(source='position', read_only=True)
    area = serializers.CharField(source='area.name', default='', read_only=True)
    jefe = serializers.CharField(source='manager.full_name', default='', read_only=True)
    jefe_id = serializers.IntegerField(source='manager_id', read_only=True)
    asesor_o_promotor = serializers.SerializerMethodField()
    aprobador = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            'id',
            'nombre',
            'cargo',
            'area',
            'jefe',
            'jefe_id',
            'asesor_o_promotor',
            'aprobador',
            'direccion',
            'organizacion',
            'regional',
            'punto_venta',
        )

    def get_asesor_o_promotor(self, obj) -> bool:
        return es_asesor_o_promotor(obj)

    def get_aprobador(self, obj) -> str:
        """Quién aprueba su resultado: el jefe, o el jefe del jefe en asesores y promotores."""
        aprobador = aprobador_de(obj)
        return aprobador.full_name if aprobador else ''


class HistorialSerializer(serializers.ModelSerializer):
    """Un paso del resultado: qué pasó, quién, cuándo y con qué comentario."""

    accion_label = serializers.CharField(source='get_accion_display', read_only=True)
    autor_nombre = serializers.CharField(source='autor.full_name', default='', read_only=True)

    class Meta:
        model = HistorialResultado
        fields = (
            'id',
            'accion',
            'accion_label',
            'autor',
            'autor_nombre',
            'comentario',
            'porcentaje_cumplimiento',
            'evidencias',
            'created_at',
        )
        read_only_fields = fields


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
    El % de cumplimiento de un objetivo, con sus evidencias.

    El porcentaje lo registra quien carga el resultado, de 0 a 100; el color
    sale de los cortes del semáforo.
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
    feedback_por_nombre = serializers.CharField(
        source='feedback_por.full_name', default='', read_only=True
    )
    historial = HistorialSerializer(many=True, read_only=True)
    semaforo = serializers.SerializerMethodField()

    class Meta:
        model = Resultado
        fields = (
            'id',
            'objetivo',
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
            'feedback',
            'feedback_por',
            'feedback_por_nombre',
            'feedback_fecha',
            'evidencias',
            'historial',
        )
        read_only_fields = (
            'id',
            'objetivo',
            'cargado_por',
            'fecha_carga',
            'estado_validacion',
            'validado_por',
            'fecha_validacion',
            'feedback',
            'feedback_por',
            'feedback_fecha',
        )

    def get_semaforo(self, obj) -> str | None:
        return semaforo(obj.porcentaje_cumplimiento)

    def validate_porcentaje_cumplimiento(self, valor):
        if valor is None:
            return valor
        if valor < 0 or valor > CUMPLIMIENTO_MAXIMO:
            raise serializers.ValidationError(
                f'El % de cumplimiento va de 0 a {CUMPLIMIENTO_MAXIMO}.'
            )
        return valor

    def validate(self, datos):
        """Sin porcentaje no hay resultado: un PATCH puede omitirlo solo si ya existía."""
        anterior = getattr(self.instance, 'porcentaje_cumplimiento', None)
        if datos.get('porcentaje_cumplimiento', anterior) is None:
            raise serializers.ValidationError(
                {
                    'porcentajeCumplimiento': 'Escribe el % de cumplimiento, '
                    f'de 0 a {CUMPLIMIENTO_MAXIMO}.'
                }
            )
        return datos


class ObjetivoSerializer(serializers.ModelSerializer):
    """
    Un objetivo con su KPI y su peso. Se mide siempre en % de cumplimiento.

    `puede_cargar` y `puede_validar` dicen qué puede hacer con él quien
    pregunta (necesitan el `request` en el contexto): así el frontend no
    repite las reglas de asesores y promotores.
    """

    colaborador_nombre = serializers.CharField(source='colaborador.full_name', read_only=True)
    colaborador_cargo = serializers.CharField(source='colaborador.position', read_only=True)
    registrado_por_nombre = serializers.CharField(
        source='registrado_por.full_name', read_only=True
    )
    responsable_nombre = serializers.CharField(
        source='responsable_resultado.full_name', default='', read_only=True
    )
    aprobador_nombre = serializers.SerializerMethodField()
    editable = serializers.SerializerMethodField()
    puede_cargar = serializers.SerializerMethodField()
    puede_validar = serializers.SerializerMethodField()
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
            'fuente_datos',
            'responsable_resultado',
            'responsable_nombre',
            'aprobador_nombre',
            'estado',
            'editable',
            'puede_cargar',
            'puede_validar',
            'resultado',
            'cumplimiento',
            'semaforo',
            'created_at',
        )
        read_only_fields = ('registrado_por', 'estado')

    def _usuario(self):
        request = self.context.get('request')
        return getattr(request, 'user', None)

    def get_aprobador_nombre(self, obj) -> str:
        aprobador = aprobador_de(obj.colaborador)
        return aprobador.full_name if aprobador else ''

    def get_puede_cargar(self, obj) -> bool:
        usuario = self._usuario()
        return bool(usuario and puede_cargar_resultado(usuario, obj))

    def get_puede_validar(self, obj) -> bool:
        usuario = self._usuario()
        return bool(usuario and puede_validar_resultado(usuario, obj))

    def get_editable(self, obj) -> bool:
        """
        Si el objetivo todavía se puede tocar.

        El mes se congela solo cuando empieza (A9); antes de eso se edita, y
        después solo si People habilitó la excepción.
        """
        registros = self.context.get('periodos')
        if registros is None:
            # Una sola consulta para toda la lista: el contexto es el mismo para
            # todas las filas, así que queda guardado para las siguientes. La
            # tabla tiene una fila por mes, así que traerla entera es barato.
            registros = {registro.periodo: registro for registro in Periodo.objects.all()}
            self.context['periodos'] = registros
        registro = registros.get(obj.periodo)
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

        # El mes se congela solo cuando empieza (A9), y People puede reabrirlo.
        if periodo:
            registro = Periodo.objects.filter(periodo=periodo).first()
            puede, motivo = puede_editarse(periodo, registro, timezone.localdate())
            if not puede:
                raise serializers.ValidationError(motivo)

        # Un único criterio para todos: el % de cumplimiento. Un objetivo de la
        # metodología anterior que se edite queda medido igual que los nuevos.
        datos.update(
            tipo_medicion=TipoMedicion.PORCENTAJE,
            unidad=Unidad.PORCENTAJE,
            meta_valor=None,
            umbral_cumplimiento=None,
            permite_sobrecumplimiento=False,
            tope_cumplimiento=Decimal(CUMPLIMIENTO_MAXIMO),
            formula='',
        )

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
