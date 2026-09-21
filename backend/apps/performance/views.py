"""
API de Objetivos y KPIs (Fase 1).

Son los endpoints del §8 de la especificación. Las reglas de negocio que
dependen de más de una fila —la ponderación que debe sumar 100 y el
congelamiento del mes— se validan acá, no con restricciones de la base, porque
miran el conjunto de objetivos de una persona.
"""
from datetime import date

from django.db import transaction
from django.db.models import Count, Sum
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import User

from .api_permissions import (
    CanManagePeriodos,
    HasPerformanceApp,
    capacidades,
    puede_definir,
    puede_definir_a_cualquiera,
    puede_ver,
    puede_ver_todo,
)
from .models import (
    MAXIMO_OBJETIVOS,
    PONDERACION_COMPLETA,
    EstadoObjetivo,
    EstadoPeriodo,
    Objetivo,
    Periodo,
    TipoMedicion,
    Unidad,
)
from .serializers import ObjetivoSerializer, PersonaSerializer, primer_dia

ACCESO = [IsAuthenticated, HasPerformanceApp]


# ── Utilidades de periodo ──────────────────────────────────────────────────


def _a_periodo(texto: str) -> date:
    """Acepta `2026-10` o `2026-10-01` y devuelve siempre el primer día del mes."""
    partes = (texto or '').split('-')
    try:
        anio, mes = int(partes[0]), int(partes[1])
        return date(anio, mes, 1)
    except (IndexError, ValueError) as exc:
        raise ValidationError({'periodo': 'Usa el formato AAAA-MM, por ejemplo 2026-10.'}) from exc


def _mes_siguiente(momento: date) -> date:
    return date(momento.year + (momento.month == 12), momento.month % 12 + 1, 1)


def _periodos_disponibles() -> list[dict]:
    """
    Los meses que se pueden elegir: los que ya existen más los próximos.

    Un periodo se crea solo cuando alguien guarda el primer objetivo, así que
    el desplegable tiene que ofrecer también los meses que todavía no existen.
    """
    estados = dict(Periodo.objects.values_list('periodo', 'estado'))
    mes = primer_dia(timezone.localdate())
    proximos = [mes]
    for _ in range(2):
        proximos.append(_mes_siguiente(proximos[-1]))
    meses = sorted(set(estados) | set(proximos), reverse=True)
    return [
        {
            'periodo': mes,
            'estado': estados.get(mes, EstadoPeriodo.DEFINICION),
            'estado_label': EstadoPeriodo(estados.get(mes, EstadoPeriodo.DEFINICION)).label,
        }
        for mes in meses
    ]


def _equipo_de(user):
    """A quién le puede definir objetivos esta persona."""
    if puede_definir_a_cualquiera(user):
        return User.objects.filter(is_active=True)
    return user.team.filter(is_active=True)


# ── Objetivos ──────────────────────────────────────────────────────────────


