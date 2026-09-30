"""
API de Supli Challenge.

El ciclo de vida del reto lo maneja People (B8); participar es entregar la
evidencia (B9); valorar es poner un nivel por criterio, y de ahí sale el
puntaje y el ganador, que el backend recalcula solo.
"""
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import Area, User

from .api_permissions import (
    CanManageRetos,
    HasChallengeApp,
    capacidades,
    es_del_publico,
    es_jurado_de,
    puede_gestionar_retos,
    puede_participar,
    puede_valorar,
)
from .models import (
    CRITERIOS_BASE,
    NIVEL_MAXIMO,
    NIVEL_MINIMO,
    SIGNIFICADO_NIVEL,
    Alcance,
    CambioReto,
    Categoria,
    EstadoParticipacion,
    EstadoReto,
    EstadoRevision,
    FormatoEvidencia,
    Participacion,
    PuntajeCriterio,
    Reto,
    SolicitudRevision,
    Valoracion,
    VisibilidadEvidencia,
)
from .puntajes import puntaje_de_niveles
from .reglas import puede_pedir_revision, recalcular, sortear_jurado
from .serializers import (
    ParticipacionSerializer,
    RetoSerializer,
    SolicitudRevisionSerializer,
)

ACCESO = [IsAuthenticated, HasChallengeApp]


def _con_conteos(consulta):
    """Los dos números que muestran las tarjetas de cada reto, sin N+1."""
    return consulta.annotate(
        participaciones_count=Count('participaciones', distinct=True),
        valoradas_count=Count(
            'participaciones',
            filter=Q(participaciones__estado=EstadoParticipacion.VALORADA),
            distinct=True,
        ),
    )


class RetoViewSet(viewsets.ModelViewSet):
    """
    Los retos: People los administra, el resto ve los suyos.

    Un colaborador solo ve los retos publicados de su público; los borradores
    son de quien los está armando.
    """

    serializer_class = RetoSerializer
    permission_classes = ACCESO
    pagination_class = None

    def get_queryset(self):
        consulta = _con_conteos(
            Reto.objects.select_related('creado_por').prefetch_related(
                'criterios', 'jurados__usuario', 'areas', 'personas'
            )
        )
        if not puede_gestionar_retos(self.request.user):
            consulta = consulta.exclude(estado=EstadoReto.BORRADOR)
        categoria = self.request.query_params.get('categoria')
        if categoria:
            consulta = consulta.filter(categoria=categoria)
        estado = self.request.query_params.get('estado')
        if estado:
            consulta = consulta.filter(estado=estado)
        return consulta

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), HasChallengeApp(), CanManageRetos()]
        return super().get_permissions()

    def list(self, request, *args, **kwargs):
        """El listado ya viene filtrado por público: a nadie le aparece lo ajeno."""
        retos = [
            reto
            for reto in self.get_queryset()
            if puede_gestionar_retos(request.user) or es_del_publico(request.user, reto)
        ]
        return Response(self.get_serializer(retos, many=True).data)

    def perform_create(self, serializer):
        serializer.save(creado_por=self.request.user)

    def perform_update(self, serializer):
        """Con el reto abierto, cada cambio queda en el historial que ve el colaborador."""
        reto = serializer.instance
        antes = {
            'titulo': reto.titulo,
            'descripcion': reto.descripcion,
            'cierra_el': reto.cierra_el,
        }
        actualizado = serializer.save()
        if not reto.reglas_bloqueadas:
            return
        cambios = [
            etiqueta
            for campo, etiqueta in (
                ('titulo', 'el nombre'),
                ('descripcion', 'las instrucciones'),
                ('cierra_el', 'la fecha de cierre'),
            )
            if antes[campo] != getattr(actualizado, campo)
        ]
        if cambios:
            CambioReto.objects.create(
                reto=actualizado,
                autor=self.request.user,
                descripcion=f'Se actualizó {" y ".join(cambios)}.',
            )

    def perform_destroy(self, instancia):
        if instancia.estado != EstadoReto.BORRADOR:
            raise ValidationError(
                'Un reto publicado no se elimina: se cierra y se finaliza, para que quede '
                'el histórico de quienes participaron.'
            )
        instancia.delete()


