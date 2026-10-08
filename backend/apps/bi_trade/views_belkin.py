"""
Plan Recomiéndame Belkin: el formulario de recomendaciones y sus catálogos.

Registrar una recomendación solo pide tener la aplicación. Mantener los
catálogos —regionales, puntos de venta, asesores Apple, categorías y
productos— y corregir o borrar un registro pide `bi-trade:data:manage`.

Lo que se cambia en un catálogo cambia el formulario y también lo ya cargado:
el registro no copia la regional ni la categoría, las lee del punto y del
producto cada vez.
"""
from calendar import monthrange
from datetime import date

from django.db.models import Count, Max, Sum
from django.db.models.functions import TruncMonth
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.core.excel import ColumnaExport, construir_export

from .api_permissions import HasBiTradeApp, ReadOnlyOrCanManage
from .belkin import TOPE_BONO, calcular_bono, escalones_por_categoria, siguiente_bono
from .models import (
    AsesorApple,
    CategoriaBelkin,
    FuenteRegistroBelkin,
    ProductoBelkin,
    PuntoVentaBelkin,
    RegionalBelkin,
    RegistroBelkin,
    Venta,
)
from .serializers import (
    AsesorAppleSerializer,
    CategoriaBelkinSerializer,
    ProductoBelkinSerializer,
    PuntoVentaBelkinSerializer,
    RegionalBelkinSerializer,
    RegistroBelkinSerializer,
)
from .views import PaginacionListado
from .views_partners import NOMBRE_DEL_MES, PuedeRegistrar, _en_uso

#: Cómo se nombra en el tablero un punto sin regional.
FUERA_DE_COLTRADE = 'Fuera de Coltrade'
#: El valor del filtro de regional que pide esos puntos.
FILTRO_FUERA = 'fuera'


class RegionalBelkinViewSet(viewsets.ModelViewSet):
    queryset = RegionalBelkin.objects.annotate(
        conteo_puntos_venta=Count('puntos_venta')
    ).order_by('nombre')
    serializer_class = RegionalBelkinSerializer
    permission_classes = [HasBiTradeApp, ReadOnlyOrCanManage]
    search_fields = ('nombre',)
    filterset_fields = ('activa',)
    pagination_class = None

    def destroy(self, request, *args, **kwargs):
        regional = self.get_object()
        bloqueo = _en_uso(
            regional.nombre, [('punto(s) de venta', regional.puntos_venta.count())]
        )
        return bloqueo or super().destroy(request, *args, **kwargs)


class PuntoVentaBelkinViewSet(viewsets.ModelViewSet):
    queryset = (
        PuntoVentaBelkin.objects.select_related('id_regional')
        .annotate(
            conteo_asesores=Count('asesores', distinct=True),
            conteo_registros=Count('registros', distinct=True),
        )
        .order_by('nombre_pdv')
    )
    serializer_class = PuntoVentaBelkinSerializer
    permission_classes = [HasBiTradeApp, ReadOnlyOrCanManage]
    search_fields = ('id_punto_venta', 'nombre_pdv')
    filterset_fields = ('id_regional', 'categoria', 'activo')
    pagination_class = None

    def destroy(self, request, *args, **kwargs):
        punto = self.get_object()
        bloqueo = _en_uso(
            punto.nombre_pdv,
            [
                ('asesor(es)', punto.asesores.count()),
                ('registro(s)', punto.registros.count()),
            ],
        )
        return bloqueo or super().destroy(request, *args, **kwargs)


class AsesorAppleViewSet(viewsets.ModelViewSet):
    queryset = (
        AsesorApple.objects.select_related('id_punto_venta', 'id_punto_venta__id_regional')
        .annotate(conteo_registros=Count('registros'))
        .order_by('nombre')
    )
    serializer_class = AsesorAppleSerializer
    permission_classes = [HasBiTradeApp, ReadOnlyOrCanManage]
    search_fields = ('nombre', 'id_punto_venta__id_punto_venta', 'id_punto_venta__nombre_pdv')
    filterset_fields = ('id_punto_venta', 'activo')
    pagination_class = None

    def destroy(self, request, *args, **kwargs):
        asesor = self.get_object()
        bloqueo = _en_uso(asesor.nombre, [('registro(s)', asesor.registros.count())])
        return bloqueo or super().destroy(request, *args, **kwargs)


