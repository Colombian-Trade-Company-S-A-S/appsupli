"""
Plan Partners: el formulario de recomendaciones y sus catálogos.

Registrar una recomendación solo pide tener la aplicación, porque la llena el
promotor de marca. Mantener los catálogos —regionales, puntos y productos— y
corregir o borrar un registro pide `bi-trade:data:manage`.

Los tres catálogos se administran desde el formulario mismo: son listas que
cambian seguido y no tiene sentido esperar un despliegue para cada punto nuevo.
"""
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Count, Sum
from django.db.models.functions import Coalesce
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import SAFE_METHODS, BasePermission
from rest_framework.response import Response

from .api_permissions import CanManageData, HasBiTradeApp, ReadOnlyOrCanManage
from .excel import Columna, ErrorDeFila, construir_plantilla, leer_archivo
from .models import (
    MarcaPartner,
    MetaPartner,
    ProductoPartner,
    PuntoVentaPartner,
    RegionalPartner,
    RegistroPartner,
)
from .serializers import (
    MARCAS_PARTNERS,
    MetaPartnerSerializer,
    ProductoPartnerSerializer,
    PuntoVentaPartnerSerializer,
    RegionalPartnerSerializer,
    RegistroPartnerSerializer,
)
from .views import PaginacionListado

#: Los meses como los escribe Trade en el archivo de metas.
MESES = {
    'ENERO': 1,
    'FEBRERO': 2,
    'MARZO': 3,
    'ABRIL': 4,
    'MAYO': 5,
    'JUNIO': 6,
    'JULIO': 7,
    'AGOSTO': 8,
    'SEPTIEMBRE': 9,
    'SETIEMBRE': 9,
    'OCTUBRE': 10,
    'NOVIEMBRE': 11,
    'DICIEMBRE': 12,
}
NOMBRE_DEL_MES = {numero: nombre.capitalize() for nombre, numero in MESES.items()}

#: Las columnas del Excel de metas, con los mismos encabezados del archivo que
#: Trade ya arma cada mes: no hay que rehacerlo para subirlo.
COLUMNAS_METAS = [
    Columna('MES', ayuda='Nombre del mes.', ejemplo='JULIO'),
    Columna('AÑO', tipo='entero', ejemplo='2026'),
    Columna('CENTRO DE COSTOS', ayuda='Código del punto de venta.', ejemplo='C192'),
    Columna('META', ayuda='Unidades del mes. Admite decimales.', ejemplo='180,83'),
    Columna('MARCA', ejemplo='SAMSUNG'),
    Columna(
        'PUNTO DE VENTA',
        obligatoria=False,
        ayuda='Informativo: el que manda es el código.',
        ejemplo='CAV CUCUTA CENTRO AV QUINTA',
    ),
]


class PuedeRegistrar(BasePermission):
    """Consultar y registrar solo pide la app; corregir o borrar pide el permiso."""

    message = CanManageData.message

    def has_permission(self, request, view) -> bool:
        if request.method in SAFE_METHODS or request.method == 'POST':
            return True
        return CanManageData().has_permission(request, view)


def _en_uso(nombre: str, dependencias: list[tuple[str, int]]) -> Response | None:
    """Corta el borrado de algo del catálogo que ya se usó en un registro."""
    pendientes = [f'{cantidad} {etiqueta}' for etiqueta, cantidad in dependencias if cantidad]
    if not pendientes:
        return None
    return Response(
        {
            'code': 'protected',
            'message': (
                f'«{nombre}» tiene {" y ".join(pendientes)}. '
                'Desactívalo para que deje de aparecer en el formulario; '
                'borrarlo cambiaría registros que ya están cargados.'
            ),
        },
        status=status.HTTP_400_BAD_REQUEST,
    )


class RegionalPartnerViewSet(viewsets.ModelViewSet):
    queryset = RegionalPartner.objects.prefetch_related('puntos_venta', 'registros').order_by(
        'nombre'
    )
    serializer_class = RegionalPartnerSerializer
    permission_classes = [HasBiTradeApp, ReadOnlyOrCanManage]
    search_fields = ('nombre',)
    filterset_fields = ('activa',)
    pagination_class = None

    def destroy(self, request, *args, **kwargs):
        regional = self.get_object()
        bloqueo = _en_uso(
            regional.nombre,
            [
                ('punto(s) de venta', regional.puntos_venta.count()),
                ('registro(s)', regional.registros.count()),
            ],
        )
        return bloqueo or super().destroy(request, *args, **kwargs)