# ── Ciclo de vida del reto (B8) ────────────────────────────────────────────


def _reto_o_404(pk) -> Reto:
    reto = Reto.objects.filter(pk=pk).first()
    if reto is None:
        raise ValidationError('Ese reto no existe.')
    return reto


@api_view(['POST'])
@permission_classes([IsAuthenticated, HasChallengeApp, CanManageRetos])
@transaction.atomic
def publicar(request, pk):
    """
    Abre el reto: desde acá sus reglas quedan fijas y se sortea el jurado.

    El jurado se escoge una vez, al publicar, entre quienes tienen el módulo y
    no participan en este reto.
    """
    reto = _reto_o_404(pk)
    if reto.estado != EstadoReto.BORRADOR:
        raise ValidationError('Este reto ya fue publicado.')
    if not reto.criterios.exists():
        raise ValidationError('El reto necesita su rúbrica antes de abrirse.')
    if reto.cierra_el < timezone.localdate():
        raise ValidationError({'cierraEl': 'La fecha de cierre ya pasó.'})

    reto.estado = EstadoReto.PUBLICADO
    reto.publicado_en = timezone.now()
    reto.save(update_fields=['estado', 'publicado_en', 'updated_at'])
    sortear_jurado(reto, User.objects.exclude(pk=request.user.pk))
    return Response(RetoSerializer(_con_conteos(Reto.objects.filter(pk=pk)).first()).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated, HasChallengeApp, CanManageRetos])
def cerrar(request, pk):
    """Termina el plazo: ya no se reciben entregas, pero sí se valoran las que hay."""
    reto = _reto_o_404(pk)
    if reto.estado != EstadoReto.PUBLICADO:
        raise ValidationError('Solo se cierra un reto abierto.')
    reto.estado = EstadoReto.CERRADO
    reto.cerrado_en = timezone.now()
    reto.save(update_fields=['estado', 'cerrado_en', 'updated_at'])
    return Response(RetoSerializer(_con_conteos(Reto.objects.filter(pk=pk)).first()).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated, HasChallengeApp, CanManageRetos])
def finalizar(request, pk):
    """
    El cierre definitivo: resultados validados y ganador en firme.

    No se finaliza con entregas sin valorar, porque el ganador saldría de una
    comparación incompleta.
    """
    reto = _reto_o_404(pk)
    if reto.estado != EstadoReto.CERRADO:
        raise ValidationError('Primero hay que cerrar el reto.')
    pendientes = reto.participaciones.filter(estado=EstadoParticipacion.ENTREGADA).count()
    if pendientes:
        raise ValidationError(
            f'Quedan {pendientes} participación(es) sin valorar: el ganador saldría de una '
            'comparación incompleta.'
        )
    reto.estado = EstadoReto.FINALIZADO
    reto.finalizado_en = timezone.now()
    reto.save(update_fields=['estado', 'finalizado_en', 'updated_at'])
    return Response(RetoSerializer(_con_conteos(Reto.objects.filter(pk=pk)).first()).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated, HasChallengeApp, CanManageRetos])
def reabrir(request, pk):
    """
    La excepción: People reabre un reto cerrado, con su motivo (B8).

    «Un Challenge cerrado no se reabre como acción habitual»: por eso pide
    motivo y queda en el historial que ve el colaborador.
    """
    reto = _reto_o_404(pk)
    if reto.estado not in (EstadoReto.CERRADO, EstadoReto.FINALIZADO):
        raise ValidationError('Este reto no está cerrado.')
    motivo = (request.data.get('motivo') or '').strip()
    if not motivo:
        raise ValidationError({'motivo': 'Escribe el motivo y con quién se validó.'})

    reto.estado = EstadoReto.PUBLICADO
    reto.cerrado_en = None
    reto.finalizado_en = None
    reto.save(update_fields=['estado', 'cerrado_en', 'finalizado_en', 'updated_at'])
    CambioReto.objects.create(
        reto=reto, autor=request.user, descripcion=f'Se reabrió el reto. Motivo: {motivo}'
    )
    return Response(RetoSerializer(_con_conteos(Reto.objects.filter(pk=pk)).first()).data)


# ── Participación (B9) ─────────────────────────────────────────────────────