class CategoriaBelkinViewSet(viewsets.ModelViewSet):
    queryset = CategoriaBelkin.objects.annotate(conteo_productos=Count('productos')).order_by(
        'nombre'
    )
    serializer_class = CategoriaBelkinSerializer
    permission_classes = [HasBiTradeApp, ReadOnlyOrCanManage]
    search_fields = ('nombre',)
    filterset_fields = ('activa',)
    pagination_class = None

    def destroy(self, request, *args, **kwargs):
        categoria = self.get_object()
        bloqueo = _en_uso(categoria.nombre, [('producto(s)', categoria.productos.count())])
        return bloqueo or super().destroy(request, *args, **kwargs)


class ProductoBelkinViewSet(viewsets.ModelViewSet):
    queryset = (
        ProductoBelkin.objects.select_related('id_categoria')
        .annotate(conteo_registros=Count('registros'))
        .order_by('nombre_producto')
    )
    serializer_class = ProductoBelkinSerializer
    permission_classes = [HasBiTradeApp, ReadOnlyOrCanManage]
    search_fields = ('id_producto', 'nombre_producto')
    filterset_fields = ('id_categoria', 'activo')
    pagination_class = None

    def destroy(self, request, *args, **kwargs):
        producto = self.get_object()
        bloqueo = _en_uso(producto.nombre_producto, [('registro(s)', producto.registros.count())])
        return bloqueo or super().destroy(request, *args, **kwargs)


class RegistroBelkinViewSet(viewsets.ModelViewSet):
    queryset = RegistroBelkin.objects.select_related(
        'id_punto_venta',
        'id_punto_venta__id_regional',
        'id_asesor',
        'id_producto',
        'id_producto__id_categoria',
        'registrado_por',
        'enlace',
    ).order_by('-fecha_recomendacion', '-id_registro')
    serializer_class = RegistroBelkinSerializer
    permission_classes = [HasBiTradeApp, PuedeRegistrar]
    pagination_class = PaginacionListado
    filterset_fields = ('id_punto_venta', 'id_asesor', 'id_producto', 'fuente')
    search_fields = (
        'id_punto_venta__id_punto_venta',
        'id_punto_venta__nombre_pdv',
        'id_punto_venta__id_regional__nombre',
        'id_asesor__nombre',
        'id_producto__id_producto',
        'id_producto__nombre_producto',
        'id_producto__id_categoria__nombre',
        'observacion',
    )

    def perform_create(self, serializer):
        serializer.save(registrado_por=self.request.user)


def catalogos_belkin() -> dict:
    """Los desplegables del formulario, solo con lo activo.

    Cada punto viaja con su regional, cada asesor con su punto y cada producto
    con su categoría: el formulario va filtrando uno con el otro, como hacían
    las columnas «Zona Norte / Zona Sur» y «Case Apple / Lámina / …» del
    formulario anterior.

    Vive aparte de la vista porque el enlace público sirve exactamente lo
    mismo: el formulario es el mismo, con cuenta o sin ella.
    """
    regionales = RegionalBelkin.objects.filter(activa=True)
    puntos = PuntoVentaBelkin.objects.filter(activo=True, id_regional__activa=True)
    asesores = AsesorApple.objects.filter(activo=True)
    categorias = CategoriaBelkin.objects.filter(activa=True)
    productos = ProductoBelkin.objects.filter(activo=True, id_categoria__activa=True)
    return {
        'regionales': [{'value': r.pk, 'label': r.nombre} for r in regionales],
        'puntos_venta': [
            {'value': p.pk, 'label': p.etiqueta, 'id_regional': p.id_regional_id}
            for p in puntos
        ],
        'asesores': [
            {'value': a.pk, 'label': a.nombre, 'id_punto_venta': a.id_punto_venta_id}
            for a in asesores
        ],
        'categorias': [{'value': c.pk, 'label': c.nombre} for c in categorias],
        'productos': [
            {'value': p.pk, 'label': p.etiqueta, 'id_categoria': p.id_categoria_id}
            for p in productos
        ],
    }


@api_view(['GET'])
@permission_classes([HasBiTradeApp])
def opciones_belkin(request):
    """Los desplegables del formulario, para quien entra con su cuenta."""
    return Response(catalogos_belkin())