class ObjetivoViewSet(viewsets.ModelViewSet):
    """
    Los objetivos de una persona en un mes.

    El listado siempre va filtrado por colaborador y periodo: es la vista
    «Objetivos del equipo» del mockup, que trabaja sobre una persona a la vez.
    """

    serializer_class = ObjetivoSerializer
    permission_classes = ACCESO
    pagination_class = None

    def get_queryset(self):
        user = self.request.user
        consulta = Objetivo.objects.select_related(
            'colaborador', 'registrado_por', 'responsable_resultado'
        )
        if not puede_ver_todo(user):
            consulta = consulta.filter(
                colaborador__in=[user.pk, *user.team.values_list('pk', flat=True)]
            )
        colaborador = self.request.query_params.get('colaborador')
        if colaborador:
            consulta = consulta.filter(colaborador_id=colaborador)
        periodo = self.request.query_params.get('periodo')
        if periodo:
            consulta = consulta.filter(periodo=_a_periodo(periodo))
        return consulta

    def _exigir_permiso(self, colaborador):
        if not puede_definir(self.request.user, colaborador):
            raise PermissionDenied(
                'Los objetivos los define el jefe directo o People. '
                'Nadie define los suyos propios.'
            )

    def perform_create(self, serializer):
        colaborador = serializer.validated_data['colaborador']
        self._exigir_permiso(colaborador)
        periodo = serializer.validated_data['periodo']
        # El mes se abre solo, con el primer objetivo que alguien le carga.
        Periodo.objects.get_or_create(
            periodo=periodo,
            defaults={'abierto_por': self.request.user, 'fecha_apertura': timezone.now()},
        )
        serializer.save(
            registrado_por=self.request.user,
            estado=EstadoObjetivo.BORRADOR,
            responsable_resultado=serializer.validated_data.get('responsable_resultado')
            or colaborador,
        )

    def perform_update(self, serializer):
        self._exigir_permiso(serializer.instance.colaborador)
        if serializer.instance.congelado:
            raise ValidationError(
                'Este objetivo está congelado porque el mes ya está en medición.'
            )
        self._exigir_permiso(
            serializer.validated_data.get('colaborador', serializer.instance.colaborador)
        )
        serializer.save()

    def perform_destroy(self, instancia):
        self._exigir_permiso(instancia.colaborador)
        estado = (
            Periodo.objects.filter(periodo=instancia.periodo)
            .values_list('estado', flat=True)
            .first()
        )
        if estado and estado != EstadoPeriodo.DEFINICION:
            raise ValidationError(
                'El mes ya no está en definición: un objetivo congelado no se elimina.'
            )
        instancia.delete()


@api_view(['GET'])
@permission_classes(ACCESO)
def mis_objetivos(request):
    """
    Lo que ve el colaborador: sus objetivos del mes, en solo lectura.

    No necesita permisos: con tener el sub-módulo basta, igual que responder la
    evaluación propia en valoración.
    """
    periodo = request.query_params.get('periodo')
    consulta = Objetivo.objects.filter(colaborador=request.user).select_related(
        'colaborador', 'registrado_por', 'responsable_resultado'
    )
    if periodo:
        consulta = consulta.filter(periodo=_a_periodo(periodo))
    return Response(ObjetivoSerializer(consulta, many=True).data)


# ── Periodos ───────────────────────────────────────────────────────────────


def _ponderacion(colaboradores, periodo) -> list[dict]:
    """Cuánto lleva asignado cada persona en el mes: el banner del 100%."""
    totales = {
        fila['colaborador_id']: fila
        for fila in Objetivo.objects.filter(
            colaborador__in=colaboradores, periodo=periodo
        )
        .values('colaborador_id')
        .annotate(objetivos=Count('id'), asignado=Sum('peso'))
    }
    resumen = []
    for persona in colaboradores:
        fila = totales.get(persona.pk, {})
        asignado = float(fila.get('asignado') or 0)
        resumen.append(
            {
                'colaborador': persona.pk,
                'colaborador_nombre': persona.full_name,
                'cargo': persona.position,
                'objetivos': fila.get('objetivos', 0),
                'peso_asignado': round(asignado, 2),
                'peso_disponible': round(PONDERACION_COMPLETA - asignado, 2),
                'completo': abs(asignado - PONDERACION_COMPLETA) < 0.005,
                'maximo_objetivos': MAXIMO_OBJETIVOS,
            }
        )
    return resumen