@api_view(['GET', 'POST'])
@permission_classes(ACCESO)
def participaciones(request, pk):
    """
    Las entregas de un reto, o la propia entrega.

    Entregar la evidencia es participar: no hay inscripción previa. Quien no
    puede ver las evidencias igual ve la lista, pero sin el soporte.
    """
    reto = _reto_o_404(pk)

    if request.method == 'GET':
        if not (puede_valorar(request.user, reto) or es_del_publico(request.user, reto)):
            raise PermissionDenied('Este reto no es de tu público.')
        filas = reto.participaciones.select_related('participante').prefetch_related(
            'valoraciones__puntajes__criterio', 'valoraciones__evaluador'
        )
        participa = reto.participaciones.filter(participante=request.user).exists()
        datos = ParticipacionSerializer(
            filas, many=True, context={'request': request, 'participa': participa}
        ).data
        # La evidencia se oculta según la visibilidad del reto (B6): la fila se
        # ve, el soporte no.
        for fila in datos:
            if not fila['evidencia_visible']:
                fila['entrega_texto'] = ''
                fila['entrega_link'] = ''
        return Response(datos)

    if not puede_participar(request.user, reto):
        raise PermissionDenied(
            'El reto no está abierto o no es de tu público.'
            if reto.estado != EstadoReto.PUBLICADO
            else 'Este reto no es de tu público.'
        )
    if reto.cierra_el < timezone.localdate():
        raise ValidationError('El plazo de este reto ya venció.')

    existente = reto.participaciones.filter(participante=request.user).first()
    if existente and existente.valoraciones.exists():
        raise ValidationError('Tu evidencia ya fue valorada: no se puede reemplazar.')

    serializer = ParticipacionSerializer(
        existente, data=request.data, context={'request': request, 'reto': reto}
    )
    serializer.is_valid(raise_exception=True)
    participacion = serializer.save(reto=reto, participante=request.user)
    return Response(
        ParticipacionSerializer(participacion, context={'request': request}).data,
        status=status.HTTP_201_CREATED if existente is None else status.HTTP_200_OK,
    )


@api_view(['POST'])
@permission_classes(ACCESO)
@transaction.atomic
def valorar(request, pk):
    """
    La valoración de un evaluador: un nivel de 1 a 10 por criterio.

    Marcar «no cumple» descalifica la entrega con 0 y no se valoran criterios
    (B9). El puntaje final y el ganador los recalcula el backend.
    """
    participacion = (
        Participacion.objects.select_related('reto', 'participante').filter(pk=pk).first()
    )
    if participacion is None:
        raise ValidationError('Esa participación no existe.')
    reto = participacion.reto
    if not puede_valorar(request.user, reto):
        raise PermissionDenied('Valoran los evaluadores de Supli y el jurado del reto.')
    if participacion.participante_id == request.user.id:
        raise PermissionDenied('Nadie valora su propia participación.')

    no_cumple = bool(request.data.get('no_cumple') or request.data.get('noCumple'))
    comentario = (request.data.get('comentario') or '').strip()
    valoracion, _ = Valoracion.objects.update_or_create(
        participacion=participacion,
        evaluador=request.user,
        defaults={
            'comentario': comentario,
            'no_cumple': no_cumple,
            'es_jurado': es_jurado_de(request.user, reto),
        },
    )
    valoracion.puntajes.all().delete()

    if no_cumple:
        valoracion.puntaje = 0
        motivo = comentario or 'La evidencia no corresponde al formato o las condiciones del reto.'
        participacion.motivo_descalificacion = motivo
        participacion.save(update_fields=['motivo_descalificacion', 'updated_at'])
    else:
        niveles = _leer_niveles(request.data, reto)
        PuntajeCriterio.objects.bulk_create(
            PuntajeCriterio(valoracion=valoracion, criterio_id=criterio, nivel=nivel)
            for criterio, nivel in niveles.items()
        )
        valoracion.puntaje = puntaje_de_niveles(niveles.values())
    valoracion.save(update_fields=['puntaje', 'updated_at'])

    participacion = recalcular(participacion)
    return Response(ParticipacionSerializer(participacion, context={'request': request}).data)


