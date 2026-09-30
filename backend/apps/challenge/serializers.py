"""
Serializadores de Supli Challenge.

Acá viven las reglas que dependen de los datos —qué se puede cambiar con el
reto ya abierto, qué formato acepta una evidencia, qué niveles son válidos—;
los permisos viven en las vistas.
"""
from rest_framework import serializers

from .models import (
    CRITERIOS_BASE,
    NIVEL_MAXIMO,
    NIVEL_MINIMO,
    CriterioReto,
    EstadoReto,
    FormatoEvidencia,
    Participacion,
    Reto,
    SolicitudRevision,
    Valoracion,
)

#: Lo único que se puede tocar con el reto ya publicado (B1): el texto y el
#: plazo, que además solo se amplía.
CAMPOS_EDITABLES_PUBLICADO = {'titulo', 'descripcion', 'cierra_el'}


class CriterioSerializer(serializers.ModelSerializer):
    class Meta:
        model = CriterioReto
        fields = ('id', 'nombre', 'orden', 'desempate')


class PuntajeCriterioSerializer(serializers.Serializer):
    """Un criterio con su nivel, tal como lo manda el evaluador."""

    criterio = serializers.IntegerField()
    nivel = serializers.IntegerField(min_value=NIVEL_MINIMO, max_value=NIVEL_MAXIMO)


class RetoSerializer(serializers.ModelSerializer):
    criterios = CriterioSerializer(many=True, required=False)
    categoria_label = serializers.CharField(source='get_categoria_display', read_only=True)
    estado_label = serializers.CharField(source='get_estado_display', read_only=True)
    alcance_label = serializers.CharField(source='get_alcance_display', read_only=True)
    visibilidad_label = serializers.CharField(
        source='get_visibilidad_evidencia_display', read_only=True
    )
    creado_por_nombre = serializers.CharField(source='creado_por.full_name', read_only=True)
    participaciones_count = serializers.IntegerField(read_only=True, default=0)
    valoradas_count = serializers.IntegerField(read_only=True, default=0)
    jurados_nombres = serializers.SerializerMethodField()

    class Meta:
        model = Reto
        fields = (
            'id',
            'titulo',
            'descripcion',
            'categoria',
            'categoria_label',
            'estado',
            'estado_label',
            'cuenta_para_desempeno',
            'alcance',
            'alcance_label',
            'areas',
            'personas',
            'pais',
            'cierra_el',
            'formatos_evidencia',
            'visibilidad_evidencia',
            'visibilidad_label',
            'criterios',
            'jurados_nombres',
            'creado_por',
            'creado_por_nombre',
            'publicado_en',
            'cerrado_en',
            'finalizado_en',
            'participaciones_count',
            'valoradas_count',
            'created_at',
        )
        read_only_fields = (
            'estado',
            'creado_por',
            'publicado_en',
            'cerrado_en',
            'finalizado_en',
        )

    def get_jurados_nombres(self, obj) -> list[str]:
        return [jurado.usuario.full_name for jurado in obj.jurados.all()]

    def validate_formatos_evidencia(self, valor):
        validos = set(FormatoEvidencia.values)
        if not valor:
            raise serializers.ValidationError('Elige al menos un formato de evidencia.')
        desconocidos = [formato for formato in valor if formato not in validos]
        if desconocidos:
            raise serializers.ValidationError(
                f'Formatos no reconocidos: {", ".join(desconocidos)}.'
            )
        return list(dict.fromkeys(valor))

    def validate(self, datos):
        instancia = self.instance
        if instancia and instancia.reglas_bloqueadas:
            # Con el reto abierto las reglas quedan fijas: solo texto y plazo.
            tocados = set(datos) - CAMPOS_EDITABLES_PUBLICADO
            if tocados:
                raise serializers.ValidationError(
                    'El reto ya está publicado: sus reglas quedaron fijas. Solo se puede '
                    'corregir el texto y ampliar el plazo.'
                )
            nueva_fecha = datos.get('cierra_el')
            if nueva_fecha and nueva_fecha < instancia.cierra_el:
                raise serializers.ValidationError(
                    {'cierraEl': 'El plazo solo se amplía, nunca se reduce.'}
                )
        return datos

    def create(self, validated_data):
        criterios = validated_data.pop('criterios', None)
        areas = validated_data.pop('areas', [])
        personas = validated_data.pop('personas', [])
        reto = Reto.objects.create(**validated_data)
        reto.areas.set(areas)
        reto.personas.set(personas)
        # Sin rúbrica propia se usan los cinco criterios base (B2).
        filas = criterios or [
            {'nombre': nombre, 'orden': orden, 'desempate': desempate}
            for orden, (nombre, desempate) in enumerate(CRITERIOS_BASE)
        ]
        CriterioReto.objects.bulk_create(
            CriterioReto(reto=reto, **fila) for fila in filas
        )
        return reto

    def update(self, instance, validated_data):
        criterios = validated_data.pop('criterios', None)
        areas = validated_data.pop('areas', None)
        personas = validated_data.pop('personas', None)
        for campo, valor in validated_data.items():
            setattr(instance, campo, valor)
        instance.save()
        if areas is not None:
            instance.areas.set(areas)
        if personas is not None:
            instance.personas.set(personas)
        if criterios is not None and instance.estado == EstadoReto.BORRADOR:
            instance.criterios.all().delete()
            CriterioReto.objects.bulk_create(
                CriterioReto(reto=instance, **fila) for fila in criterios
            )
        return instance