@api_view(['GET'])
@permission_classes(ACCESO)
def resumen_periodo(request, periodo):
    """
    Suma de pesos y conteo de objetivos, para el banner del formulario.

    Con `?colaborador=` responde por una persona; sin él, por todo el equipo
    que quien pregunta puede ver.
    """
    mes = _a_periodo(periodo)
    colaborador = request.query_params.get('colaborador')
    if colaborador:
        persona = User.objects.filter(pk=colaborador).first()
        if not persona or not puede_ver(request.user, persona):
            raise PermissionDenied('No puedes consultar los objetivos de esta persona.')
        personas = [persona]
    else:
        personas = list(_equipo_de(request.user).select_related('area'))

    estado = (
        Periodo.objects.filter(periodo=mes).values_list('estado', flat=True).first()
        or EstadoPeriodo.DEFINICION
    )
    return Response(
        {
            'periodo': mes,
            'estado': estado,
            'estado_label': EstadoPeriodo(estado).label,
            'ponderacion_completa': PONDERACION_COMPLETA,
            'colaboradores': _ponderacion(personas, mes),
        }
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated, HasPerformanceApp, CanManagePeriodos])
@transaction.atomic
def activar_periodo(request, periodo):
    """
    Pasa el mes a medición: valida que todos sumen 100 y congela los objetivos.

    Es la regla 1 de la especificación. Si alguien no llega al 100% no se
    activa nada: se devuelve la lista de quiénes faltan y por cuánto, para que
    el mes no arranque a medias.
    """
    mes = _a_periodo(periodo)
    con_objetivos = User.objects.filter(objetivos__periodo=mes).distinct()
    if not con_objetivos.exists():
        raise ValidationError('Este mes no tiene objetivos cargados todavía.')

    pendientes = [fila for fila in _ponderacion(list(con_objetivos), mes) if not fila['completo']]
    if pendientes:
        return Response(
            {
                'error': 'PESO_INCOMPLETO',
                'mensaje': 'Hay personas cuyos objetivos no suman 100%.',
                'pendientes': [
                    {
                        **fila,
                        'mensaje': f'Los objetivos de {fila["colaborador_nombre"]} suman '
                        f'{fila["peso_asignado"]:g}%, deben sumar 100%.',
                    }
                    for fila in pendientes
                ],
            },
            status=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

    registro, _ = Periodo.objects.get_or_create(
        periodo=mes,
        defaults={'abierto_por': request.user, 'fecha_apertura': timezone.now()},
    )
    congelados = Objetivo.objects.filter(periodo=mes).update(estado=EstadoObjetivo.CONGELADO)
    registro.estado = EstadoPeriodo.EN_MEDICION
    registro.save(update_fields=['estado', 'updated_at'])
    return Response(
        {
            'periodo': mes,
            'estado': registro.estado,
            'congelados': congelados,
            'colaboradores': con_objetivos.count(),
            'mensaje': f'{mes:%B de %Y} quedó en medición: {congelados} objetivos congelados.',
        }
    )


# ── Catálogos y portada ────────────────────────────────────────────────────


@api_view(['GET'])
@permission_classes(ACCESO)
def opciones(request):
    """Todo lo que el formulario necesita para pintarse de una sola vez."""
    equipo = _equipo_de(request.user).select_related('area', 'manager').order_by('first_name')
    return Response(
        {
            'periodos': _periodos_disponibles(),
            'tipos_medicion': [
                {'value': valor, 'label': etiqueta} for valor, etiqueta in TipoMedicion.choices
            ],
            'unidades': [{'value': valor, 'label': etiqueta} for valor, etiqueta in Unidad.choices],
            'equipo': PersonaSerializer(equipo, many=True).data,
            'maximo_objetivos': MAXIMO_OBJETIVOS,
            'ponderacion_completa': PONDERACION_COMPLETA,
            'capacidades': capacidades(request.user),
        }
    )


@api_view(['GET'])
@permission_classes(ACCESO)
def resumen(request):
    """
    La portada del sub-módulo: en qué va el mes.

    Responde lo mismo para todos, pero con lo que cada quien puede ver: el
    colaborador ve su propio avance, el líder el de su equipo.
    """
    mes = _a_periodo(
        request.query_params.get('periodo') or primer_dia(timezone.localdate()).isoformat()
    )
    estado = (
        Periodo.objects.filter(periodo=mes).values_list('estado', flat=True).first()
        or EstadoPeriodo.DEFINICION
    )
    equipo = list(_equipo_de(request.user).only('id', 'first_name', 'last_name', 'position'))
    ponderacion = _ponderacion(equipo, mes) if equipo else []
    mios = Objetivo.objects.filter(colaborador=request.user, periodo=mes)
    return Response(
        {
            'periodo': mes,
            'estado': estado,
            'estado_label': EstadoPeriodo(estado).label,
            'mis_objetivos': mios.count(),
            'mi_ponderacion': float(mios.aggregate(total=Sum('peso'))['total'] or 0),
            'equipo': len(equipo),
            'equipo_completo': sum(1 for fila in ponderacion if fila['completo']),
            'equipo_sin_objetivos': sum(1 for fila in ponderacion if fila['objetivos'] == 0),
            'capacidades': capacidades(request.user),
        }
    )