class PuntoVentaPartnerViewSet(viewsets.ModelViewSet):
    queryset = (
        PuntoVentaPartner.objects.select_related('id_regional')
        .prefetch_related('registros')
        .order_by('nombre_pdv')
    )
    serializer_class = PuntoVentaPartnerSerializer
    permission_classes = [HasBiTradeApp, ReadOnlyOrCanManage]
    search_fields = ('id_punto_venta', 'nombre_pdv')
    filterset_fields = ('id_regional', 'activo')
    pagination_class = None

    def destroy(self, request, *args, **kwargs):
        punto = self.get_object()
        bloqueo = _en_uso(punto.nombre_pdv, [('registro(s)', punto.registros.count())])
        return bloqueo or super().destroy(request, *args, **kwargs)


class ProductoPartnerViewSet(viewsets.ModelViewSet):
    queryset = ProductoPartner.objects.prefetch_related('registros').order_by('nombre_producto')
    serializer_class = ProductoPartnerSerializer
    permission_classes = [HasBiTradeApp, ReadOnlyOrCanManage]
    search_fields = ('id_producto', 'nombre_producto')
    filterset_fields = ('activo',)
    pagination_class = None

    def destroy(self, request, *args, **kwargs):
        producto = self.get_object()
        bloqueo = _en_uso(producto.nombre_producto, [('registro(s)', producto.registros.count())])
        return bloqueo or super().destroy(request, *args, **kwargs)


class RegistroPartnerViewSet(viewsets.ModelViewSet):
    queryset = RegistroPartner.objects.select_related(
        'id_regional', 'id_punto_venta', 'id_producto', 'registrado_por'
    ).order_by('-fecha_recomendacion', '-id_registro')
    serializer_class = RegistroPartnerSerializer
    permission_classes = [HasBiTradeApp, PuedeRegistrar]
    pagination_class = PaginacionListado
    filterset_fields = ('id_regional', 'marca', 'id_punto_venta', 'id_producto')
    search_fields = (
        'serial',
        'documento_promotor',
        'factura',
        'id_punto_venta__id_punto_venta',
        'id_punto_venta__nombre_pdv',
        'id_producto__nombre_producto',
    )

    def perform_create(self, serializer):
        serializer.save(registrado_por=self.request.user)

    def create(self, request, *args, **kwargs):
        """Guarda el registro y avisa si el serial ya estaba."""
        respuesta = super().create(request, *args, **kwargs)
        registro = RegistroPartner.objects.get(pk=respuesta.data['id_registro'])
        respuesta.data['message'] = aviso_de_serial(registro)
        return respuesta


def catalogos_partners() -> dict:
    """Los desplegables del formulario.

    Cada punto viaja con su regional para que el formulario pueda mostrar solo
    los de la zona elegida, que es lo que antes resolvían las tres preguntas
    «zona sur / zona norte / zona costa».

    Vive aparte de la vista porque el enlace público sirve exactamente lo
    mismo: el formulario es el mismo, con cuenta o sin ella.
    """
    regionales = RegionalPartner.objects.filter(activa=True).order_by('nombre')
    puntos = (
        PuntoVentaPartner.objects.filter(activo=True)
        .select_related('id_regional')
        .order_by('nombre_pdv')
    )
    productos = ProductoPartner.objects.filter(activo=True).order_by('nombre_producto')
    return {
        'regionales': [
            {'value': regional.pk, 'label': regional.nombre} for regional in regionales
        ],
        'marcas': MARCAS_PARTNERS,
        'puntos_venta': [
            {
                'value': punto.pk,
                'label': punto.etiqueta,
                'nombre': punto.nombre_pdv,
                'id_regional': punto.id_regional_id,
            }
            for punto in puntos
        ],
        'productos': [
            {
                'value': producto.pk,
                'label': producto.etiqueta,
                'nombre': producto.nombre_producto,
                'precio': producto.precio,
            }
            for producto in productos
        ],
    }


def aviso_de_serial(registro) -> str:
    """El mensaje que acompaña a un registro guardado.

    El serial repetido no se bloquea —un mismo equipo puede volver a pasar por
    el plan— pero quien registra tiene que enterarse en el momento.
    """
    repetidos = (
        RegistroPartner.objects.filter(serial=registro.serial).exclude(pk=registro.pk).count()
    )
    if not repetidos:
        return 'Registro guardado.'
    return (
        f'Registro guardado. Ojo: el serial {registro.serial} ya tenía '
        f'{repetidos} registro(s) antes de este.'
    )