# ── Tablero del plan ───────────────────────────────────────────────────────


def _periodo(params) -> tuple[int, int]:
    """
    El mes que se pidió. Sin `anio` y `mes`, el último con registros: el bono
    se liquida a mes vencido y abrir el tablero vacío en el mes que empieza no
    le sirve a nadie.
    """
    anio = (params.get('anio') or '').strip()
    mes = (params.get('mes') or '').strip()
    if anio.isdigit() and mes.isdigit() and 1 <= int(mes) <= 12:
        return int(anio), int(mes)
    ultimo = RegistroBelkin.objects.aggregate(f=Max('fecha_recomendacion'))['f']
    referencia = ultimo or timezone.localdate()
    return referencia.year, referencia.month


def _periodos_disponibles(anio: int, mes: int) -> list[dict]:
    """Los meses con registros, más el elegido y el que corre, del más nuevo al más viejo."""
    hoy = timezone.localdate()
    meses = {
        (f.year, f.month)
        for f in RegistroBelkin.objects.annotate(m=TruncMonth('fecha_recomendacion'))
        .values_list('m', flat=True)
        .distinct()
        if f
    }
    meses |= {(anio, mes), (hoy.year, hoy.month)}
    return [
        {'anio': a, 'mes': m, 'label': f'{NOMBRE_DEL_MES[m]} {a}'}
        for a, m in sorted(meses, reverse=True)
    ]


def _opciones_de_filtro() -> dict:
    """
    Lo que piden los filtros del tablero, y nada más: regionales y puntos con
    su código y nombre. Va dentro del tablero para que el enlace público no
    tenga que abrir las listas del plan.
    """
    return {
        'regionales': [
            {'value': str(r.pk), 'label': r.nombre}
            for r in RegionalBelkin.objects.filter(activa=True)
        ]
        + [{'value': FILTRO_FUERA, 'label': FUERA_DE_COLTRADE}],
        'puntos': [
            {
                'value': p.pk,
                'label': p.etiqueta,
                'regional': str(p.id_regional_id) if p.id_regional_id else FILTRO_FUERA,
            }
            for p in PuntoVentaBelkin.objects.filter(activo=True)
        ],
    }


def _regional(punto: PuntoVentaBelkin) -> str:
    return punto.id_regional.nombre if punto.id_regional_id else FUERA_DE_COLTRADE


def _vacio() -> dict:
    return {'formulario': 0, 'informe': 0, 'bono': 0, 'promotores': 0}


@api_view(['GET'])
@permission_classes([HasBiTradeApp])
def dashboard_belkin(request):
    """
    El tablero del plan: recomendaciones del mes, el bono de cada promotor y
    lo que Claro vendió de los mismos productos.

    Recibe `anio`, `mes`, `regional` (su id, o `fuera` para los puntos sin
    regional) y `punto`. El bono es por promotor dentro de su punto, con la
    categoría del punto, sobre todo lo que registró en el mes; así lo liquidaba
    el Power BI. Un registro sin asesor cuenta como un promotor aparte.

    Las ventas de Claro solo se cruzan para los puntos de Coltrade. Los de
    fuera no están en el catálogo de Claro, y lo que venden ya son sus
    registros del informe: ahí lo vendido y lo recomendado es lo mismo.
    """
    return Response(_calcular_tablero(request.query_params))


#: Las columnas del Excel de «Recomendado contra vendido, por punto».
COLUMNAS_PUNTOS = [
    ColumnaExport('Centro de costos', 'codigo'),
    ColumnaExport('Punto de venta', 'punto'),
    ColumnaExport('Regional', 'regional'),
    ColumnaExport('Categoría', 'categoria', 'entero'),
    ColumnaExport('Asesores', 'asesores'),
    ColumnaExport('Recomendaciones del formulario', 'formulario', 'entero'),
    ColumnaExport('Recomendaciones del informe', 'informe', 'entero'),
    ColumnaExport('Total recomendaciones', 'recomendaciones', 'entero'),
    ColumnaExport('Ventas Claro', 'ventas', 'entero'),
    ColumnaExport('Bono', 'bono', 'dinero'),
]


