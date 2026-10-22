"""
API de Objetivos y KPIs (Fase 1).

Son los endpoints del §8 de la especificación. Las reglas de negocio que
dependen de más de una fila —la ponderación que debe sumar 100 y el
congelamiento del mes— se validan acá, no con restricciones de la base, porque
miran el conjunto de objetivos de una persona.
"""
from datetime import date
from decimal import Decimal

from django.db import transaction
from django.db.models import Count, Sum
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import User
from apps.core.excel import ErrorDeFila, construir_plantilla, leer_archivo

from .api_permissions import (
    CanManagePeriodos,
    HasPerformanceApp,
    capacidades,
    es_lider,
    puede_cargar_resultado,
    puede_dar_feedback,
    puede_definir,
    puede_definir_a_cualquiera,
    puede_validar_resultado,
    puede_ver,
    puede_ver_todo,
)
from .cumplimiento import (
    calcular_cumplimiento,
    cortes_semaforo,
    cumplimiento_total,
    semaforo,
)
from .models import (
    CRITERIOS_CUALITATIVOS,
    MAXIMO_OBJETIVOS,
    PONDERACION_COMPLETA,
    AccionHistorial,
    EstadoObjetivo,
    EstadoPeriodo,
    EstadoValidacion,
    Evidencia,
    HistorialResultado,
    Objetivo,
    Periodo,
    Resultado,
    Semaforo,
    TipoEvidencia,
    TipoMedicion,
    Unidad,
)
from .periodos import (
    ETIQUETA_CORTE,
    MESES_POR_CORTE,
    cortes_del_anio,
    etiqueta_corte,
    etiqueta_mes,
    mes_siguiente,
    meses_del_rango,
    primer_dia,
    puede_editarse,
    rango,
    ultimo_dia_para_editar,
)
from .plantilla import COLUMNAS, NOTA
from .serializers import (
    ObjetivoSerializer,
    PeriodoSerializer,
    PersonaSerializer,
    ResultadoSerializer,
)

ACCESO = [IsAuthenticated, HasPerformanceApp]

#: Qué hacer con los objetivos que la persona ya tenía en ese mes.
MODO_AGREGAR = 'agregar'
MODO_REEMPLAZAR = 'reemplazar'


# ── Utilidades de periodo ──────────────────────────────────────────────────


def _a_periodo(texto: str) -> date:
    """Acepta `2026-10` o `2026-10-01` y devuelve siempre el primer día del mes."""
    partes = (texto or '').split('-')
    try:
        anio, mes = int(partes[0]), int(partes[1])
        return date(anio, mes, 1)
    except (IndexError, ValueError) as exc:
        raise ValidationError({'periodo': 'Usa el formato AAAA-MM, por ejemplo 2026-10.'}) from exc


def _periodos_disponibles() -> list[dict]:
    """
    Los meses que se pueden elegir: los que ya existen más los próximos.

    Un periodo se crea solo cuando alguien guarda el primer objetivo, así que
    el desplegable tiene que ofrecer también los meses que todavía no existen.
    """
    registros = {registro.periodo: registro for registro in Periodo.objects.all()}
    hoy = timezone.localdate()
    mes = primer_dia(hoy)
    proximos = [mes]
    for _ in range(2):
        proximos.append(mes_siguiente(proximos[-1]))
    meses = sorted(set(registros) | set(proximos), reverse=True)

    disponibles = []
    for periodo in meses:
        registro = registros.get(periodo)
        estado = registro.estado if registro else EstadoPeriodo.DEFINICION
        editable, motivo = puede_editarse(periodo, registro, hoy)
        disponibles.append(
            {
                'periodo': periodo,
                'estado': estado,
                'estado_label': EstadoPeriodo(estado).label,
                'editable': editable,
                'motivo': motivo,
                'edicion_habilitada': bool(registro and registro.edicion_habilitada),
                'motivo_habilitacion': registro.motivo_habilitacion if registro else '',
                'ultimo_dia_para_editar': ultimo_dia_para_editar(periodo),
            }
        )
    return disponibles