def _leer_niveles(datos, reto) -> dict[int, int]:
    """Valida que lleguen todos los criterios del reto, cada uno de 1 a 10."""
    crudos = datos.get('puntajes') or datos.get('criterios') or []
    if isinstance(crudos, dict):
        crudos = [{'criterio': clave, 'nivel': valor} for clave, valor in crudos.items()]
    niveles: dict[int, int] = {}
    for fila in crudos:
        try:
            criterio = int(fila['criterio'])
            nivel = int(fila['nivel'])
        except (KeyError, TypeError, ValueError) as exc:
            raise ValidationError(
                {'puntajes': 'Cada criterio necesita su nivel, de 1 a 10.'}
            ) from exc
        if not NIVEL_MINIMO <= nivel <= NIVEL_MAXIMO:
            raise ValidationError(
                {'puntajes': f'Los niveles van de {NIVEL_MINIMO} a {NIVEL_MAXIMO}.'}
            )
        niveles[criterio] = nivel

    esperados = set(reto.criterios.values_list('id', flat=True))
    if set(niveles) != esperados:
        raise ValidationError(
            {'puntajes': 'Hay que calificar todos los criterios de la rúbrica del reto.'}
        )
    return niveles


@api_view(['POST'])
@permission_classes(ACCESO)
def pedir_revision(request, pk):
    """El colaborador pide que le revisen la valoración (B3)."""
    participacion = (
        Participacion.objects.prefetch_related('valoraciones__puntajes').filter(pk=pk).first()
    )
    if participacion is None:
        raise ValidationError('Esa participación no existe.')
    if not puede_pedir_revision(request.user, participacion):
        raise PermissionDenied(
            'La revisión se habilita sobre tu propia valoración y solo cuando algún criterio '
            'quedó en 7 o menos.'
        )
    motivo = (request.data.get('motivo') or '').strip()
    if not motivo:
        raise ValidationError({'motivo': 'Cuéntanos qué quieres que se revise.'})

    solicitud = SolicitudRevision.objects.create(
        participacion=participacion, solicitante=request.user, motivo=motivo
    )
    return Response(
        SolicitudRevisionSerializer(solicitud).data, status=status.HTTP_201_CREATED
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated, HasChallengeApp, CanManageRetos])
def atender_revision(request, pk):
    """People responde la solicitud de revisión y la cierra."""
    solicitud = SolicitudRevision.objects.filter(pk=pk).first()
    if solicitud is None:
        raise ValidationError('Esa solicitud no existe.')
    respuesta = (request.data.get('respuesta') or '').strip()
    if not respuesta:
        raise ValidationError({'respuesta': 'Escribe la respuesta para el colaborador.'})
    solicitud.respuesta = respuesta
    solicitud.estado = EstadoRevision.ATENDIDA
    solicitud.atendida_por = request.user
    solicitud.save(update_fields=['respuesta', 'estado', 'atendida_por', 'updated_at'])
    return Response(SolicitudRevisionSerializer(solicitud).data)


# ── Vistas de lectura ──────────────────────────────────────────────────────


@api_view(['GET'])
@permission_classes(ACCESO)
def resultado(request, pk):
    """El ganador del reto y el ranking, con el detalle del desempate si lo hubo."""
    reto = _reto_o_404(pk)
    if not (puede_valorar(request.user, reto) or es_del_publico(request.user, reto)):
        raise PermissionDenied('Este reto no es de tu público.')

    filas = list(
        reto.participaciones.select_related('participante').order_by(
            '-es_ganador', '-puntaje_final', 'created_at'
        )
    )
    ganadora = next((fila for fila in filas if fila.es_ganador), None)
    return Response(
        {
            'reto': RetoSerializer(
                _con_conteos(Reto.objects.filter(pk=pk)).first(), context={'request': request}
            ).data,
            'ganador': ParticipacionSerializer(
                ganadora, context={'request': request}
            ).data
            if ganadora
            else None,
            'hubo_desempate': bool(ganadora and ganadora.bonus),
            'ranking': [
                {
                    'participacion': fila.pk,
                    'participante': fila.participante_id,
                    'participante_nombre': fila.participante.full_name,
                    'cargo': fila.participante.position,
                    'estado': fila.estado,
                    'puntaje': fila.puntaje_final,
                    'bonus': fila.bonus,
                    'total': fila.puntaje_con_bonus,
                    'es_ganador': fila.es_ganador,
                }
                for fila in filas
            ],
        }
    )