@api_view(['GET'])
@permission_classes([HasBiTradeApp])
def exportar_puntos_belkin(request):
    """
    «Recomendado contra vendido, por punto» en .xlsx, con los filtros de la
    pantalla.

    A diferencia del tablero, que solo muestra los puntos que movieron algo en
    el mes, el archivo trae todos los puntos activos del filtro —y los
    inactivos que sí tuvieron datos—, en cero si no registraron ni vendieron:
    es la lista con la que se revisa quién falta.
    """
    datos = _calcular_tablero(request.query_params, todos_los_puntos=True)
    filtros = datos['filtros']
    respuesta = HttpResponse(
        construir_export('Por punto de venta', COLUMNAS_PUNTOS, datos['por_punto']),
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    respuesta['Content-Disposition'] = (
        f'attachment; filename="belkin-puntos-{filtros["anio"]}-{filtros["mes"]:02d}.xlsx"'
    )
    return respuesta


def _calcular_tablero(params, todos_los_puntos: bool = False) -> dict:
    """
    Lo que muestra el tablero. Con `todos_los_puntos`, el corte por punto trae
    también los que no tuvieron nada en el mes, con sus asesores: es lo que
    baja el Excel.
    """
    anio, mes = _periodo(params)
    regional = (params.get('regional') or '').strip()
    punto = (params.get('punto') or '').strip()

    puntos_qs = PuntoVentaBelkin.objects.select_related('id_regional')
    if regional == FILTRO_FUERA:
        puntos_qs = puntos_qs.filter(id_regional__isnull=True)
    elif regional.isdigit():
        puntos_qs = puntos_qs.filter(id_regional_id=int(regional))
    if punto:
        puntos_qs = puntos_qs.filter(pk=punto)
    puntos = {p.pk: p for p in puntos_qs}

    registros = RegistroBelkin.objects.filter(
        fecha_recomendacion__year=anio,
        fecha_recomendacion__month=mes,
        id_punto_venta_id__in=list(puntos),
    )
    del_informe = registros.filter(fuente=FuenteRegistroBelkin.INFORME)
    ventas = Venta.objects.filter(
        fecha_venta__year=anio,
        fecha_venta__month=mes,
        id_punto_venta_id__in=[c for c, p in puntos.items() if p.id_regional_id is not None],
        id_producto_id__in=ProductoBelkin.objects.values('id_producto'),
    )

    # ── Promotores y su bono ───────────────────────────────────────────────
    acumulado: dict[tuple, dict] = {}
    for fila in registros.values(
        'id_punto_venta_id', 'id_asesor_id', 'id_asesor__nombre', 'fuente'
    ).annotate(n=Count('pk')):
        clave = (fila['id_punto_venta_id'], fila['id_asesor_id'])
        datos = acumulado.setdefault(
            clave, {'asesor': fila['id_asesor__nombre'] or '', 'formulario': 0, 'informe': 0}
        )
        datos[fila['fuente']] += fila['n']

    promotores = []
    for (codigo, id_asesor), datos in acumulado.items():
        pdv = puntos[codigo]
        total = datos['formulario'] + datos['informe']
        promotores.append(
            {
                'codigo': codigo,
                'punto': pdv.nombre_pdv,
                'regional': _regional(pdv),
                'categoria': pdv.categoria,
                'id_asesor': id_asesor,
                'asesor': datos['asesor'],
                'formulario': datos['formulario'],
                'informe': datos['informe'],
                'recomendaciones': total,
                'bono': calcular_bono(total, pdv.categoria),
                'siguiente': siguiente_bono(total, pdv.categoria),
            }
        )
    promotores.sort(key=lambda f: (-f['bono'], -f['recomendaciones'], f['punto'], f['asesor']))

    # ── Recomendado contra vendido, por punto ──────────────────────────────
    ventas_punto = {
        fila['id_punto_venta_id']: fila['n']
        for fila in ventas.values('id_punto_venta_id').annotate(n=Sum('cantidad_vendida'))
    }
    acumulado_punto: dict[str, dict] = {}
    for fila in promotores:
        datos = acumulado_punto.setdefault(fila['codigo'], _vacio())
        datos['formulario'] += fila['formulario']
        datos['informe'] += fila['informe']
        datos['bono'] += fila['bono']
        datos['promotores'] += 1
    codigos = set(acumulado_punto) | set(ventas_punto)
    asesores_del_punto: dict[str, list[str]] = {}
    if todos_los_puntos:
        codigos |= {codigo for codigo, pdv in puntos.items() if pdv.activo}
        for codigo, nombre in AsesorApple.objects.filter(
            activo=True, id_punto_venta__in=codigos
        ).values_list('id_punto_venta', 'nombre'):
            asesores_del_punto.setdefault(codigo, []).append(nombre)
    por_punto = []
    for codigo in codigos:
        pdv = puntos[codigo]
        datos = acumulado_punto.get(codigo, _vacio())
        fuera = pdv.id_regional_id is None
        fila = {
            'codigo': codigo,
            'punto': pdv.nombre_pdv,
            'regional': _regional(pdv),
            'fuera_de_coltrade': fuera,
            'categoria': pdv.categoria,
            **datos,
            'recomendaciones': datos['formulario'] + datos['informe'],
            'ventas': datos['informe'] if fuera else ventas_punto.get(codigo, 0),
        }
        if todos_los_puntos:
            fila['asesores'] = ', '.join(sorted(asesores_del_punto.get(codigo, [])))
        por_punto.append(fila)
    por_punto.sort(key=lambda f: (-f['recomendaciones'], -f['ventas'], f['punto']))

    # ── Día a día ──────────────────────────────────────────────────────────
    hoy = timezone.localdate()
    ultimo_dia = monthrange(anio, mes)[1]
    if (anio, mes) == (hoy.year, hoy.month):
        ultimo_dia = hoy.day
    elif date(anio, mes, 1) > hoy:
        ultimo_dia = 0
    recomendaciones_dia = dict(
        registros.values_list('fecha_recomendacion').annotate(n=Count('pk'))
    )
    informe_dia = dict(del_informe.values_list('fecha_recomendacion').annotate(n=Count('pk')))
    ventas_dia = dict(ventas.values_list('fecha_venta').annotate(n=Sum('cantidad_vendida')))
    por_dia = []
    for dia in range(1, ultimo_dia + 1):
        fecha = date(anio, mes, dia)
        por_dia.append(
            {
                'fecha': fecha,
                'recomendaciones': recomendaciones_dia.get(fecha, 0),
                'ventas': ventas_dia.get(fecha, 0) + informe_dia.get(fecha, 0),
            }
        )

    # ── Qué se recomienda ──────────────────────────────────────────────────
    por_categoria = [
        {'categoria': fila['id_producto__id_categoria__nombre'], 'recomendaciones': fila['n']}
        for fila in registros.values('id_producto__id_categoria__nombre')
        .annotate(n=Count('pk'))
        .order_by('-n')
    ]

    formulario = sum(f['formulario'] for f in promotores)
    informe = sum(f['informe'] for f in promotores)
    fechas_de_venta = [
        ventas.aggregate(f=Max('fecha_venta'))['f'],
        del_informe.aggregate(f=Max('fecha_recomendacion'))['f'],
    ]

    return {
        'filtros': {
            'anio': anio,
            'mes': mes,
            'regional': regional,
            'punto': punto,
            'periodo': f'{NOMBRE_DEL_MES[mes]} {anio}',
        },
        'periodos': _periodos_disponibles(anio, mes),
        'opciones': _opciones_de_filtro(),
        'totales': {
            'recomendaciones': formulario + informe,
            'formulario': formulario,
            'informe': informe,
            'ventas': sum(f['ventas'] for f in por_punto),
            'bono': sum(f['bono'] for f in promotores),
            'promotores': len(promotores),
            'promotores_con_bono': sum(1 for f in promotores if f['bono']),
            'puntos': len(acumulado_punto),
            # Hasta qué día hay ventas cargadas: el informe se sube cada tanto.
            'ventas_hasta': max(filter(None, fechas_de_venta), default=None),
            'ultimo_registro': RegistroBelkin.objects.aggregate(f=Max('created_at'))['f'],
        },
        'promotores': promotores,
        'por_punto': por_punto,
        'por_dia': por_dia,
        'por_categoria': por_categoria,
        'escalones': escalones_por_categoria(),
        'tope_bono': TOPE_BONO,
    }