def objetivos_para_serializar():
    """
    Los objetivos con todo lo que `ObjetivoSerializer` lee, en pocas consultas.

    Las personas del resultado (quién cargó, validó y comentó) van con
    `select_related`; evidencias e historial, con `prefetch_related`. Sin esto
    cada fila pide tres usuarios más por su cuenta (N+1).
    """
    return Objetivo.objects.select_related(
        'colaborador',
        'registrado_por',
        'responsable_resultado',
        'resultado__cargado_por',
        'resultado__validado_por',
        'resultado__feedback_por',
    ).prefetch_related('resultado__evidencias', 'resultado__historial__autor')


def _resultado_para_serializar(pk) -> Resultado:
    """
    Un resultado recién guardado, releído con todo lo que serializa.

    La respuesta lleva el historial completo: sin el `prefetch` cada paso pedía
    su autor por separado, y la consulta crecía con la historia del resultado.
    """
    return (
        Resultado.objects.select_related('cargado_por', 'validado_por', 'feedback_por')
        .prefetch_related('evidencias', 'historial__autor')
        .get(pk=pk)
    )


def responsable_de(colaborador):
    """
    El responsable del resultado es siempre el jefe directo del colaborador.

    Es quien responde por ese objetivo y lo aprueba; el colaborador igual carga
    su propio resultado. Sin jefe registrado, queda el propio colaborador.
    """
    return colaborador.manager or colaborador


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
        consulta = objetivos_para_serializar()
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
            responsable_resultado=responsable_de(colaborador),
        )

    def perform_update(self, serializer):
        self._exigir_permiso(serializer.instance.colaborador)
        self._exigir_mes_abierto(serializer.instance.periodo)
        colaborador = serializer.validated_data.get('colaborador', serializer.instance.colaborador)
        self._exigir_permiso(colaborador)
        serializer.save(responsable_resultado=responsable_de(colaborador))

    def perform_destroy(self, instancia):
        self._exigir_permiso(instancia.colaborador)
        self._exigir_mes_abierto(instancia.periodo)
        instancia.delete()

    def _exigir_mes_abierto(self, periodo):
        """El mes se congela solo cuando empieza (A9); People puede reabrirlo."""
        registro = Periodo.objects.filter(periodo=periodo).first()
        puede, motivo = puede_editarse(periodo, registro, timezone.localdate())
        if not puede:
            raise ValidationError(motivo)