@api_view(['GET'])
@permission_classes(ACCESO)
def mis_retos(request):
    """Lo mío: en qué participé, con qué estado y cuánto sumé."""
    filas = (
        Participacion.objects.filter(participante=request.user)
        .select_related('reto')
        .prefetch_related('valoraciones__puntajes')
        .order_by('-created_at')
    )
    return Response(
        {
            'retos': len(filas),
            'ganados': sum(1 for fila in filas if fila.es_ganador),
            'puntos': float(sum((fila.puntaje_con_bonus or 0) for fila in filas)),
            'participaciones': [
                {
                    'id': fila.pk,
                    'reto': fila.reto_id,
                    'reto_titulo': fila.reto.titulo,
                    'categoria': fila.reto.categoria,
                    'categoria_label': fila.reto.get_categoria_display(),
                    'estado_reto': fila.reto.estado,
                    'estado': fila.estado,
                    'estado_label': fila.get_estado_display(),
                    'puntaje': fila.puntaje_final,
                    'total': fila.puntaje_con_bonus,
                    'es_ganador': fila.es_ganador,
                    'puede_pedir_revision': puede_pedir_revision(request.user, fila),
                    'created_at': fila.created_at,
                }
                for fila in filas
            ],
        }
    )


@api_view(['GET'])
@permission_classes(ACCESO)
def top(request):
    """
    El Top Challenge: quién suma más por participación y resultados.

    Solo cuentan los retos finalizados o cerrados: un reto abierto todavía
    puede cambiar de ganador.
    """
    filas = (
        Participacion.objects.filter(
            reto__estado__in=[EstadoReto.CERRADO, EstadoReto.FINALIZADO]
        )
        .exclude(estado=EstadoParticipacion.DESCALIFICADA)
        .select_related('participante')
    )
    acumulado: dict[int, dict] = {}
    for fila in filas:
        persona = acumulado.setdefault(
            fila.participante_id,
            {
                'participante': fila.participante_id,
                'nombre': fila.participante.full_name,
                'cargo': fila.participante.position,
                'retos': 0,
                'ganados': 0,
                'puntos': 0.0,
            },
        )
        persona['retos'] += 1
        persona['ganados'] += int(fila.es_ganador)
        persona['puntos'] += float(fila.puntaje_con_bonus or 0)

    ranking = sorted(
        acumulado.values(), key=lambda fila: (-fila['puntos'], -fila['ganados'], fila['nombre'])
    )
    posicion = next(
        (i + 1 for i, fila in enumerate(ranking) if fila['participante'] == request.user.id), None
    )
    return Response({'ranking': ranking, 'mi_posicion': posicion})


@api_view(['GET'])
@permission_classes(ACCESO)
def opciones(request):
    """Todo lo que el formulario de reto necesita para pintarse de una vez."""
    return Response(
        {
            'categorias': [{'value': v, 'label': e} for v, e in Categoria.choices],
            'alcances': [{'value': v, 'label': e} for v, e in Alcance.choices],
            'formatos': [{'value': v, 'label': e} for v, e in FormatoEvidencia.choices],
            'visibilidades': [{'value': v, 'label': e} for v, e in VisibilidadEvidencia.choices],
            'estados': [{'value': v, 'label': e} for v, e in EstadoReto.choices],
            'criterios_base': [
                {'nombre': nombre, 'desempate': desempate, 'orden': orden}
                for orden, (nombre, desempate) in enumerate(CRITERIOS_BASE)
            ],
            'niveles': [
                {'value': nivel, 'label': etiqueta}
                for nivel, etiqueta in SIGNIFICADO_NIVEL.items()
            ],
            'areas': [
                {'value': area.pk, 'label': area.name}
                for area in Area.objects.filter(is_active=True).order_by('name')
            ],
            'personas': [
                {'value': persona.pk, 'label': persona.full_name}
                for persona in User.objects.filter(is_active=True).order_by('first_name')
            ],
            'capacidades': capacidades(request.user),
        }
    )