@api_view(['GET'])
@permission_classes([HasBiTradeApp])
def opciones_partners(request):
    """Los desplegables del formulario, para quien entra con su cuenta."""
    return Response(catalogos_partners())


# ── Metas del plan ─────────────────────────────────────────────────────────
#
# Vienen del Excel mensual de Trade —una fila por punto de venta y marca— y son
# contra lo que el tablero mide lo que entra por el formulario.


def _a_decimal(valor) -> Decimal | None:
    """La meta del archivo: admite 180,83 y 180.83, y descarta lo que no sea número."""
    texto = str(valor).strip().replace(' ', '')
    if texto.count(',') == 1 and texto.count('.') == 0:
        texto = texto.replace(',', '.')
    else:
        texto = texto.replace(',', '')
    try:
        return Decimal(texto).quantize(Decimal('0.01'))
    except (InvalidOperation, ValueError):
        return None


class MetaPartnerViewSet(viewsets.ModelViewSet):
    """Las metas del plan. Se suben con el mismo Excel que Trade arma cada mes."""

    queryset = MetaPartner.objects.select_related(
        'id_punto_venta', 'id_punto_venta__id_regional'
    ).order_by('-anio', '-mes', 'id_punto_venta__nombre_pdv', 'marca')
    serializer_class = MetaPartnerSerializer
    permission_classes = [HasBiTradeApp, ReadOnlyOrCanManage]
    pagination_class = PaginacionListado
    filterset_fields = ('anio', 'mes', 'marca', 'id_punto_venta')
    search_fields = ('id_punto_venta__id_punto_venta', 'id_punto_venta__nombre_pdv', 'marca')

    @action(detail=False, methods=['get'])
    def periodos(self, request):
        """Los meses que ya tienen metas cargadas, para el selector del tablero."""
        filas = (
            MetaPartner.objects.values('anio', 'mes')
            .annotate(metas=Count('pk'), unidades=Sum('meta_unidades'))
            .order_by('-anio', '-mes')
        )
        return Response(
            [
                {
                    'anio': fila['anio'],
                    'mes': fila['mes'],
                    'label': f'{NOMBRE_DEL_MES[fila["mes"]]} {fila["anio"]}',
                    'metas': fila['metas'],
                    'unidades': float(fila['unidades'] or 0),
                }
                for fila in filas
            ]
        )

    @action(detail=False, methods=['get'])
    def plantilla(self, request):
        """El mismo formato del archivo mensual, por si toca armarlo de cero."""
        contenido = construir_plantilla(
            'Metas del plan Partners',
            COLUMNAS_METAS,
            nota=(
                'Una fila por punto de venta y marca. Si ese mes ya está cargado, '
                'la fila actualiza la meta en vez de duplicarla.'
            ),
        )
        respuesta = HttpResponse(
            contenido,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        respuesta['Content-Disposition'] = 'attachment; filename="plantilla-metas-partners.xlsx"'
        return respuesta

    @action(
        detail=False,
        methods=['post'],
        permission_classes=[HasBiTradeApp, CanManageData],
        parser_classes=[MultiPartParser],
    )
    def importar(self, request):
        """
        Sube el Excel de metas del mes, tal como viene.

        Lo que no se reconoce no rompe la carga: si el archivo trae puntos o
        marcas que no están en el catálogo del formulario, esas filas se omiten
        y se devuelven listadas, para decidir si hay que agregarlas.
        """
        archivo = request.FILES.get('archivo')
        if archivo is None or not archivo.name.lower().endswith('.xlsx'):
            return Response(
                {'code': 'invalid', 'message': 'Sube el archivo de metas en formato .xlsx.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            filas, errores = leer_archivo(archivo, COLUMNAS_METAS)
        except ErrorDeFila as exc:
            return Response(
                {'code': 'invalid', 'message': str(exc)}, status=status.HTTP_400_BAD_REQUEST
            )
        if errores:
            return Response(
                {
                    'code': 'invalid',
                    'message': f'El archivo tiene {len(errores)} fila(s) con problemas.',
                    'filas': errores[:20],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        puntos = {p.pk.upper(): p for p in PuntoVentaPartner.objects.all()}
        marcas = {valor.upper(): valor for valor in MarcaPartner.values}

        creadas = actualizadas = 0
        sin_punto: set[str] = set()
        sin_marca: set[str] = set()
        periodos: set[tuple[int, int]] = set()

        with transaction.atomic():
            for fila in filas:
                mes = MESES.get(str(fila['MES']).strip().upper())
                punto = puntos.get(str(fila['CENTRO DE COSTOS']).strip().upper())
                marca = marcas.get(str(fila['MARCA']).strip().upper())
                meta = _a_decimal(fila['META'])
                if punto is None:
                    sin_punto.add(str(fila['CENTRO DE COSTOS']).strip())
                    continue
                if marca is None:
                    sin_marca.add(str(fila['MARCA']).strip())
                    continue
                if mes is None or meta is None:
                    continue

                _, creada = MetaPartner.objects.update_or_create(
                    anio=int(fila['AÑO']),
                    mes=mes,
                    id_punto_venta=punto,
                    marca=marca,
                    defaults={'meta_unidades': meta},
                )
                creadas += creada
                actualizadas += not creada
                periodos.add((int(fila['AÑO']), mes))

        omitidas = len(filas) - creadas - actualizadas
        partes = [f'{creadas} meta(s) nuevas', f'{actualizadas} actualizada(s)']
        if omitidas:
            partes.append(f'{omitidas} omitida(s)')
        return Response(
            {
                'created': creadas,
                'updated': actualizadas,
                'skipped': omitidas,
                'periodos': [
                    {'anio': anio, 'mes': mes, 'label': f'{NOMBRE_DEL_MES[mes]} {anio}'}
                    for anio, mes in sorted(periodos)
                ],
                'puntos_desconocidos': sorted(sin_punto),
                'marcas_desconocidas': sorted(sin_marca),
                'message': 'Metas cargadas: ' + ', '.join(partes) + '.',
            }
        )


# ── Tablero del plan ───────────────────────────────────────────────────────


def _porcentaje(unidades: float, meta: float) -> float:
    return round(unidades / meta * 100, 1) if meta else 0.0


def _fila(unidades: int, meta: float) -> dict:
    """Lo que el tablero muestra de cada corte: lo hecho contra lo prometido."""
    return {
        'unidades': unidades,
        'meta': round(meta, 1),
        'cumplimiento': _porcentaje(unidades, meta),
        'faltante': round(max(meta - unidades, 0), 1),
        'sobrecumplimiento': round(max(unidades - meta, 0), 1),
    }


@api_view(['GET'])
@permission_classes([HasBiTradeApp])
def dashboard_partners(request):
    """
    El tablero del plan: lo registrado en el formulario contra las metas.

    El mes manda, porque así están puestas las metas —por mes, punto y marca—,
    y con `mes=0` se mira el año entero. El filtro de promotor no toca las
    metas: no están repartidas por persona, igual que en el Power BI del que
    salió este tablero.
    """
    hoy = timezone.localdate()
    params = request.query_params

    def entero(nombre: str, defecto: int) -> int:
        valor = (params.get(nombre) or '').strip()
        return int(valor) if valor.isdigit() else defecto

    anio = entero('anio', hoy.year)
    mes = entero('mes', hoy.month)
    if mes > 12:
        mes = hoy.month
    regional = (params.get('regional') or '').strip()
    punto = (params.get('punto') or '').strip()
    marca = (params.get('marca') or '').strip()
    promotor = (params.get('promotor') or '').strip()

    registros = RegistroPartner.objects.filter(fecha_recomendacion__year=anio)
    metas = MetaPartner.objects.filter(anio=anio)
    if mes:
        registros = registros.filter(fecha_recomendacion__month=mes)
        metas = metas.filter(mes=mes)
    if regional.isdigit():
        registros = registros.filter(id_punto_venta__id_regional_id=int(regional))
        metas = metas.filter(id_punto_venta__id_regional_id=int(regional))
    if punto:
        registros = registros.filter(id_punto_venta_id=punto)
        metas = metas.filter(id_punto_venta_id=punto)
    if marca:
        registros = registros.filter(marca=marca)
        metas = metas.filter(marca=marca)
    if promotor:
        registros = registros.filter(documento_promotor=promotor)

    def metas_por(campo: str) -> dict:
        return {
            fila[campo]: float(fila['meta'] or 0)
            for fila in metas.values(campo).annotate(meta=Sum('meta_unidades'))
        }

    unidades = registros.count()
    meta_total = float(metas.aggregate(m=Coalesce(Sum('meta_unidades'), Decimal(0)))['m'])
    valor = registros.aggregate(v=Coalesce(Sum('id_producto__precio'), 0))['v']

    # ── Cumplimiento por marca ─────────────────────────────────────────────
    unidades_marca = {
        fila['marca']: fila['unidades']
        for fila in registros.values('marca').annotate(unidades=Count('pk'))
    }
    meta_marca = metas_por('marca')
    por_marca = sorted(
        (
            {'marca': nombre, **_fila(unidades_marca.get(nombre, 0), meta_marca.get(nombre, 0.0))}
            for nombre in set(unidades_marca) | set(meta_marca)
        ),
        key=lambda f: f['unidades'],
        reverse=True,
    )

    # ── Registros diarios ──────────────────────────────────────────────────
    por_dia = [
        {'fecha': fila['fecha_recomendacion'], 'unidades': fila['unidades']}
        for fila in registros.values('fecha_recomendacion')
        .annotate(unidades=Count('pk'))
        .order_by('fecha_recomendacion')
    ]

    # ── Regionales y puntos de venta ───────────────────────────────────────
    meta_regional = metas_por('id_punto_venta__id_regional__nombre')
    unidades_regional = {
        fila['id_punto_venta__id_regional__nombre']: fila['unidades']
        for fila in registros.values('id_punto_venta__id_regional__nombre').annotate(
            unidades=Count('pk')
        )
    }
    por_regional = sorted(
        (
            {
                'regional': nombre,
                **_fila(unidades_regional.get(nombre, 0), meta_regional.get(nombre, 0.0)),
            }
            for nombre in set(unidades_regional) | set(meta_regional)
        ),
        key=lambda f: f['unidades'],
        reverse=True,
    )

    meta_punto = metas_por('id_punto_venta_id')
    nombres = dict(PuntoVentaPartner.objects.values_list('id_punto_venta', 'nombre_pdv'))
    unidades_punto = {
        fila['id_punto_venta_id']: fila['unidades']
        for fila in registros.values('id_punto_venta_id').annotate(unidades=Count('pk'))
    }
    por_punto = sorted(
        (
            {
                'codigo': codigo,
                'punto': nombres.get(codigo, codigo),
                **_fila(unidades_punto.get(codigo, 0), meta_punto.get(codigo, 0.0)),
            }
            for codigo in set(unidades_punto) | set(meta_punto)
        ),
        key=lambda f: f['unidades'],
        reverse=True,
    )

    # ── Ranking de promotores ──────────────────────────────────────────────
    por_promotor = [
        {
            'documento': fila['documento_promotor'],
            'unidades': fila['unidades'],
            'puntos': fila['puntos'],
            'marcas': fila['marcas'],
        }
        for fila in registros.values('documento_promotor')
        .annotate(
            unidades=Count('pk'),
            puntos=Count('id_punto_venta', distinct=True),
            marcas=Count('marca', distinct=True),
        )
        .order_by('-unidades')[:15]
    ]

    # ── Detalle punto × marca, como la tabla del Power BI ──────────────────
    detalle_unidades = {
        (fila['id_punto_venta_id'], fila['marca']): fila['unidades']
        for fila in registros.values('id_punto_venta_id', 'marca').annotate(unidades=Count('pk'))
    }
    detalle_metas = {
        (fila['id_punto_venta_id'], fila['marca']): float(fila['meta'] or 0)
        for fila in metas.values('id_punto_venta_id', 'marca').annotate(meta=Sum('meta_unidades'))
    }
    detalle = sorted(
        (
            {
                'codigo': codigo,
                'punto': nombres.get(codigo, codigo),
                'marca': nombre_marca,
                **_fila(
                    detalle_unidades.get((codigo, nombre_marca), 0),
                    detalle_metas.get((codigo, nombre_marca), 0.0),
                ),
            }
            for codigo, nombre_marca in set(detalle_unidades) | set(detalle_metas)
        ),
        key=lambda f: (-f['unidades'], f['punto'], f['marca']),
    )

    return Response(
        {
            'filtros': {
                'anio': anio,
                'mes': mes,
                'regional': regional,
                'punto': punto,
                'marca': marca,
                'promotor': promotor,
                'periodo': f'{NOMBRE_DEL_MES[mes]} {anio}' if mes else f'Año {anio}',
            },
            'totales': {
                **_fila(unidades, meta_total),
                'valor': valor,
                'promotores': registros.values('documento_promotor').distinct().count(),
                'puntos': registros.values('id_punto_venta').distinct().count(),
            },
            'por_marca': por_marca,
            'por_dia': por_dia,
            'por_regional': por_regional,
            'por_punto': por_punto,
            'por_promotor': por_promotor,
            'detalle': detalle,
        }
    )