@api_view(['GET'])
@permission_classes(ACCESO)
def mis_objetivos(request):
    """
    Lo que ve el colaborador: sus objetivos del mes, en solo lectura.

    No necesita permisos: con tener el sub-módulo basta, igual que responder la
    evaluación propia en valoración.
    """
    periodo = request.query_params.get('periodo')
    consulta = objetivos_para_serializar().filter(colaborador=request.user)
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

    registro = Periodo.objects.filter(periodo=mes).first()
    estado = registro.estado if registro else EstadoPeriodo.DEFINICION
    editable, motivo = puede_editarse(mes, registro, timezone.localdate())
    return Response(
        {
            'periodo': mes,
            'estado': estado,
            'estado_label': EstadoPeriodo(estado).label,
            'editable': editable,
            'motivo': motivo,
            'edicion_habilitada': bool(registro and registro.edicion_habilitada),
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
    # `equipo` son las personas a cargo directo: con quien se trabaja uno por
    # uno. People además puede definirle a cualquiera, pero eso no llena el
    # desplegable por defecto: lo pide con `compania`.
    a_cargo = request.user.team.filter(is_active=True)
    equipo = a_cargo.select_related('area', 'manager').order_by('first_name')
    compania = (
        _equipo_de(request.user).select_related('area', 'manager').order_by('first_name')
        if puede_definir_a_cualquiera(request.user)
        else []
    )
    return Response(
        {
            'periodos': _periodos_disponibles(),
            'tipos_medicion': [
                {'value': valor, 'label': etiqueta} for valor, etiqueta in TipoMedicion.choices
            ],
            'unidades': [{'value': valor, 'label': etiqueta} for valor, etiqueta in Unidad.choices],
            'equipo': PersonaSerializer(equipo, many=True).data,
            'compania': PersonaSerializer(compania, many=True).data,
            'maximo_objetivos': MAXIMO_OBJETIVOS,
            'ponderacion_completa': PONDERACION_COMPLETA,
            'criterios_cualitativos': CRITERIOS_CUALITATIVOS,
            # Los cortes del año en curso y del anterior: con eso el tablero
            # arma su selector de mes, Q, semestre y año sin inventarse nada.
            'cortes': [
                *cortes_del_anio(timezone.localdate().year),
                *cortes_del_anio(timezone.localdate().year - 1),
            ],
            'semaforo': cortes_semaforo(),
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
    registro = Periodo.objects.filter(periodo=mes).first()
    estado = registro.estado if registro else EstadoPeriodo.DEFINICION
    editable, motivo = puede_editarse(mes, registro, timezone.localdate())
    equipo = list(
        _equipo_de(request.user).only('id', 'first_name', 'last_name', 'position', 'manager')
    )
    ponderacion = _ponderacion(equipo, mes) if equipo else []
    mios = Objetivo.objects.filter(colaborador=request.user, periodo=mes)
    return Response(
        {
            'periodo': mes,
            'estado': estado,
            'estado_label': EstadoPeriodo(estado).label,
            'editable': editable,
            'motivo': motivo,
            'edicion_habilitada': bool(registro and registro.edicion_habilitada),
            'mis_objetivos': mios.count(),
            'mi_ponderacion': float(mios.aggregate(total=Sum('peso'))['total'] or 0),
            'equipo': len(equipo),
            'equipo_completo': sum(1 for fila in ponderacion if fila['completo']),
            'equipo_sin_objetivos': sum(1 for fila in ponderacion if fila['objetivos'] == 0),
            'capacidades': capacidades(request.user),
        }
    )


# ── Resultados y evidencias ────────────────────────────────────────────────
#
# Lo ejecutado de cada objetivo. El porcentaje nunca llega del frontend: lo
# calcula el motor con el tipo de medición, y de ahí sale el color del
# semáforo. Las evidencias son enlaces a SharePoint u OneDrive (A5).


def _objetivo_visible(request, pk) -> Objetivo:
    objetivo = (
        Objetivo.objects.select_related('colaborador', 'responsable_resultado', 'resultado')
        .filter(pk=pk)
        .first()
    )
    if objetivo is None or not puede_ver(request.user, objetivo.colaborador):
        raise PermissionDenied('No puedes consultar este objetivo.')
    return objetivo


@api_view(['PUT', 'PATCH'])
@permission_classes(ACCESO)
@transaction.atomic
def cargar_resultado(request, pk):
    """
    Carga o corrige lo ejecutado de un objetivo, con sus evidencias.

    Lo hace el colaborador; su jefe o People también pueden hacerlo por él, y
    el Trade Leader cuando se trata de un asesor. El mes tiene que haber
    empezado: no se carga el resultado de un mes que todavía no ocurre.
    """
    objetivo = _objetivo_visible(request, pk)
    if not puede_cargar_resultado(request.user, objetivo):
        raise PermissionDenied('El resultado lo carga el colaborador, su jefe o People.')
    if primer_dia(timezone.localdate()) < objetivo.periodo:
        raise ValidationError(
            f'{etiqueta_mes(objetivo.periodo)} todavía no empieza: no hay resultado que cargar.'
        )
    cerrado = (
        Periodo.objects.filter(periodo=objetivo.periodo)
        .values_list('estado', flat=True)
        .first()
        == EstadoPeriodo.CERRADO
    )
    if cerrado:
        raise ValidationError(
            f'{etiqueta_mes(objetivo.periodo)} está cerrado: sus resultados ya no se modifican.'
        )

    resultado = getattr(objetivo, 'resultado', None)
    es_nuevo = resultado is None
    serializer = ResultadoSerializer(
        resultado,
        data=request.data,
        partial=request.method == 'PATCH',
        context={'request': request, 'objetivo': objetivo},
    )
    serializer.is_valid(raise_exception=True)
    evidencias = serializer.validated_data.pop('evidencias', None)

    resultado = serializer.save(
        objetivo=objetivo,
        cargado_por=request.user,
        fecha_carga=timezone.now(),
        # Cambiar el resultado devuelve la validación a pendiente: lo que el
        # jefe validó ya no es lo que dice la fila.
        estado_validacion=EstadoValidacion.PENDIENTE,
        validado_por=None,
        fecha_validacion=None,
    )
    resultado.porcentaje_cumplimiento = calcular_cumplimiento(
        objetivo, resultado.resultado_ejecutado
    )
    resultado.save(update_fields=['porcentaje_cumplimiento', 'updated_at'])

    if evidencias is not None:
        resultado.evidencias.all().delete()
        Evidencia.objects.bulk_create(
            Evidencia(
                resultado=resultado,
                nombre=fila.get('nombre', ''),
                link_soporte=fila['link_soporte'],
                tipo=TipoEvidencia.LINK,
            )
            for fila in evidencias
        )
    # Después de las evidencias: el registro guarda las de este momento, que es
    # lo que el jefe compara («antes → ahora») cuando revisa una corrección.
    _registrar(
        resultado,
        AccionHistorial.CARGADO if es_nuevo else AccionHistorial.CORREGIDO,
        request.user,
        resultado.observacion,
    )

    return Response(ResultadoSerializer(_resultado_para_serializar(resultado.pk)).data)


@api_view(['POST'])
@permission_classes(ACCESO)
def validar_resultado(request, pk):
    """
    El jefe o People dan por bueno el resultado, o lo devuelven con una razón.

    Quien cargó el resultado no se lo valida a sí mismo: el sentido de este
    paso es que alguien más mire la evidencia.
    """
    objetivo = _objetivo_visible(request, pk)
    resultado = getattr(objetivo, 'resultado', None)
    if resultado is None:
        raise ValidationError('Este objetivo todavía no tiene resultado cargado.')
    if not puede_validar_resultado(request.user, objetivo):
        if resultado.cargado_por_id == request.user.id:
            raise PermissionDenied(
                'No puedes validar un resultado que cargaste tú: lo valida otra persona '
                '(el jefe del colaborador o People).'
            )
        raise PermissionDenied('La validación la hace el jefe del colaborador o People.')

    estado = (request.data.get('estado') or '').strip()
    if estado not in (EstadoValidacion.VALIDADO, EstadoValidacion.RECHAZADO):
        raise ValidationError({'estado': 'Usa «validado» o «rechazado».'})
    observacion = (request.data.get('observacion') or '').strip()
    if estado == EstadoValidacion.RECHAZADO and not observacion:
        raise ValidationError(
            {'observacion': 'Escribe por qué se devuelve, para que se pueda corregir.'}
        )

    resultado.estado_validacion = estado
    resultado.validado_por = request.user
    resultado.fecha_validacion = timezone.now()
    campos = ['estado_validacion', 'validado_por', 'fecha_validacion', 'updated_at']
    if observacion:
        # El comentario es del jefe: va al feedback, sin pisar la observación
        # de quien cargó el resultado.
        _poner_feedback(resultado, request.user, observacion)
        campos += ['feedback', 'feedback_por', 'feedback_fecha']
    resultado.save(update_fields=campos)
    _registrar(
        resultado,
        AccionHistorial.VALIDADO
        if estado == EstadoValidacion.VALIDADO
        else AccionHistorial.RECHAZADO,
        request.user,
        observacion,
    )
    return Response(ResultadoSerializer(_resultado_para_serializar(resultado.pk)).data)


def _registrar(resultado, accion: str, autor, comentario: str = '') -> None:
    """Deja el paso en el historial, con el valor y el % de ese momento."""
    HistorialResultado.objects.create(
        resultado=resultado,
        accion=accion,
        autor=autor,
        comentario=comentario or '',
        resultado_ejecutado=resultado.resultado_ejecutado,
        porcentaje_cumplimiento=resultado.porcentaje_cumplimiento,
        evidencias=[
            {'nombre': nombre, 'link_soporte': link}
            for nombre, link in resultado.evidencias.values_list('nombre', 'link_soporte')
        ],
    )


def _poner_feedback(resultado, autor, texto: str) -> None:
    resultado.feedback = texto
    resultado.feedback_por = autor
    resultado.feedback_fecha = timezone.now()


@api_view(['POST'])
@permission_classes(ACCESO)
def dar_feedback(request, pk):
    """
    El jefe (o People) deja un comentario sobre lo que cargó el colaborador.

    Es independiente de aprobar o devolver: sirve para orientar sin cambiar el
    estado. Reemplaza el comentario anterior; un texto vacío lo borra.
    """
    objetivo = _objetivo_visible(request, pk)
    resultado = getattr(objetivo, 'resultado', None)
    if resultado is None:
        raise ValidationError('Este objetivo todavía no tiene resultado cargado.')
    if not puede_dar_feedback(request.user, objetivo):
        raise PermissionDenied('El feedback lo deja el jefe del colaborador o People.')

    texto = (request.data.get('feedback') or '').strip()
    if len(texto) > 2000:
        raise ValidationError({'feedback': 'Máximo 2000 caracteres.'})
    if texto:
        _poner_feedback(resultado, request.user, texto)
        _registrar(resultado, AccionHistorial.FEEDBACK, request.user, texto)
    else:
        resultado.feedback, resultado.feedback_por, resultado.feedback_fecha = '', None, None
    resultado.save(update_fields=['feedback', 'feedback_por', 'feedback_fecha', 'updated_at'])
    return Response(ResultadoSerializer(_resultado_para_serializar(resultado.pk)).data)


# ── Excepción de edición (A9) ──────────────────────────────────────────────


@api_view(['POST'])
@permission_classes([IsAuthenticated, HasPerformanceApp, CanManagePeriodos])
def habilitar_edicion(request, periodo):
    """
    People reabre (o vuelve a cerrar) la edición de un mes ya congelado.

    Es la excepción autorizada por el CEO del A9. Queda registrado quién la
    habilitó, cuándo y con qué motivo, porque una excepción sin registro es
    indistinguible de que la regla no exista.
    """
    mes = _a_periodo(periodo)
    habilitar = request.data.get('habilitada')
    habilitar = True if habilitar is None else bool(habilitar)
    motivo = (request.data.get('motivo') or '').strip()
    if habilitar and not motivo:
        raise ValidationError(
            {'motivo': 'Escribe el motivo de la excepción y quién la autorizó.'}
        )

    registro, _ = Periodo.objects.get_or_create(
        periodo=mes,
        defaults={'abierto_por': request.user, 'fecha_apertura': timezone.now()},
    )
    registro.edicion_habilitada = habilitar
    registro.habilitada_por = request.user if habilitar else None
    registro.fecha_habilitacion = timezone.now() if habilitar else None
    registro.motivo_habilitacion = motivo if habilitar else ''
    registro.save(
        update_fields=[
            'edicion_habilitada',
            'habilitada_por',
            'fecha_habilitacion',
            'motivo_habilitacion',
            'updated_at',
        ]
    )
    return Response(
        {
            **PeriodoSerializer(registro).data,
            'mensaje': (
                f'{etiqueta_mes(mes)} queda abierto para edición por excepción.'
                if habilitar
                else f'{etiqueta_mes(mes)} vuelve a quedar congelado.'
            ),
        }
    )


# ── Acumulados por corte de tiempo (A8) ────────────────────────────────────


def _cumplimiento_por_persona(personas, meses) -> list[dict]:
    """
    El cumplimiento ponderado de cada persona en un rango de meses.

    Un objetivo sin resultado cargado no cuenta como cero: se informa aparte
    («sin medir») para no castigar a alguien por un dato que todavía no está.
    """
    objetivos = Objetivo.objects.filter(
        colaborador__in=personas, periodo__in=meses
    ).select_related('resultado')
    acumulado: dict[int, dict] = {
        persona.pk: {
            'colaborador': persona.pk,
            'colaborador_nombre': persona.full_name,
            'cargo': persona.position,
            'objetivos': 0,
            'medidos': 0,
            'pares': [],
            'peso_medido': Decimal('0'),
        }
        for persona in personas
    }
    for objetivo in objetivos:
        fila = acumulado.get(objetivo.colaborador_id)
        if fila is None:
            continue
        fila['objetivos'] += 1
        resultado = getattr(objetivo, 'resultado', None)
        if resultado is None or resultado.porcentaje_cumplimiento is None:
            continue
        fila['medidos'] += 1
        fila['pares'].append((objetivo.peso, resultado.porcentaje_cumplimiento))
        fila['peso_medido'] += objetivo.peso

    salida = []
    for fila in acumulado.values():
        pares, peso_medido = fila.pop('pares'), fila.pop('peso_medido')
        if pares:
            # Se pondera sobre lo medido, no sobre 100: a mitad de trimestre lo
            # cargado es lo único que se puede comparar contra la meta.
            bruto = cumplimiento_total(pares)
            cumplimiento = (
                float(bruto * PONDERACION_COMPLETA / peso_medido) if peso_medido else None
            )
            cumplimiento = round(cumplimiento, 2) if cumplimiento is not None else None
        else:
            cumplimiento = None
        salida.append({**fila, 'cumplimiento': cumplimiento, 'semaforo': semaforo(cumplimiento)})
    return sorted(
        salida,
        key=lambda fila: (fila['cumplimiento'] is None, -(fila['cumplimiento'] or 0)),
    )


def _alcance_del_tablero(user):
    """
    De quién ve los resultados esta persona en el tablero.

    People y admin, la compañía; un líder, sus personas a cargo. Un colaborador
    sin nadie a cargo no tiene tablero (su resultado lo ve en «Mis objetivos»):
    se le niega. Devuelve `(alcance, queryset)`.
    """
    if puede_ver_todo(user):
        return 'compania', User.objects.filter(is_active=True)
    if es_lider(user):
        return 'equipo', user.team.filter(is_active=True)
    raise PermissionDenied(
        'El semáforo es para líderes, People y administradores. '
        'Tu resultado lo ves en «Mis objetivos».'
    )


@api_view(['GET'])
@permission_classes(ACCESO)
def acumulado(request):
    """
    El cumplimiento del equipo en un corte: mes, Q (trimestre), semestre o año.

    `?tipo=trimestre&anio=2026&indice=4`. Es lo que alimenta el semáforo del
    equipo y el Top Performance del prototipo.
    """
    tipo = request.query_params.get('tipo') or 'mes'
    if tipo not in MESES_POR_CORTE:
        raise ValidationError(
            {'tipo': f'Usa uno de: {", ".join(MESES_POR_CORTE)}.'}
        )
    hoy = timezone.localdate()
    try:
        anio = int(request.query_params.get('anio') or hoy.year)
        indice = int(request.query_params.get('indice') or _indice_actual(tipo, hoy))
    except ValueError as exc:
        raise ValidationError({'anio': 'El año y el índice son números.'}) from exc

    desde, hasta = rango(tipo, anio, indice)
    meses = meses_del_rango(desde, hasta)
    # El Top Performance lo ve todo el mundo; el tablero, solo lo que a cada
    # quien le corresponde.
    es_top = request.query_params.get('alcance') == 'top'
    if es_top:
        alcance = 'compania'
        personas = User.objects.filter(is_active=True)
    else:
        alcance, personas = _alcance_del_tablero(request.user)
    equipo = list(personas.only('id', 'first_name', 'last_name', 'position', 'manager'))

    filas = _cumplimiento_por_persona(equipo, meses)
    con_dato = [fila for fila in filas if fila['cumplimiento'] is not None]
    if es_top:
        # Un ranking solo lleva a quien ya tiene resultado: no se revela a
        # quien no, ni cuántos objetivos tiene.
        filas = con_dato
    promedio = (
        round(sum(fila['cumplimiento'] for fila in con_dato) / len(con_dato), 2)
        if con_dato
        else None
    )
    return Response(
        {
            'tipo': tipo,
            'tipo_label': ETIQUETA_CORTE[tipo],
            'anio': anio,
            'indice': indice,
            'label': etiqueta_corte(tipo, anio, indice),
            'desde': desde,
            'hasta': hasta,
            'meses': meses,
            'promedio': promedio,
            'semaforo_promedio': semaforo(promedio),
            'top': con_dato[0] if con_dato else None,
            'brechas': sum(1 for fila in con_dato if fila['semaforo'] == Semaforo.ROJO),
            'cortes': cortes_semaforo(),
            'colaboradores': filas,
            'alcance': alcance,
            'capacidades': capacidades(request.user),
        }
    )


def _indice_actual(tipo: str, hoy) -> int:
    """En qué corte del año cae hoy: el trimestre 4 de octubre, por ejemplo."""
    largo = MESES_POR_CORTE[tipo]
    return (hoy.month - 1) // largo + 1


# ── Carga por Excel ────────────────────────────────────────────────────────
#
# Definir seis objetivos a mano, persona por persona, es el cuello de botella
# de cada cierre de mes. La plantilla es la misma de BI Trade: se descarga con
# los encabezados y las instrucciones, se llena y se sube. Las reglas no
# cambian —el jefe define, la suma da 100, el mes se congela cuando empieza—,
# solo cambia por dónde entran los datos.


@api_view(['GET'])
@permission_classes(ACCESO)
def plantilla_objetivos(request):
    """Descarga el .xlsx en blanco con los encabezados y las instrucciones."""
    contenido = construir_plantilla('Plantilla de objetivos y KPIs', COLUMNAS, NOTA)
    marca = timezone.localtime().strftime('%Y%m%d')
    respuesta = HttpResponse(
        contenido,
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    respuesta['Content-Disposition'] = f'attachment; filename="plantilla-objetivos-{marca}.xlsx"'
    return respuesta


@api_view(['POST'])
@permission_classes(ACCESO)
@parser_classes([MultiPartParser])
@transaction.atomic
def importar_objetivos(request):
    """
    Carga los objetivos de una persona desde el .xlsx de la plantilla.

    Recibe `archivo`, `colaborador` y `periodo`, y un `modo`:

        agregar     → suma los del archivo a los que ya tenga (por defecto)
        reemplazar  → borra los del mes y deja exactamente los del archivo

    Es todo o nada: si una fila falla no se guarda ninguna, y se devuelven
    todos los errores con su número de fila, para corregir el archivo de una
    vez. La ponderación se revisa sobre el conjunto, no fila por fila: doce
    filas de 50% cada una pasarían la validación individual y dejarían a la
    persona en 600%.
    """
    archivo = request.FILES.get('archivo')
    if archivo is None:
        raise ValidationError('No llegó ningún archivo.')
    if not archivo.name.lower().endswith('.xlsx'):
        raise ValidationError('El archivo debe ser un Excel .xlsx. Descarga la plantilla.')

    colaborador = User.objects.filter(pk=request.data.get('colaborador')).first()
    if colaborador is None:
        raise ValidationError({'colaborador': 'Elige a quién se le cargan los objetivos.'})
    if not puede_definir(request.user, colaborador):
        raise PermissionDenied(
            'Los objetivos los define el jefe directo o People. Nadie define los suyos propios.'
        )

    periodo = _a_periodo(request.data.get('periodo') or '')
    registro = Periodo.objects.filter(periodo=periodo).first()
    puede, motivo = puede_editarse(periodo, registro, timezone.localdate())
    if not puede:
        raise ValidationError(motivo)

    modo = (request.data.get('modo') or MODO_AGREGAR).strip()
    if modo not in (MODO_AGREGAR, MODO_REEMPLAZAR):
        raise ValidationError(
            {'modo': f'El modo debe ser «{MODO_AGREGAR}» o «{MODO_REEMPLAZAR}».'}
        )

    try:
        filas, errores = leer_archivo(archivo, COLUMNAS)
    except ErrorDeFila as exc:
        raise ValidationError(str(exc)) from exc
    if not filas and not errores:
        raise ValidationError('El archivo no tiene filas con datos.')

    # En «reemplazar» se borra primero: si no, cada fila se validaría contra la
    # ponderación de los objetivos que el archivo viene justamente a sustituir.
    # Si algo falla más abajo, la transacción devuelve todo a como estaba.
    previos = Objetivo.objects.filter(colaborador=colaborador, periodo=periodo)
    eliminados = 0
    if modo == MODO_REEMPLAZAR:
        eliminados = previos.count()
        previos.delete()

    serializers = []
    peso_del_archivo = Decimal('0')
    for fila in filas:
        payload = _fila_a_objetivo(fila, colaborador, periodo)
        serializer = ObjetivoSerializer(data=payload, context={'request': request})
        if not serializer.is_valid():
            errores.append(
                {
                    'fila': fila['_fila'],
                    'errores': [
                        f'{campo}: {mensajes[0]}'
                        if isinstance(mensajes, list)
                        else f'{campo}: {mensajes}'
                        for campo, mensajes in serializer.errors.items()
                    ],
                }
            )
            continue
        serializers.append(serializer)
        peso_del_archivo += serializer.validated_data['peso']

    # La ponderación y el tope de objetivos se miran sobre el conjunto: el
    # serializer valida cada fila contra lo que hay en la base, pero no contra
    # las otras filas del archivo.
    ya_asignado = previos.aggregate(total=Sum('peso'))['total'] or Decimal('0')
    cuantos_previos = previos.count()

    if not errores:
        if cuantos_previos + len(serializers) > MAXIMO_OBJETIVOS:
            raise ValidationError(
                f'Con este archivo {colaborador.full_name} quedaría con '
                f'{cuantos_previos + len(serializers)} objetivos, y el máximo es '
                f'{MAXIMO_OBJETIVOS}.'
            )
        if ya_asignado + peso_del_archivo > PONDERACION_COMPLETA:
            raise ValidationError(
                f'Los pesos suman {ya_asignado + peso_del_archivo:g}% y no pueden pasar de '
                f'{PONDERACION_COMPLETA}%. '
                + (
                    f'{colaborador.full_name} ya tenía {ya_asignado:g}% asignado.'
                    if ya_asignado
                    else ''
                )
            )

    if errores:
        # Devolver la respuesta no deshace la transacción por sí solo, y en
        # «reemplazar» ya se borraron los objetivos anteriores.
        transaction.set_rollback(True)
        return Response(
            {
                'code': 'invalid',
                'message': (
                    f'{len(errores)} fila(s) con problemas. No se importó nada: '
                    'corrige el archivo y vuelve a subirlo.'
                ),
                'filas': errores[:50],
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    Periodo.objects.get_or_create(
        periodo=periodo,
        defaults={'abierto_por': request.user, 'fecha_apertura': timezone.now()},
    )
    creados = [
        serializer.save(
            registrado_por=request.user,
            estado=EstadoObjetivo.BORRADOR,
            responsable_resultado=responsable_de(colaborador),
        )
        for serializer in serializers
    ]

    total = (
        Objetivo.objects.filter(colaborador=colaborador, periodo=periodo).aggregate(
            total=Sum('peso')
        )['total']
        or Decimal('0')
    )
    falta = PONDERACION_COMPLETA - total
    return Response(
        {
            'created': len(creados),
            'deleted': eliminados,
            'peso_asignado': float(total),
            'peso_disponible': float(falta),
            'completo': abs(falta) < Decimal('0.005'),
            'message': (
                f'{len(creados)} objetivo(s) cargado(s) para {colaborador.full_name}. '
                + (
                    'La ponderación del mes quedó en 100%.'
                    if abs(falta) < Decimal('0.005')
                    else f'Falta asignar {falta:g}% para llegar a 100%.'
                )
            ),
        }
    )


def _fila_a_objetivo(fila: dict, colaborador, periodo) -> dict:
    """
    Traduce una fila de la plantilla al payload del serializer.

    El responsable no sale del archivo: es siempre el jefe directo del
    colaborador. Si un archivo viejo trae la columna «responsable_correo», se
    ignora.
    """
    meta = fila.get('meta')
    umbral = fila.get('umbral_cumplimiento')
    return {
        'colaborador': colaborador.pk,
        'periodo': periodo.isoformat(),
        'objetivo': fila.get('objetivo', ''),
        'kpi': fila.get('kpi', ''),
        'peso': fila.get('peso'),
        'tipo_medicion': fila.get('tipo_medicion'),
        'unidad': fila.get('unidad') or '',
        'meta_valor': str(meta) if meta is not None else None,
        'umbral_cumplimiento': str(umbral) if umbral is not None else None,
        'permite_sobrecumplimiento': bool(fila.get('permite_sobrecumplimiento')),
        'formula': fila.get('formula') or '',
        'fuente_datos': fila.get('fuente_datos') or '',
        'responsable_resultado': responsable_de(colaborador).pk,
    }