class ValoracionSerializer(serializers.ModelSerializer):
    evaluador_nombre = serializers.CharField(source='evaluador.full_name', read_only=True)
    puntajes = serializers.SerializerMethodField()

    class Meta:
        model = Valoracion
        fields = (
            'id',
            'evaluador',
            'evaluador_nombre',
            'es_jurado',
            'comentario',
            'no_cumple',
            'puntaje',
            'puntajes',
            'created_at',
        )

    def get_puntajes(self, obj) -> list[dict]:
        return [
            {
                'criterio': puntaje.criterio_id,
                'criterio_nombre': puntaje.criterio.nombre,
                'nivel': puntaje.nivel,
            }
            for puntaje in obj.puntajes.all()
        ]


class ParticipacionSerializer(serializers.ModelSerializer):
    participante_nombre = serializers.CharField(source='participante.full_name', read_only=True)
    participante_cargo = serializers.CharField(source='participante.position', read_only=True)
    estado_label = serializers.CharField(source='get_estado_display', read_only=True)
    valoraciones = ValoracionSerializer(many=True, read_only=True)
    puntaje_con_bonus = serializers.DecimalField(
        max_digits=6, decimal_places=2, read_only=True
    )
    puede_pedir_revision = serializers.SerializerMethodField()
    evidencia_visible = serializers.SerializerMethodField()

    class Meta:
        model = Participacion
        fields = (
            'id',
            'reto',
            'participante',
            'participante_nombre',
            'participante_cargo',
            'formato',
            'entrega_texto',
            'entrega_link',
            'estado',
            'estado_label',
            'puntaje_final',
            'puntaje_con_bonus',
            'bonus',
            'es_ganador',
            'motivo_descalificacion',
            'valoraciones',
            'puede_pedir_revision',
            'evidencia_visible',
            'created_at',
        )
        read_only_fields = (
            'reto',
            'participante',
            'estado',
            'puntaje_final',
            'bonus',
            'es_ganador',
            'motivo_descalificacion',
        )

    def get_puede_pedir_revision(self, obj) -> bool:
        """Solo el dueño de la entrega, y solo si algún criterio quedó en 7 o menos (B3)."""
        from .reglas import puede_pedir_revision

        usuario = self.context.get('request').user if self.context.get('request') else None
        return puede_pedir_revision(usuario, obj)

    def get_evidencia_visible(self, obj) -> bool:
        from .api_permissions import puede_ver_evidencias

        peticion = self.context.get('request')
        if peticion is None:
            return False
        usuario = peticion.user
        if obj.participante_id == usuario.id:
            return True
        participa = self.context.get('participa', False)
        return puede_ver_evidencias(usuario, obj.reto, participa)

    def validate(self, datos):
        """La evidencia tiene que venir en alguno de los formatos que pide el reto (B5)."""
        reto = self.context.get('reto') or (self.instance.reto if self.instance else None)
        formato = datos.get('formato')
        if reto and formato and formato not in (reto.formatos_evidencia or []):
            permitidos = ', '.join(reto.formatos_evidencia or [])
            raise serializers.ValidationError(
                {'formato': f'Este reto acepta: {permitidos}.'}
            )
        texto = (datos.get('entrega_texto') or '').strip()
        link = (datos.get('entrega_link') or '').strip()
        if formato == FormatoEvidencia.TEXTO and not texto:
            raise serializers.ValidationError({'entregaTexto': 'Escribe tu respuesta.'})
        if formato != FormatoEvidencia.TEXTO and not link:
            raise serializers.ValidationError(
                {'entregaLink': 'Pega el enlace del soporte (con permiso de visualización).'}
            )
        return datos


class SolicitudRevisionSerializer(serializers.ModelSerializer):
    solicitante_nombre = serializers.CharField(source='solicitante.full_name', read_only=True)
    estado_label = serializers.CharField(source='get_estado_display', read_only=True)

    class Meta:
        model = SolicitudRevision
        fields = (
            'id',
            'participacion',
            'solicitante',
            'solicitante_nombre',
            'motivo',
            'estado',
            'estado_label',
            'respuesta',
            'atendida_por',
            'created_at',
        )
        read_only_fields = ('participacion', 'solicitante', 'estado', 'respuesta', 'atendida_por')
