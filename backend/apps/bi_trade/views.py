"""
BI Trade Marketing: CRUD de puntos de venta, productos y ventas, más el
tablero que resume todo.

Leer exige tener la aplicación; escribir exige `bi-trade:data:manage`, que se
reparte con roles desde Administración.
"""
from datetime import datetime

from django.db import transaction
from django.db.models import Count, F, IntegerField, Q, Sum, Value
from django.db.models.functions import Coalesce, TruncMonth
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, parser_classes, permission_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from apps.core.pagination import StandardPagination

from .api_permissions import CanManageData, HasBiTradeApp, ReadOnlyOrCanManage
from .calendario import dias_del_mes, dias_habiles, es_habil, festivos
from .canales import CLARO, Canal
from .excel import (
    Columna,
    ColumnaExport,
    ErrorDeFila,
    construir_export,
    construir_export_multihoja,
    construir_plantilla,
    leer_archivo,
)
from .filters import InventarioFilter, MetaFilter, VentaFilter
from .informe import ErrorDeInforme, leer_informe
from .models import (
    Campana,
    Inventario,
    Materiales,
    MetaComercial,
    Producto,
    PuntoVenta,
    Regional,
    Venta,
    anotaciones_meta,
)
from .serializers import (
    CampanaSerializer,
    InventarioSerializer,
    MetaSerializer,
    ProductoSerializer,
    PuntoVentaSerializer,
    VentaSerializer,
)
from .tickets import calcular_tickets, participa


class PaginacionListado(StandardPagination):
    """
    Quince filas por página.

    Los listados de BI se leen en pantalla, no se recorren de arriba a abajo:
    con quince filas la tabla entra completa sin desplazarse, y los totales de
    verdad están en las tarjetas de arriba, que suman todo lo filtrado.
    """

    page_size = 15


class _AbortarImportacion(Exception):
    """Corta la transacción de importación para que no quede nada a medias."""


def _lista_en_espanol(partes: list[str]) -> str:
    """['a', 'b', 'c'] → 'a, b y c'."""
    if len(partes) == 1:
        return partes[0]
    return ', '.join(partes[:-1]) + ' y ' + partes[-1]


class BiTradeViewSet(viewsets.ModelViewSet):
    """Base: cualquiera con la app consulta; solo quien tiene el permiso edita."""

    pagination_class = None
    permission_classes = [HasBiTradeApp, ReadOnlyOrCanManage]

    #: Cómo se nombra el conjunto en los mensajes ("los productos").
    nombre_plural = 'los registros'

    def dependencias(self) -> list[tuple[str, int]]:
        """Qué cuelga de esta tabla e impide vaciarla: (etiqueta, cantidad)."""
        return []

    # ── Totales y exportación ──────────────────────────────────────────────

    def anotaciones(self) -> dict:
        """Columnas calculadas que necesitan el resumen o la exportación."""
        return {}

    def agregados(self) -> dict:
        """Qué suma el resumen. Las llaves son las del JSON que se devuelve."""
        return {}

    @action(detail=False, methods=['get'], url_path='resumen')
    def resumen(self, request):
        """
        Los totales de lo filtrado, no de la página.

        Existe aparte del listado justamente por eso: la tabla trae 15 filas,
        pero las tarjetas de arriba tienen que sumar los mil registros que
        cumplen el filtro. Se resuelve con un `aggregate` en la base, así que
        da igual cuántos registros haya.
        """
        consulta = self.filter_queryset(self.get_queryset())
        anotaciones = self.anotaciones()
        if anotaciones:
            consulta = consulta.annotate(**anotaciones)

        totales = consulta.aggregate(registros=Count('pk'), **self.agregados())
        return Response({clave: valor or 0 for clave, valor in totales.items()})

    #: Columnas del .xlsx que se descarga. Vacío = el recurso no se exporta.
    columnas_exportacion: list[ColumnaExport] = []
    #: Nombre del archivo exportado, sin extensión ni fecha.
    archivo_exportacion = 'export'

    @action(detail=False, methods=['get'], url_path='exportar')
    def exportar(self, request):
        """
        Descarga en .xlsx lo que hay bajo el filtro actual, completo.

        No es la página que se está viendo: si el filtro deja 3.000 registros,
        el archivo trae los 3.000. Es un volcado de datos, no la plantilla de
        importación.
        """
        if not self.columnas_exportacion:
            return Response(
                {'code': 'invalid', 'message': 'Este listado no se puede exportar.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        consulta = self.filter_queryset(self.get_queryset())
        anotaciones = self.anotaciones()
        if anotaciones:
            consulta = consulta.annotate(**anotaciones)

        campos = [columna.campo for columna in self.columnas_exportacion]
        # `values()` en vez de instanciar modelos: una sola consulta plana, sin
        # una vuelta a la base por cada relación de cada fila.
        filas = list(consulta.values(*campos))

        contenido = construir_export(
            f'{self.nombre_plural}'.replace('los ', '').replace('las ', '').title(),
            self.columnas_exportacion,
            filas,
        )
        marca = timezone.localtime().strftime('%Y%m%d-%H%M')
        respuesta = HttpResponse(
            contenido,
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        respuesta['Content-Disposition'] = (
            f'attachment; filename="{self.archivo_exportacion}-{marca}.xlsx"'
        )
        return respuesta

    @action(
        detail=False,
        methods=['delete'],
        url_path='eliminar-todos',
        permission_classes=[HasBiTradeApp, CanManageData],
    )
    def eliminar_todos(self, request):
        """Vacía la tabla completa, si nada depende de ella.

        La ruta es `eliminar-todos` y no `todos` para que nunca se confunda con
        el detalle de un registro cuyo código fuera justamente ese.
        """
        bloqueos = [(etiqueta, n) for etiqueta, n in self.dependencias() if n]
        if bloqueos:
            detalle = _lista_en_espanol([f'{n} {etiqueta}' for etiqueta, n in bloqueos])
            return Response(
                {
                    'code': 'protected',
                    'message': (
                        f'No es posible eliminar {self.nombre_plural} porque hay '
                        f'{detalle} asociadas. Elimina primero esos registros.'
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        modelo = self.get_queryset().model
        borrados = modelo.objects.count()
        modelo.objects.all().delete()
        return Response(
            {
                'deleted': borrados,
                'message': (
                    f'Se eliminaron {borrados} registro(s).'
                    if borrados
                    else 'No había registros que eliminar.'
                ),
            }
        )

    # ── Excel ──────────────────────────────────────────────────────────────

    #: Columnas de la plantilla. De aquí sale también el lector del importador.
    columnas_excel: list[Columna] = []
    #: Nombre del archivo de plantilla, sin extensión.
    archivo_plantilla = 'plantilla'
    #: Aviso extra que se imprime en la hoja de instrucciones.
    nota_plantilla = ''

    def buscar_existente(self, fila: dict):
        """Registro que ya existe para esa fila, si el modelo tiene clave natural.

        Devolverlo hace que la importación actualice en vez de duplicar.
        """
        return None

    def fila_a_payload(self, fila: dict) -> dict:
        """Traduce los encabezados de la plantilla a campos del serializer."""
        return {clave: valor for clave, valor in fila.items() if clave != '_fila'}

    @action(
        detail=False,
        methods=['get'],
        url_path='plantilla',
        permission_classes=[HasBiTradeApp, CanManageData],
    )
    def plantilla(self, request):
        """Descarga el .xlsx en blanco con los encabezados y las instrucciones."""
        contenido = construir_plantilla(
            f'Plantilla de {self.nombre_plural}',
            self.columnas_excel,
            self.nota_plantilla,
        )
        marca = timezone.localtime().strftime('%Y%m%d')
        respuesta = HttpResponse(
            contenido,
            content_type=(
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            ),
        )
        respuesta['Content-Disposition'] = (
            f'attachment; filename="{self.archivo_plantilla}-{marca}.xlsx"'
        )
        return respuesta

    @action(
        detail=False,
        methods=['post'],
        url_path='importar',
        permission_classes=[HasBiTradeApp, CanManageData],
    )
    def importar(self, request):
        """
        Carga un .xlsx armado con la plantilla.

        Es todo o nada: si una sola fila falla no se guarda ninguna, y se
        devuelven todos los errores con su número de fila. Así se corrige el
        archivo de una vez y no queda media importación a medio camino.
        """
        archivo = request.FILES.get('archivo')
        if archivo is None:
            return Response(
                {'code': 'invalid', 'message': 'No llegó ningún archivo.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not archivo.name.lower().endswith('.xlsx'):
            return Response(
                {
                    'code': 'invalid',
                    'message': 'El archivo debe ser un Excel .xlsx. Descarga la plantilla.',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            filas, errores = leer_archivo(archivo, self.columnas_excel)
        except ErrorDeFila as exc:
            return Response(
                {'code': 'invalid', 'message': str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        creados = actualizados = 0
        if not errores:
            try:
                with transaction.atomic():
                    for fila in filas:
                        instancia = self.buscar_existente(fila)
                        serializer = self.get_serializer(
                            instancia, data=self.fila_a_payload(fila), partial=bool(instancia)
                        )
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
                        serializer.save()
                        if instancia is None:
                            creados += 1
                        else:
                            actualizados += 1
                    if errores:
                        raise _AbortarImportacion
            except _AbortarImportacion:
                creados = actualizados = 0

        if errores:
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

        if not filas:
            return Response(
                {
                    'code': 'invalid',
                    'message': 'El archivo no tiene filas con datos.',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        partes = []
        if creados:
            partes.append(f'{creados} creado(s)')
        if actualizados:
            partes.append(f'{actualizados} actualizado(s)')
        return Response(
            {
                'created': creados,
                'updated': actualizados,
                'message': 'Importación lista: ' + ' y '.join(partes) + '.',
            }
        )



class PuntoVentaViewSet(BiTradeViewSet):
    queryset = PuntoVenta.objects.prefetch_related('ventas').order_by('nombre_pdv')
    serializer_class = PuntoVentaSerializer
    search_fields = ('id_punto_venta', 'nombre_pdv')
    filterset_fields = ('regional', 'materiales')
    nombre_plural = 'los puntos de venta'
    archivo_plantilla = 'plantilla-puntos-venta'
    nota_plantilla = (
        'Si el código ya existe, la fila actualiza ese punto de venta en vez de duplicarlo.'
    )
    columnas_excel = [
        Columna('id_punto_venta', ayuda='Código del punto de venta. Máximo 60 caracteres.',
                ejemplo='PDV-001'),
        Columna('nombre_pdv', ayuda='Máximo 100 caracteres.', ejemplo='Claro Centro Mayor'),
        Columna('regional', tipo='opcion', obligatoria=False, opciones=list(Regional.values),
                ejemplo=Regional.ZONA_NORTE.value),
        Columna('materiales', tipo='opcion', obligatoria=False, opciones=list(Materiales.values),
                ejemplo=Materiales.TODOS.value),
    ]

    def buscar_existente(self, fila):
        return PuntoVenta.objects.filter(pk=fila.get('id_punto_venta')).first()

    def dependencias(self):
        return [
            ('ventas', Venta.objects.count()),
            ('registros de inventario', Inventario.objects.count()),
            ('metas', MetaComercial.objects.count()),
        ]

    def destroy(self, request, *args, **kwargs):
        punto = self.get_object()
        if punto.ventas.exists():
            return Response(
                {
                    'code': 'protected',
                    'message': (
                        f'«{punto.nombre_pdv}» tiene {punto.ventas.count()} venta(s) registradas. '
                        'Borra primero esas ventas si de verdad quieres eliminarlo.'
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)


class ProductoViewSet(BiTradeViewSet):
    queryset = Producto.objects.prefetch_related('ventas').order_by('nombre_producto')
    serializer_class = ProductoSerializer
    search_fields = ('id_producto', 'nombre_producto', 'marca')
    filterset_fields = ('marca',)
    nombre_plural = 'los productos'
    archivo_plantilla = 'plantilla-productos'
    nota_plantilla = (
        'Si el código ya existe, la fila actualiza ese producto en vez de duplicarlo. '
        'Los precios van en pesos, sin decimales ni puntos de miles.'
    )
    columnas_excel = [
        Columna('id_producto', ayuda='Código del producto. Máximo 60 caracteres.',
                ejemplo='SKU-1001'),
        Columna('nombre_producto', ayuda='Máximo 60 caracteres.', ejemplo='Samsung Galaxy A55'),
        Columna('marca', ayuda='Máximo 60 caracteres.', ejemplo='Samsung'),
        Columna('precio_venta_claro', tipo='entero', ayuda='Hasta 100.000.000.',
                ejemplo='1299900'),
        Columna('precio_venta_coltrade', tipo='entero',
                ayuda='Hasta 100.000.000. Con este precio se calculan los ingresos.',
                ejemplo='1189900'),
        Columna('puntaje', tipo='entero', obligatoria=False,
                ayuda='Opcional. Se usa para la meta de puntos.', ejemplo='90'),
    ]

    def buscar_existente(self, fila):
        return Producto.objects.filter(pk=fila.get('id_producto')).first()

    def dependencias(self):
        return [
            ('ventas', Venta.objects.count()),
            ('registros de inventario', Inventario.objects.count()),
            ('metas', MetaComercial.objects.count()),
        ]

    def destroy(self, request, *args, **kwargs):
        producto = self.get_object()
        if producto.ventas.exists():
            return Response(
                {
                    'code': 'protected',
                    'message': (
                        f'«{producto.nombre_producto}» tiene {producto.ventas.count()} venta(s) '
                        'registradas. Borra primero esas ventas si de verdad quieres eliminarlo.'
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)


class VentaViewSet(BiTradeViewSet):
    queryset = Venta.objects.select_related('id_producto', 'id_punto_venta').order_by(
        '-fecha_venta', '-id_venta'
    )
    serializer_class = VentaSerializer
    pagination_class = PaginacionListado
    search_fields = (
        'id_producto__id_producto',
        'id_producto__nombre_producto',
        'id_producto__marca',
        'id_punto_venta__id_punto_venta',
        'id_punto_venta__nombre_pdv',
    )
    filterset_class = VentaFilter
    ordering_fields = ('fecha_venta', 'cantidad_vendida')
    nombre_plural = 'las ventas'
    archivo_plantilla = 'plantilla-ventas'
    archivo_exportacion = 'ventas'
    #: Los canales sin puntos lo apagan: ni suman puntos ni los exportan.
    con_puntos = True
    columnas_exportacion = [
        ColumnaExport('Fecha', 'fecha_venta', 'fecha'),
        ColumnaExport('Código producto', 'id_producto'),
        ColumnaExport('Producto', 'id_producto__nombre_producto'),
        ColumnaExport('Marca', 'id_producto__marca'),
        ColumnaExport('Código punto de venta', 'id_punto_venta'),
        ColumnaExport('Punto de venta', 'id_punto_venta__nombre_pdv'),
        ColumnaExport('Regional', 'id_punto_venta__regional'),
        ColumnaExport('Cantidad vendida', 'cantidad_vendida', 'entero'),
        ColumnaExport('Precio Coltrade', 'id_producto__precio_venta_coltrade', 'dinero'),
        ColumnaExport('Total', 'total', 'dinero'),
    ]

    def anotaciones(self):
        # El sufijo `_linea` evita que un alias del aggregate se llame igual
        # que su anotación: Django lo resolvería contra sí mismo y devolvería
        # cero sin avisar.
        anotaciones = {
            'total': F('cantidad_vendida') * F('id_producto__precio_venta_coltrade'),
        }
        if self.con_puntos:
            anotaciones['puntos_linea'] = F('cantidad_vendida') * Coalesce(
                'id_producto__puntaje', Value(0)
            )
        return anotaciones

    def agregados(self):
        agregados = {
            'unidades': Coalesce(Sum('cantidad_vendida'), Value(0)),
            'ingresos': Coalesce(Sum('total', output_field=IntegerField()), Value(0)),
            'productos': Count('id_producto', distinct=True),
            'puntos_venta': Count('id_punto_venta', distinct=True),
        }
        if self.con_puntos:
            agregados['puntos'] = Coalesce(
                Sum('puntos_linea', output_field=IntegerField()), Value(0)
            )
        return agregados
    nota_plantilla = (
        'Cada fila es una venta nueva: una venta no tiene código propio, así que volver a '
        'subir el mismo archivo duplica los registros. El producto y el punto de venta '
        'deben existir antes de importar.'
    )
    columnas_excel = [
        Columna('id_producto', ayuda='Código de un producto que ya exista.', ejemplo='SKU-1001'),
        Columna('id_punto_venta', ayuda='Código de un punto de venta que ya exista.',
                ejemplo='PDV-001'),
        Columna('fecha_venta', tipo='fecha', ayuda='Formato AAAA-MM-DD.', ejemplo='2026-03-15'),
        Columna('cantidad_vendida', tipo='entero', ayuda='Unidades vendidas. Mínimo 1.',
                ejemplo='3'),
    ]


class InventarioViewSet(BiTradeViewSet):
    queryset = Inventario.objects.select_related('id_producto', 'id_punto_venta').order_by(
        'id_punto_venta__nombre_pdv', 'id_producto__nombre_producto'
    )
    serializer_class = InventarioSerializer
    pagination_class = PaginacionListado
    search_fields = (
        'id_producto__id_producto',
        'id_producto__nombre_producto',
        'id_producto__marca',
        'id_punto_venta__id_punto_venta',
        'id_punto_venta__nombre_pdv',
    )
    filterset_class = InventarioFilter
    ordering_fields = ('cantidad_inventario',)
    nombre_plural = 'los registros de inventario'
    archivo_plantilla = 'plantilla-inventario'
    archivo_exportacion = 'inventario'
    columnas_exportacion = [
        ColumnaExport('Código producto', 'id_producto'),
        ColumnaExport('Producto', 'id_producto__nombre_producto'),
        ColumnaExport('Marca', 'id_producto__marca'),
        ColumnaExport('Código punto de venta', 'id_punto_venta'),
        ColumnaExport('Punto de venta', 'id_punto_venta__nombre_pdv'),
        ColumnaExport('Regional', 'id_punto_venta__regional'),
        ColumnaExport('Cantidad en inventario', 'cantidad_inventario', 'entero'),
        ColumnaExport('Precio Coltrade', 'id_producto__precio_venta_coltrade', 'dinero'),
        ColumnaExport('Valorizado', 'valorizado', 'dinero'),
    ]

    def anotaciones(self):
        return {
            'valorizado': F('cantidad_inventario') * F('id_producto__precio_venta_coltrade')
        }

    def agregados(self):
        return {
            'unidades': Coalesce(Sum('cantidad_inventario'), Value(0)),
            'valorizado_total': Coalesce(
                Sum('valorizado', output_field=IntegerField()), Value(0)
            ),
            'agotados': Count('pk', filter=Q(cantidad_inventario=0)),
            'productos': Count('id_producto', distinct=True),
            'puntos_venta': Count('id_punto_venta', distinct=True),
        }
    nota_plantilla = (
        'Hay un solo registro por producto y punto de venta: si ya existe, la fila '
        'actualiza la cantidad en vez de duplicarla.'
    )
    columnas_excel = [
        Columna('id_producto', ayuda='Código de un producto que ya exista.', ejemplo='SKU-1001'),
        Columna('id_punto_venta', ayuda='Código de un punto de venta que ya exista.',
                ejemplo='PDV-001'),
        Columna('cantidad_inventario', tipo='entero', ayuda='Existencias actuales. Cero = agotado.',
                ejemplo='24'),
    ]

    def buscar_existente(self, fila):
        return Inventario.objects.filter(
            id_producto=fila.get('id_producto'), id_punto_venta=fila.get('id_punto_venta')
        ).first()


class MetaViewSet(BiTradeViewSet):
    queryset = (
        MetaComercial.objects.select_related('id_producto', 'id_punto_venta')
        .annotate(**anotaciones_meta())
        .order_by('id_punto_venta__nombre_pdv', 'id_producto__nombre_producto')
    )
    serializer_class = MetaSerializer
    pagination_class = PaginacionListado
    search_fields = (
        'id_producto__id_producto',
        'id_producto__nombre_producto',
        'id_producto__marca',
        'id_punto_venta__id_punto_venta',
        'id_punto_venta__nombre_pdv',
    )
    filterset_class = MetaFilter
    ordering_fields = ('fecha_meta', 'meta_cantidad', 'dinero_meta', 'puntos_meta')
    nombre_plural = 'las metas'
    archivo_plantilla = 'plantilla-metas'
    archivo_exportacion = 'metas'
    #: Los canales sin puntos lo apagan: ni suman puntos ni los exportan.
    con_puntos = True
    columnas_exportacion = [
        ColumnaExport('Periodo', 'fecha_meta', 'fecha'),
        ColumnaExport('Código producto', 'id_producto'),
        ColumnaExport('Producto', 'id_producto__nombre_producto'),
        ColumnaExport('Marca', 'id_producto__marca'),
        ColumnaExport('Código punto de venta', 'id_punto_venta'),
        ColumnaExport('Punto de venta', 'id_punto_venta__nombre_pdv'),
        ColumnaExport('Regional', 'id_punto_venta__regional'),
        ColumnaExport('Meta unidades', 'meta_cantidad', 'entero'),
        ColumnaExport('Precio Coltrade', 'id_producto__precio_venta_coltrade', 'dinero'),
        ColumnaExport('Meta dinero', 'dinero_meta', 'dinero'),
        ColumnaExport('Meta puntos', 'puntos_meta', 'entero'),
    ]

    def agregados(self):
        agregados = {
            'meta_cantidad': Coalesce(Sum('meta_cantidad'), Value(0)),
            'meta_dinero': Coalesce(Sum('dinero_meta', output_field=IntegerField()), Value(0)),
            'productos': Count('id_producto', distinct=True),
            'puntos_venta': Count('id_punto_venta', distinct=True),
        }
        if self.con_puntos:
            agregados['meta_puntos'] = Coalesce(
                Sum('puntos_meta', output_field=IntegerField()), Value(0)
            )
        return agregados
    nota_plantilla = (
        'La meta se identifica por producto, punto de venta y fecha: si esa combinación '
        'ya existe la fila la actualiza, y si cambias la fecha se carga la meta de otro '
        'periodo sin pisar la anterior. Solo se carga la meta en unidades: el dinero y '
        'los puntos se calculan con el precio y el puntaje del producto.'
    )
    columnas_excel = [
        Columna('id_producto', ayuda='Código de un producto que ya exista.', ejemplo='SKU-1001'),
        Columna('id_punto_venta', ayuda='Código de un punto de venta que ya exista.',
                ejemplo='PDV-001'),
        Columna('fecha_meta', tipo='fecha',
                ayuda='Periodo de la meta, formato AAAA-MM-DD.', ejemplo='2026-03-01'),
        Columna('meta_cantidad', tipo='entero', ayuda='Unidades objetivo.', ejemplo='25'),

    ]

    def buscar_existente(self, fila):
        return MetaComercial.objects.filter(
            id_producto=fila.get('id_producto'),
            id_punto_venta=fila.get('id_punto_venta'),
            fecha_meta=fila.get('fecha_meta'),
        ).first()


def opciones_de(canal: Canal) -> dict:
    """Catálogos para los formularios y los filtros de un canal."""
    marcas = list(
        canal.producto.objects.exclude(marca='')
        .values_list('marca', flat=True)
        .distinct()
        .order_by('marca')
    )
    return {**canal.opciones, 'marcas': marcas}


@api_view(['GET'])
@permission_classes([HasBiTradeApp])
def opciones(request):
    """Catálogos para los formularios y los filtros."""
    return Response(opciones_de(CLARO))


@api_view(['GET'])
@permission_classes([HasBiTradeApp])
def dashboard(request):
    """
    El tablero de BI Claro punto de venta.

    Todo se calcula con agregaciones en la base, no trayendo las ventas a
    Python: la tabla de ventas es la que va a crecer.
    """
    ventas = Venta.objects.select_related('id_producto', 'id_punto_venta')

    regional = (request.query_params.get('regional') or '').strip()
    marca = (request.query_params.get('marca') or '').strip()
    if regional:
        ventas = ventas.filter(id_punto_venta__regional=regional)
    if marca:
        ventas = ventas.filter(id_producto__marca=marca)

    # Ingreso de cada línea: unidades × precio Coltrade.
    ingreso = F('cantidad_vendida') * F('id_producto__precio_venta_coltrade')
    con_ingreso = ventas.annotate(ingreso=ingreso)

    totales = con_ingreso.aggregate(
        unidades=Sum('cantidad_vendida'),
        ingresos=Sum('ingreso', output_field=IntegerField()),
        operaciones=Count('id_venta'),
    )
    unidades = totales['unidades'] or 0
    ingresos = totales['ingresos'] or 0

    def agrupar(campo: str, etiqueta: str, limite: int | None = None):
        filas = (
            con_ingreso.values(campo)
            .annotate(
                unidades=Sum('cantidad_vendida'),
                ingresos=Sum('ingreso', output_field=IntegerField()),
                operaciones=Count('id_venta'),
            )
            .order_by('-ingresos')
        )
        if limite:
            filas = filas[:limite]
        return [
            {
                'key': fila[campo] or 'Sin dato',
                'label': fila[campo] or 'Sin dato',
                'unidades': fila['unidades'] or 0,
                'ingresos': fila['ingresos'] or 0,
                'operaciones': fila['operaciones'],
                'participacion': round((fila['ingresos'] or 0) * 100.0 / ingresos, 1)
                if ingresos
                else 0.0,
            }
            for fila in filas
        ]

    evolucion = [
        {
            'mes': fila['mes'].isoformat() if fila['mes'] else None,
            'unidades': fila['unidades'] or 0,
            'ingresos': fila['ingresos'] or 0,
        }
        for fila in con_ingreso.annotate(mes=TruncMonth('fecha_venta'))
        .values('mes')
        .annotate(
            unidades=Sum('cantidad_vendida'),
            ingresos=Sum('ingreso', output_field=IntegerField()),
        )
        .order_by('mes')
    ]

    return Response(
        {
            'filtros': {'regional': regional, 'marca': marca},
            'totales': {
                'unidades': unidades,
                'ingresos': ingresos,
                'operaciones': totales['operaciones'],
                'ticket_promedio': round(ingresos / totales['operaciones'])
                if totales['operaciones']
                else 0,
                'puntos_venta': PuntoVenta.objects.count(),
                'productos': Producto.objects.count(),
            },
            'por_regional': agrupar('id_punto_venta__regional', 'regional'),
            'por_marca': agrupar('id_producto__marca', 'marca'),
            'top_productos': agrupar('id_producto__nombre_producto', 'producto', limite=8),
            'top_puntos_venta': agrupar('id_punto_venta__nombre_pdv', 'punto de venta', limite=8),
            'evolucion': evolucion,
            'materiales': agrupar('id_punto_venta__materiales', 'materiales'),
        }
    )


def _fecha(valor: str | None):
    """Lee un `?desde=AAAA-MM-DD` de la query string; None si no se entiende."""
    if not valor:
        return None
    try:
        return datetime.strptime(valor.strip(), '%Y-%m-%d').date()
    except ValueError:
        return None


def _porcentaje(real: int, meta: int) -> float:
    """Cumplimiento en %, sin dividir por cero cuando no hay meta cargada."""
    return round(real * 100.0 / meta, 1) if meta else 0.0


def _sin_puntos(datos):
    """
    La respuesta sin las medidas en puntos (`real_puntos`, `meta_puntos`…).

    Es para los canales que no miden en puntos: sus productos no tienen
    puntaje, así que esas llaves no deben salir.
    """
    if isinstance(datos, dict):
        return {
            clave: _sin_puntos(valor)
            for clave, valor in datos.items()
            if not clave.endswith('_puntos')
        }
    if isinstance(datos, list):
        return [_sin_puntos(valor) for valor in datos]
    return datos


@api_view(['GET'])
@permission_classes([HasBiTradeApp])
def cumplimiento(request):
    """
    Qué tanto de la meta se cumplió, y con cuánto inventario se cuenta.

    Cada medida se compara contra su propia meta:
      · unidades → meta_cantidad
      · dinero   → meta_dinero  (unidades x precio Coltrade)
      · puntos   → meta_puntos  (unidades x puntaje del producto)

    El inventario no tiene meta: se reporta como stock disponible y como
    cobertura sobre lo que ya se vendió.
    """
    ventas = Venta.objects.all()
    metas = MetaComercial.objects.annotate(**anotaciones_meta())
    inventarios = Inventario.objects.all()

    regional = (request.query_params.get('regional') or '').strip()
    marca = (request.query_params.get('marca') or '').strip()
    desde = _fecha(request.query_params.get('desde'))
    hasta = _fecha(request.query_params.get('hasta'))

    if regional:
        ventas = ventas.filter(id_punto_venta__regional=regional)
        metas = metas.filter(id_punto_venta__regional=regional)
        inventarios = inventarios.filter(id_punto_venta__regional=regional)
    if marca:
        ventas = ventas.filter(id_producto__marca=marca)
        metas = metas.filter(id_producto__marca=marca)
        inventarios = inventarios.filter(id_producto__marca=marca)

    # El periodo recorta cada lado por su propia fecha: las ventas por la fecha
    # en que ocurrieron y las metas por la fecha del periodo que representan.
    # El inventario es stock de hoy, así que no se filtra por fecha.
    if desde:
        ventas = ventas.filter(fecha_venta__gte=desde)
        metas = metas.filter(fecha_meta__gte=desde)
    if hasta:
        ventas = ventas.filter(fecha_venta__lte=hasta)
        metas = metas.filter(fecha_meta__lte=hasta)

    # El puntaje es nulable: sin Coalesce, un producto sin puntaje anularía
    # toda la suma de puntos.
    puntaje = Coalesce('id_producto__puntaje', Value(0))
    # Las anotaciones por línea NO pueden llamarse igual que los alias del
    # aggregate: Django resuelve el alias contra sí mismo y devuelve 0 sin
    # avisar. De ahí el sufijo.
    reales = ventas.annotate(
        dinero_linea=F('cantidad_vendida') * F('id_producto__precio_venta_coltrade'),
        puntos_linea=F('cantidad_vendida') * puntaje,
    )

    real = reales.aggregate(
        cantidad=Coalesce(Sum('cantidad_vendida'), Value(0)),
        dinero=Coalesce(Sum('dinero_linea', output_field=IntegerField()), Value(0)),
        puntos=Coalesce(Sum('puntos_linea', output_field=IntegerField()), Value(0)),
    )
    objetivo = metas.aggregate(
        cantidad=Coalesce(Sum('meta_cantidad'), Value(0)),
        dinero=Coalesce(Sum('dinero_meta', output_field=IntegerField()), Value(0)),
        puntos=Coalesce(Sum('puntos_meta', output_field=IntegerField()), Value(0)),
    )
    stock = inventarios.aggregate(
        unidades=Coalesce(Sum('cantidad_inventario'), Value(0)),
        registros=Count('id_inventario'),
    )

    def agrupar(campo: str, limite: int | None = None):
        """Cruza ventas, metas e inventario por una misma dimensión."""
        reales_por = {
            fila[campo]: fila
            for fila in reales.values(campo).annotate(
                cantidad=Coalesce(Sum('cantidad_vendida'), Value(0)),
                dinero=Coalesce(Sum('dinero_linea', output_field=IntegerField()), Value(0)),
                puntos=Coalesce(Sum('puntos_linea', output_field=IntegerField()), Value(0)),
            )
        }
        metas_por = {
            fila[campo]: fila
            for fila in metas.values(campo).annotate(
                cantidad=Coalesce(Sum('meta_cantidad'), Value(0)),
                dinero=Coalesce(Sum('dinero_meta', output_field=IntegerField()), Value(0)),
                puntos=Coalesce(Sum('puntos_meta', output_field=IntegerField()), Value(0)),
            )
        }
        stock_por = {
            fila[campo]: fila['unidades']
            for fila in inventarios.values(campo).annotate(
                unidades=Coalesce(Sum('cantidad_inventario'), Value(0))
            )
        }

        filas = []
        for clave in set(reales_por) | set(metas_por) | set(stock_por):
            r = reales_por.get(clave, {})
            m = metas_por.get(clave, {})
            filas.append(
                {
                    'key': clave or 'Sin dato',
                    'label': clave or 'Sin dato',
                    'real_cantidad': r.get('cantidad', 0),
                    'real_dinero': r.get('dinero', 0),
                    'real_puntos': r.get('puntos', 0),
                    'meta_cantidad': m.get('cantidad', 0),
                    'meta_dinero': m.get('dinero', 0),
                    'meta_puntos': m.get('puntos', 0),
                    'cumplimiento_cantidad': _porcentaje(
                        r.get('cantidad', 0), m.get('cantidad', 0)
                    ),
                    'cumplimiento_dinero': _porcentaje(r.get('dinero', 0), m.get('dinero', 0)),
                    'cumplimiento_puntos': _porcentaje(r.get('puntos', 0), m.get('puntos', 0)),
                    'inventario': stock_por.get(clave, 0),
                }
            )
        filas.sort(key=lambda f: f['cumplimiento_dinero'], reverse=True)
        return filas[:limite] if limite else filas

    return Response(
        {
            'filtros': {
                'regional': regional,
                'marca': marca,
                'desde': desde.isoformat() if desde else '',
                'hasta': hasta.isoformat() if hasta else '',
            },
            'totales': {
                'real_cantidad': real['cantidad'],
                'real_dinero': real['dinero'],
                'real_puntos': real['puntos'],
                'meta_cantidad': objetivo['cantidad'],
                'meta_dinero': objetivo['dinero'],
                'meta_puntos': objetivo['puntos'],
                'cumplimiento_cantidad': _porcentaje(real['cantidad'], objetivo['cantidad']),
                'cumplimiento_dinero': _porcentaje(real['dinero'], objetivo['dinero']),
                'cumplimiento_puntos': _porcentaje(real['puntos'], objetivo['puntos']),
                'inventario_unidades': stock['unidades'],
                'inventario_registros': stock['registros'],
                # Cuántas veces alcanza el stock para repetir lo ya vendido.
                'cobertura': round(stock['unidades'] / real['cantidad'], 2)
                if real['cantidad']
                else 0.0,
            },
            'por_punto_venta': agrupar('id_punto_venta__nombre_pdv'),
            'por_marca': agrupar('id_producto__marca'),
            'por_producto': agrupar('id_producto__nombre_producto', limite=10),
        }
    )


def _mes_pedido(request) -> tuple[int, int]:
    """
    El mes del tablero: `?anio=2026&mes=3`, o el mes en curso.

    Se piden año y mes por separado, y no un rango de fechas, porque la meta
    es mensual: un corte de «15 de marzo a 20 de abril» no tendría meta
    contra la cual medirse.
    """
    hoy = timezone.localdate()
    try:
        anio = int(request.query_params.get('anio') or hoy.year)
        mes = int(request.query_params.get('mes') or hoy.month)
    except ValueError:
        return hoy.year, hoy.month
    if not 1 <= mes <= 12 or not 2000 <= anio <= 2100:
        return hoy.year, hoy.month
    return anio, mes


def _calcular_avance(request, canal: Canal = CLARO) -> dict:
    """
    Avance del mes: la venta de cada día contra la meta diaria.

    La meta se carga con fecha, pero esa fecha solo dice de qué mes es: tres
    metas con 01/03, 14/03 y 15/03 son, todas, meta de marzo. Así que aquí se
    suma la meta de todo el mes y se reparte en partes iguales entre los días
    hábiles —de lunes a sábado, sin domingos ni festivos—, y esa cuota diaria
    es la línea contra la que se mide cada día.

    Va aparte de la vista porque el mismo cálculo alimenta el JSON del tablero
    y el .xlsx que se descarga: si se duplicara, el archivo y la pantalla
    podrían dejar de coincidir.

    `canal` dice de qué tablas sale todo —Claro u Homecenter—: el cálculo es
    uno solo para los dos.
    """
    anio, mes = _mes_pedido(request)
    regional = (request.query_params.get('regional') or '').strip()
    marca = (request.query_params.get('marca') or '').strip()
    punto = (request.query_params.get('id_punto_venta') or '').strip()

    ventas = canal.venta.objects.filter(fecha_venta__year=anio, fecha_venta__month=mes)
    # La meta entra por el mes de su fecha, no por el día: el día que traiga
    # el registro es irrelevante.
    metas = canal.meta.objects.filter(
        fecha_meta__year=anio, fecha_meta__month=mes
    ).annotate(**anotaciones_meta(canal.con_puntos))
    inventarios = canal.inventario.objects.all()

    if regional:
        ventas = ventas.filter(id_punto_venta__regional=regional)
        metas = metas.filter(id_punto_venta__regional=regional)
        inventarios = inventarios.filter(id_punto_venta__regional=regional)
    if marca:
        ventas = ventas.filter(id_producto__marca=marca)
        metas = metas.filter(id_producto__marca=marca)
        inventarios = inventarios.filter(id_producto__marca=marca)

    # El punto de venta recorta los tres lados, igual que la regional: lo
    # vendido, la meta y el stock de ese punto.
    if punto:
        ventas = ventas.filter(id_punto_venta=punto)
        metas = metas.filter(id_punto_venta=punto)
        inventarios = inventarios.filter(id_punto_venta=punto)

    ventas = ventas.annotate(
        dinero_linea=F('cantidad_vendida') * F('id_producto__precio_venta_coltrade')
    )

    dias = dias_del_mes(anio, mes)
    habiles = set(dias_habiles(anio, mes))
    festivos_mes = [dia for dia in dias if dia in festivos(anio) and dia.weekday() != 6]

    objetivo = metas.aggregate(
        dinero=Coalesce(Sum('dinero_meta', output_field=IntegerField()), Value(0)),
        cantidad=Coalesce(Sum('meta_cantidad'), Value(0)),
    )
    # Se reparte en partes iguales: la fuente no trae meta por día, así que
    # cualquier otro reparto sería inventado.
    meta_diaria = round(objetivo['dinero'] / len(habiles)) if habiles else 0

    por_dia = {
        fila['fecha_venta']: fila
        for fila in ventas.values('fecha_venta').annotate(
            dinero=Coalesce(Sum('dinero_linea', output_field=IntegerField()), Value(0)),
            cantidad=Coalesce(Sum('cantidad_vendida'), Value(0)),
        )
    }

    serie = []
    acumulado = 0
    for indice, dia in enumerate(dias, start=1):
        fila = por_dia.get(dia, {})
        vendido = fila.get('dinero', 0)
        acumulado += vendido
        serie.append(
            {
                'dia': dia.day,
                'fecha': dia.isoformat(),
                'habil': dia in habiles,
                'meta_diaria': meta_diaria,
                'ventas': vendido,
                'cantidad': fila.get('cantidad', 0),
                'cumplimiento': _porcentaje(vendido, meta_diaria),
                # El acumulado deja ver si el mes va al día aunque un día
                # suelto se haya quedado corto.
                'ventas_acumuladas': acumulado,
                'meta_acumulada': meta_diaria * indice,
            }
        )

    real = ventas.aggregate(
        dinero=Coalesce(Sum('dinero_linea', output_field=IntegerField()), Value(0)),
        cantidad=Coalesce(Sum('cantidad_vendida'), Value(0)),
    )
    stock = inventarios.aggregate(unidades=Coalesce(Sum('cantidad_inventario'), Value(0)))

    def agrupar(campo: str):
        """Meta mensual, venta e inventario cruzados por una misma dimensión."""
        reales_por = {
            f[campo]: f
            for f in ventas.values(campo).annotate(
                dinero=Coalesce(Sum('dinero_linea', output_field=IntegerField()), Value(0)),
                cantidad=Coalesce(Sum('cantidad_vendida'), Value(0)),
            )
        }
        metas_por = {
            f[campo]: f['dinero']
            for f in metas.values(campo).annotate(
                dinero=Coalesce(Sum('dinero_meta', output_field=IntegerField()), Value(0))
            )
        }
        stock_por = {
            f[campo]: f['unidades']
            for f in inventarios.values(campo).annotate(
                unidades=Coalesce(Sum('cantidad_inventario'), Value(0))
            )
        }

        filas = []
        for clave in set(reales_por) | set(metas_por) | set(stock_por):
            r = reales_por.get(clave, {})
            meta_fila = metas_por.get(clave, 0)
            filas.append(
                {
                    'key': clave or 'Sin dato',
                    'label': clave or 'Sin dato',
                    'meta_mensual': meta_fila,
                    'importe': r.get('dinero', 0),
                    'cantidad': r.get('cantidad', 0),
                    'inventario': stock_por.get(clave, 0),
                    'cumplimiento': _porcentaje(r.get('dinero', 0), meta_fila),
                }
            )
        filas.sort(key=lambda f: f['cumplimiento'], reverse=True)
        return filas

    return {
        'periodo': {
            'anio': anio,
            'mes': mes,
            # `AAAA-MM`: el mismo formato que consume un <input type="month">.
            'valor': f'{anio:04d}-{mes:02d}',
            'dias_del_mes': len(dias),
            'dias_habiles': len(habiles),
            'domingos': sum(1 for dia in dias if dia.weekday() == 6),
            'festivos': [dia.isoformat() for dia in festivos_mes],
        },
        'filtros': {'regional': regional, 'marca': marca, 'id_punto_venta': punto},
        'totales': {
            'meta_dinero': objetivo['dinero'],
            'meta_cantidad': objetivo['cantidad'],
            'meta_diaria': meta_diaria,
            'ventas_dinero': real['dinero'],
            'ventas_cantidad': real['cantidad'],
            'cumplimiento': _porcentaje(real['dinero'], objetivo['dinero']),
            'inventario_unidades': stock['unidades'],
        },
        'serie': serie,
        'por_regional': agrupar('id_punto_venta__regional'),
        'por_punto_venta': agrupar('id_punto_venta__nombre_pdv'),
    }


@api_view(['GET'])
@permission_classes([HasBiTradeApp])
def avance_mensual(request):
    """El avance del mes, para el tablero."""
    return Response(_calcular_avance(request))


#: Las hojas del .xlsx del tablero. La clave es lo que llega en `?hoja=`.
HOJAS_AVANCE = {
    'serie': (
        'Día por día',
        'serie',
        [
            ColumnaExport('Día', 'dia', 'entero'),
            ColumnaExport('Fecha', 'fecha'),
            ColumnaExport('¿Hábil?', 'habil_texto'),
            ColumnaExport('Meta diaria', 'meta_diaria', 'dinero'),
            ColumnaExport('Ventas del día', 'ventas', 'dinero'),
            ColumnaExport('Unidades', 'cantidad', 'entero'),
            ColumnaExport('Cumplimiento %', 'cumplimiento'),
            ColumnaExport('Ventas acumuladas', 'ventas_acumuladas', 'dinero'),
            ColumnaExport('Meta acumulada', 'meta_acumulada', 'dinero'),
        ],
    ),
    'regional': (
        'Por regional',
        'por_regional',
        [
            ColumnaExport('Regional', 'label'),
            ColumnaExport('Meta mensual', 'meta_mensual', 'dinero'),
            ColumnaExport('Importe', 'importe', 'dinero'),
            ColumnaExport('Cantidad', 'cantidad', 'entero'),
            ColumnaExport('Cumplimiento %', 'cumplimiento'),
        ],
    ),
    'puntos': (
        'Por punto de venta',
        'por_punto_venta',
        [
            ColumnaExport('Punto de venta', 'label'),
            ColumnaExport('Inventario', 'inventario', 'entero'),
            ColumnaExport('Meta mensual', 'meta_mensual', 'dinero'),
            ColumnaExport('Importe', 'importe', 'dinero'),
            ColumnaExport('Cantidad', 'cantidad', 'entero'),
            ColumnaExport('Cumplimiento %', 'cumplimiento'),
        ],
    ),
}


def exportar_avance(request, canal: Canal = CLARO) -> HttpResponse:
    """
    El tablero del mes en .xlsx, con los mismos filtros que hay en pantalla.

    `?hoja=serie|regional|puntos` baja solo ese bloque —es lo que pide el
    botón de cada tarjeta— y sin el parámetro baja el mes completo en tres
    hojas. Los archivos de Homecenter llevan el prefijo `hc-` para que no se
    confundan con los de Claro en la carpeta de descargas.
    """
    pedidas = [h for h in request.query_params.getlist('hoja') if h in HOJAS_AVANCE]
    datos = _calcular_avance(request, canal)

    hojas = []
    for clave in pedidas or HOJAS_AVANCE:
        titulo, campo, columnas = HOJAS_AVANCE[clave]
        filas = datos[campo]
        if clave == 'serie':
            # «Sí/No» en vez de TRUE/FALSE: el archivo lo lee una persona.
            filas = [{**fila, 'habil_texto': 'Sí' if fila['habil'] else 'No'} for fila in filas]
        hojas.append((titulo, columnas, filas))

    periodo = datos['periodo']['valor']
    contenido = construir_export_multihoja(hojas)
    respuesta = HttpResponse(
        contenido,
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    sufijo = f'-{pedidas[0]}' if len(pedidas) == 1 else ''
    respuesta['Content-Disposition'] = (
        f'attachment; filename="{canal.prefijo_archivo}avance-{periodo}{sufijo}.xlsx"'
    )
    return respuesta


@api_view(['GET'])
@permission_classes([HasBiTradeApp])
def avance_mensual_exportar(request):
    """Descarga el tablero del mes de Claro en .xlsx."""
    return exportar_avance(request)


#: Qué hacer con las ventas del mes que ya están cargadas.
MODO_COMPLETAR = 'completar'
MODO_SOBRESCRIBIR = 'sobrescribir'
MODOS = (MODO_COMPLETAR, MODO_SOBRESCRIBIR)


@api_view(['POST'])
@permission_classes([HasBiTradeApp, CanManageData])
@parser_classes([MultiPartParser])
def importar_informe(request):
    """Carga el informe del ERP en las tablas de Claro."""
    return importar_informe_de(request, CLARO)


def importar_informe_de(request, canal: Canal = CLARO) -> Response:
    """
    Carga el informe del ERP: ventas e inventario de una sola pasada.

    Lo tienen Claro y Tmk Ecommerce Claro, cada uno sobre sus propias tablas;
    Homecenter y Falabella no. El producto y el punto de venta se cruzan con
    los del canal: una fila que no existe en ese canal no entra.

    Recibe `archivo` (el .xlsx), `anio`, `mes` y `modo`. El mes se elige a mano
    y no se deduce del archivo, porque el mismo informe puede subirse tarde:
    estando en abril se puede querer cargar marzo.

    **Ventas.** Solo entran las filas del mes elegido. Con `modo=completar` se
    respetan los días que ya tienen ventas cargadas y se llenan los vacíos —es
    el caso de todos los días: se sube el informe cada tanto y se agrega lo que
    falta—. Con `modo=sobrescribir` se borran las ventas de ese mes y queda
    exactamente lo que trae el archivo.

    El corte es por día y no por fila porque una venta no tiene código propio:
    si se comparara fila por fila no habría forma de distinguir «esta venta ya
    está» de «se vendieron dos unidades iguales el mismo día».

    **Inventario.** Siempre se reemplaza completo: el informe es la foto del
    stock de hoy, no un movimiento que se acumule.

    Lo que no cruza con la base se cuenta y se reporta, no se inventa: si el
    punto de venta o el producto no existen en la app, esa fila no entra.
    """
    archivo = request.FILES.get('archivo')
    if archivo is None:
        return Response(
            {'code': 'invalid', 'message': 'No llegó ningún archivo.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not archivo.name.lower().endswith('.xlsx'):
        return Response(
            {'code': 'invalid', 'message': 'El archivo debe ser un Excel .xlsx.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    modo = (request.data.get('modo') or MODO_COMPLETAR).strip()
    if modo not in MODOS:
        return Response(
            {
                'code': 'invalid',
                'message': f'El modo debe ser «{MODO_COMPLETAR}» o «{MODO_SOBRESCRIBIR}».',
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        anio = int(request.data.get('anio'))
        mes = int(request.data.get('mes'))
        if not 1 <= mes <= 12 or not 2000 <= anio <= 2100:
            raise ValueError
    except (TypeError, ValueError):
        return Response(
            {'code': 'invalid', 'message': 'Elige el mes y el año al que van las ventas.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        lectura = leer_informe(archivo)
    except ErrorDeInforme as exc:
        return Response(
            {'code': 'invalid', 'message': str(exc)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not lectura.ventas and not lectura.inventario:
        return Response(
            {
                'code': 'invalid',
                'message': (
                    'El archivo no trae ventas (CMv 601) ni inventario (CMv 1). '
                    f'Se leyeron {lectura.filas_ignoradas} filas de otras clases de movimiento.'
                ),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    productos = set(canal.producto.objects.values_list('id_producto', flat=True))
    puntos = set(canal.punto.objects.values_list('id_punto_venta', flat=True))

    with transaction.atomic():
        resumen_ventas = _importar_ventas(lectura, anio, mes, modo, productos, puntos, canal)
        resumen_inventario = _importar_inventario(lectura, productos, puntos, canal)

    partes = []
    if resumen_ventas['creadas']:
        partes.append(f'{resumen_ventas["creadas"]} venta(s)')
    if resumen_inventario['creados']:
        partes.append(f'{resumen_inventario["creados"]} registro(s) de inventario')
    mensaje = (
        'Importación lista: ' + _lista_en_espanol(partes) + '.'
        if partes
        else 'No había nada nuevo que cargar del archivo.'
    )

    return Response(
        {
            'periodo': f'{anio:04d}-{mes:02d}',
            'modo': modo,
            'ventas': resumen_ventas,
            'inventario': resumen_inventario,
            'message': mensaje,
        }
    )


def _importar_ventas(lectura, anio, mes, modo, productos, puntos, canal: Canal) -> dict:
    """Aplica las ventas del archivo al mes elegido, según el modo."""
    del_mes = {
        (producto, centro, fecha): unidades
        for (producto, centro, fecha), unidades in lectura.ventas.items()
        if fecha.year == anio and fecha.month == mes
    }
    fuera_del_mes = len(lectura.ventas) - len(del_mes)

    existentes = canal.venta.objects.filter(fecha_venta__year=anio, fecha_venta__month=mes)
    eliminadas = 0
    if modo == MODO_SOBRESCRIBIR:
        eliminadas = existentes.count()
        existentes.delete()
        dias_ocupados: set = set()
    else:
        # Un día que ya tiene ventas cargadas se deja como está.
        dias_ocupados = set(existentes.values_list('fecha_venta', flat=True).distinct())

    sin_producto = sin_punto = 0
    omitidas_por_dia = 0
    nuevas = []
    for (producto, centro, fecha), unidades in sorted(del_mes.items()):
        if fecha in dias_ocupados:
            omitidas_por_dia += 1
            continue
        if producto not in productos:
            sin_producto += 1
            continue
        if centro not in puntos:
            sin_punto += 1
            continue
        nuevas.append(
            canal.venta(
                id_producto_id=producto,
                id_punto_venta_id=centro,
                fecha_venta=fecha,
                cantidad_vendida=unidades,
            )
        )

    canal.venta.objects.bulk_create(nuevas, batch_size=500)
    cargados = sorted({venta.fecha_venta for venta in nuevas})
    return {
        'creadas': len(nuevas),
        'unidades': sum(venta.cantidad_vendida for venta in nuevas),
        'eliminadas': eliminadas,
        'filas_leidas': lectura.filas_venta,
        'fuera_del_mes': fuera_del_mes,
        'sin_producto': sin_producto,
        'sin_punto_venta': sin_punto,
        # Lo que no entró porque su día ya tenía ventas cargadas. En modo
        # sobrescribir siempre es cero: ahí no queda nada que respetar.
        'omitidas_por_dia': omitidas_por_dia,
        'dias_cargados': [dia.isoformat() for dia in cargados],
        'dias_respetados': sorted(dia.isoformat() for dia in dias_ocupados),
    }


def _importar_inventario(lectura, productos, puntos, canal: Canal) -> dict:
    """
    Reemplaza el inventario con la foto del archivo.

    Si el archivo no trae inventario no se borra nada: vaciar la tabla sin algo
    con qué reemplazarla sería destruir el dato en lugar de actualizarlo.
    """
    if not lectura.inventario:
        return {
            'creados': 0,
            'unidades': 0,
            'eliminados': 0,
            'filas_leidas': 0,
            'sin_producto': 0,
            'sin_punto_venta': 0,
            'reemplazado': False,
        }

    sin_producto = sin_punto = 0
    nuevos = []
    for (producto, centro), unidades in sorted(lectura.inventario.items()):
        if producto not in productos:
            sin_producto += 1
            continue
        if centro not in puntos:
            sin_punto += 1
            continue
        nuevos.append(
            canal.inventario(
                id_producto_id=producto,
                id_punto_venta_id=centro,
                cantidad_inventario=unidades,
            )
        )

    eliminados = canal.inventario.objects.count()
    canal.inventario.objects.all().delete()
    canal.inventario.objects.bulk_create(nuevos, batch_size=500)
    return {
        'creados': len(nuevos),
        'unidades': sum(fila.cantidad_inventario for fila in nuevos),
        'eliminados': eliminados,
        'filas_leidas': lectura.filas_inventario,
        'sin_producto': sin_producto,
        'sin_punto_venta': sin_punto,
        'reemplazado': True,
    }


class CampanaViewSet(BiTradeViewSet):
    """CRUD de las campañas de tickets. Las reglas se editan aquí, no en código."""

    queryset = Campana.objects.prefetch_related(
        'escalas', 'aceleradores', 'productos_foco', 'productos_cargador'
    ).order_by('-desde', 'nombre')
    serializer_class = CampanaSerializer
    search_fields = ('nombre',)
    filterset_fields = ('activa',)
    nombre_plural = 'las campañas'


def _calcular_concurso(request) -> dict:
    """
    El tablero del concurso: tickets por punto de venta y quién participa.

    Sin `?campana=` se toma la última campaña activa, que es la que se quiere
    ver el 99% de las veces. `regional` y `marca` acotan qué ventas se miran,
    igual que en el resto del BI.

    Va aparte de la vista porque el mismo cálculo alimenta el JSON y el .xlsx:
    si se duplicara, el archivo y la pantalla podrían dejar de coincidir.
    """
    campanas = Campana.objects.prefetch_related('escalas', 'aceleradores')
    pedida = request.query_params.get('campana')
    if pedida:
        campana = campanas.filter(pk=pedida).first()
    else:
        campana = campanas.filter(activa=True).order_by('-desde').first()

    if campana is None:
        return {
            'campana': None,
            'totales': {},
            'filas': [],
            'message': 'No hay campañas creadas. Crea una para empezar a medir el concurso.',
        }

    regional = (request.query_params.get('regional') or '').strip()
    marca = (request.query_params.get('marca') or '').strip()
    punto = (request.query_params.get('id_punto_venta') or '').strip()
    filas = calcular_tickets(campana, regional=regional, marca=marca, punto=punto)

    armadas = [
        {
            'key': fila.key,
            'label': fila.label,
            'regional': fila.regional,
            'unidades': fila.unidades,
            'unidades_foco': fila.unidades_foco,
            'unidades_cargador': fila.unidades_cargador,
            'dias_con_venta': len(fila.dias),
            'dias_cumplidos': fila.dias_cumplidos,
            'dias_duplicados': fila.dias_duplicados,
            'tickets_escala': fila.tickets_escala,
            'tickets_bono': fila.tickets_bono,
            'tickets_acelerador': fila.tickets_acelerador,
            'acelerador_alcanzado': fila.acelerador_alcanzado,
            'tickets': fila.tickets,
            'cumple_ventas': fila.unidades >= campana.ventas_minimas,
            'cumple_tickets': fila.tickets >= campana.tickets_minimos,
            'participa': participa(campana, fila),
            # Cuántas unidades le faltan para entrar. Cero si ya entró.
            'faltan_ventas': max(0, campana.ventas_minimas - fila.unidades),
            'dias': [
                {
                    'fecha': dia.fecha.isoformat(),
                    'unidades': dia.unidades,
                    'foco': dia.foco,
                    'cargador': dia.cargador,
                    'tickets_escala': dia.tickets_escala,
                    'tickets_bono': dia.tickets_bono,
                    'duplicado': dia.duplicado,
                    'cumplido': dia.cumplido,
                }
                for dia in fila.dias
            ],
        }
        for fila in filas
    ]

    participantes = [fila for fila in armadas if fila['participa']]
    hoy = timezone.localdate()
    return {
        'campana': CampanaSerializer(campana).data,
        'vigente': campana.desde <= hoy <= campana.hasta,
        'totales': {
            'puntos_venta': len(armadas),
            'participantes': len(participantes),
            'tickets': sum(fila['tickets'] for fila in armadas),
            'tickets_participantes': sum(fila['tickets'] for fila in participantes),
            'unidades': sum(fila['unidades'] for fila in armadas),
            'dias_cumplidos': sum(fila['dias_cumplidos'] for fila in armadas),
        },
        'filas': armadas,
    }


@api_view(['GET'])
@permission_classes([HasBiTradeApp])
def tickets(request):
    """El tablero del concurso de tickets."""
    return Response(_calcular_concurso(request))


#: Columnas del .xlsx del concurso.
COLUMNAS_TICKETS = [
    ColumnaExport('Punto de venta', 'label'),
    ColumnaExport('Regional', 'regional'),
    ColumnaExport('Unidades vendidas', 'unidades', 'entero'),
    ColumnaExport('Unidades foco', 'unidades_foco', 'entero'),
    ColumnaExport('Cargadores', 'unidades_cargador', 'entero'),
    ColumnaExport('Días cumplidos', 'dias_cumplidos', 'entero'),
    ColumnaExport('Días con doble', 'dias_duplicados', 'entero'),
    ColumnaExport('Tickets de escala', 'tickets_escala', 'entero'),
    ColumnaExport('Tickets de bono', 'tickets_bono', 'entero'),
    ColumnaExport('Tickets del acelerador', 'tickets_acelerador', 'entero'),
    ColumnaExport('Tickets totales', 'tickets', 'entero'),
    ColumnaExport('¿Participa?', 'participa_texto'),
]

COLUMNAS_TICKETS_DIA = [
    ColumnaExport('Punto de venta', 'label'),
    ColumnaExport('Fecha', 'fecha'),
    ColumnaExport('Unidades', 'unidades', 'entero'),
    ColumnaExport('Foco', 'foco', 'entero'),
    ColumnaExport('Cargadores', 'cargador', 'entero'),
    ColumnaExport('Tickets de escala', 'tickets_escala', 'entero'),
    ColumnaExport('Tickets de bono', 'tickets_bono', 'entero'),
    ColumnaExport('¿Doble?', 'duplicado_texto'),
]


@api_view(['GET'])
@permission_classes([HasBiTradeApp])
def tickets_exportar(request):
    """Descarga el concurso en .xlsx: el acumulado y el detalle día por día."""
    cuerpo = _calcular_concurso(request)
    if cuerpo.get('campana') is None:
        return Response(
            {'code': 'invalid', 'message': 'No hay campañas que exportar.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    acumulado = [
        {**fila, 'participa_texto': 'Sí' if fila['participa'] else 'No'}
        for fila in cuerpo['filas']
    ]
    detalle = [
        {
            **dia,
            'label': fila['label'],
            'duplicado_texto': 'Sí' if dia['duplicado'] else 'No',
        }
        for fila in cuerpo['filas']
        for dia in fila['dias']
    ]

    contenido = construir_export_multihoja(
        [
            ('Tickets por punto', COLUMNAS_TICKETS, acumulado),
            ('Día por día', COLUMNAS_TICKETS_DIA, detalle),
        ]
    )
    nombre = cuerpo['campana']['nombre'][:40].replace(' ', '-').lower()
    respuesta = HttpResponse(
        contenido,
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    respuesta['Content-Disposition'] = f'attachment; filename="tickets-{nombre}.xlsx"'
    return respuesta


#: Los cortes del cumplimiento diario: por dónde se puede desglosar el día.
CORTES_DIA = {
    'regional': ('Por regional', 'id_punto_venta__regional'),
    'puntos': ('Por punto de venta', 'id_punto_venta__nombre_pdv'),
    'marcas': ('Por marca', 'id_producto__marca'),
    'productos': ('Por producto', 'id_producto__nombre_producto'),
}

#: Los nombres de los meses, para el título del día.
MESES_ES = (
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
)
DIAS_ES = ('lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo')


def _dia_pedido(request):
    """El día del tablero: `?fecha=AAAA-MM-DD`, o hoy."""
    return _fecha(request.query_params.get('fecha')) or timezone.localdate()


def _calcular_dia(request, canal: Canal = CLARO) -> dict:
    """
    Cumplimiento de un solo día.

    La cuota del día sale igual que en el tablero del mes: la meta del mes
    —que se carga con fecha pero representa el periodo completo— repartida
    entre los días hábiles, sin domingos ni festivos y contando el sábado.

    Se reparte la meta ya agrupada y no meta por meta: dividir cada fila y
    después sumar arrastraría el redondeo de cada una.

    Un domingo o un festivo se muestra con su misma cuota y marcado como no
    hábil, igual que en la gráfica del mes: el día se puede analizar, pero
    quien lo mire sabe que no era un día de venta.
    """
    fecha = _dia_pedido(request)
    anio, mes = fecha.year, fecha.month
    habiles = dias_habiles(anio, mes)
    cuantos_habiles = len(habiles)

    regional = (request.query_params.get('regional') or '').strip()
    marca = (request.query_params.get('marca') or '').strip()
    producto = (request.query_params.get('id_producto') or '').strip()
    punto = (request.query_params.get('id_punto_venta') or '').strip()

    ventas = canal.venta.objects.filter(fecha_venta=fecha)
    metas = canal.meta.objects.filter(fecha_meta__year=anio, fecha_meta__month=mes)

    if regional:
        ventas = ventas.filter(id_punto_venta__regional=regional)
        metas = metas.filter(id_punto_venta__regional=regional)
    if marca:
        ventas = ventas.filter(id_producto__marca=marca)
        metas = metas.filter(id_producto__marca=marca)
    if producto:
        ventas = ventas.filter(id_producto=producto)
        metas = metas.filter(id_producto=producto)
    if punto:
        ventas = ventas.filter(id_punto_venta=punto)
        metas = metas.filter(id_punto_venta=punto)

    # Los canales sin puntos no tienen puntaje: nada de la consulta lo toca, y
    # las llaves de puntos se quitan de la respuesta al final.
    puntaje = Coalesce('id_producto__puntaje', Value(0)) if canal.con_puntos else Value(0)
    ventas = ventas.annotate(
        dinero_linea=F('cantidad_vendida') * F('id_producto__precio_venta_coltrade'),
        puntos_linea=F('cantidad_vendida') * puntaje,
    )
    metas = metas.annotate(
        dinero_meta_linea=F('meta_cantidad') * F('id_producto__precio_venta_coltrade'),
        puntos_meta_linea=F('meta_cantidad') * puntaje,
    )

    def diaria(mensual: int) -> int:
        """La cuota del día: la meta del mes entre los días hábiles."""
        return round(mensual / cuantos_habiles) if cuantos_habiles else 0

    def agrupar(campo: str):
        """Cruza la venta del día con la cuota del día por una misma dimensión."""
        reales = {
            fila[campo]: fila
            for fila in ventas.values(campo).annotate(
                cantidad=Coalesce(Sum('cantidad_vendida'), Value(0)),
                dinero=Coalesce(Sum('dinero_linea', output_field=IntegerField()), Value(0)),
                puntos=Coalesce(Sum('puntos_linea', output_field=IntegerField()), Value(0)),
            )
        }
        objetivos = {
            fila[campo]: fila
            for fila in metas.values(campo).annotate(
                cantidad=Coalesce(Sum('meta_cantidad'), Value(0)),
                dinero=Coalesce(Sum('dinero_meta_linea', output_field=IntegerField()), Value(0)),
                puntos=Coalesce(Sum('puntos_meta_linea', output_field=IntegerField()), Value(0)),
            )
        }

        filas = []
        for clave in set(reales) | set(objetivos):
            r = reales.get(clave, {})
            m = objetivos.get(clave, {})
            meta_dinero = diaria(m.get('dinero', 0))
            meta_cantidad = diaria(m.get('cantidad', 0))
            meta_puntos = diaria(m.get('puntos', 0))
            filas.append(
                {
                    'key': clave or 'Sin dato',
                    'label': clave or 'Sin dato',
                    'real_dinero': r.get('dinero', 0),
                    'real_cantidad': r.get('cantidad', 0),
                    'real_puntos': r.get('puntos', 0),
                    'meta_dinero': meta_dinero,
                    'meta_cantidad': meta_cantidad,
                    'meta_puntos': meta_puntos,
                    # La meta del mes se lleva para poder ver de dónde salió la
                    # cuota sin volver al tablero del mes.
                    'meta_mensual_dinero': m.get('dinero', 0),
                    'cumplimiento_dinero': _porcentaje(r.get('dinero', 0), meta_dinero),
                    'cumplimiento_cantidad': _porcentaje(r.get('cantidad', 0), meta_cantidad),
                    'cumplimiento_puntos': _porcentaje(r.get('puntos', 0), meta_puntos),
                }
            )
        filas.sort(key=lambda f: f['cumplimiento_dinero'], reverse=True)
        return filas

    real = ventas.aggregate(
        cantidad=Coalesce(Sum('cantidad_vendida'), Value(0)),
        dinero=Coalesce(Sum('dinero_linea', output_field=IntegerField()), Value(0)),
        puntos=Coalesce(Sum('puntos_linea', output_field=IntegerField()), Value(0)),
        operaciones=Count('id_venta'),
    )
    objetivo = metas.aggregate(
        cantidad=Coalesce(Sum('meta_cantidad'), Value(0)),
        dinero=Coalesce(Sum('dinero_meta_linea', output_field=IntegerField()), Value(0)),
        puntos=Coalesce(Sum('puntos_meta_linea', output_field=IntegerField()), Value(0)),
    )
    meta_dinero = diaria(objetivo['dinero'])
    meta_cantidad = diaria(objetivo['cantidad'])
    meta_puntos = diaria(objetivo['puntos'])

    festivos_del_anio = festivos(anio)
    datos = {
        'dia': {
            'fecha': fecha.isoformat(),
            'anio': anio,
            'mes': mes,
            'dia': fecha.day,
            'nombre': (
                f'{DIAS_ES[fecha.weekday()]} {fecha.day} de {MESES_ES[mes - 1]} de {anio}'
            ),
            'habil': es_habil(fecha),
            'es_domingo': fecha.weekday() == 6,
            'es_festivo': fecha in festivos_del_anio,
            'dias_del_mes': len(dias_del_mes(anio, mes)),
            'dias_habiles': cuantos_habiles,
            # Qué días del mes no son hábiles, para que el selector los marque
            # sin tener que preguntar por cada uno.
            'dias_no_habiles': [
                dia.day for dia in dias_del_mes(anio, mes) if not es_habil(dia)
            ],
        },
        'filtros': {
            'regional': regional,
            'marca': marca,
            'id_producto': producto,
            'id_punto_venta': punto,
        },
        'totales': {
            'real_dinero': real['dinero'],
            'real_cantidad': real['cantidad'],
            'real_puntos': real['puntos'],
            'operaciones': real['operaciones'],
            'meta_dinero': meta_dinero,
            'meta_cantidad': meta_cantidad,
            'meta_puntos': meta_puntos,
            'meta_mensual_dinero': objetivo['dinero'],
            'meta_mensual_cantidad': objetivo['cantidad'],
            'meta_mensual_puntos': objetivo['puntos'],
            'cumplimiento_dinero': _porcentaje(real['dinero'], meta_dinero),
            'cumplimiento_cantidad': _porcentaje(real['cantidad'], meta_cantidad),
            'cumplimiento_puntos': _porcentaje(real['puntos'], meta_puntos),
        },
        'por_regional': agrupar(CORTES_DIA['regional'][1]),
        'por_punto_venta': agrupar(CORTES_DIA['puntos'][1]),
        'por_marca': agrupar(CORTES_DIA['marcas'][1]),
        'por_producto': agrupar(CORTES_DIA['productos'][1]),
    }
    return datos if canal.con_puntos else _sin_puntos(datos)


@api_view(['GET'])
@permission_classes([HasBiTradeApp])
def cumplimiento_diario(request):
    """El cumplimiento de un solo día, desglosado por cada dimensión."""
    return Response(_calcular_dia(request))


#: Columnas de cada hoja del .xlsx del día. Son las mismas para los cuatro
#: cortes; solo cambia el encabezado de la primera.
def _columnas_dia(encabezado: str, con_puntos: bool = True) -> list[ColumnaExport]:
    columnas = [
        ColumnaExport(encabezado, 'label'),
        ColumnaExport('Meta del día ($)', 'meta_dinero', 'dinero'),
        ColumnaExport('Vendido ($)', 'real_dinero', 'dinero'),
        ColumnaExport('Cumplimiento $ (%)', 'cumplimiento_dinero'),
        ColumnaExport('Meta del día (u.)', 'meta_cantidad', 'entero'),
        ColumnaExport('Vendido (u.)', 'real_cantidad', 'entero'),
        ColumnaExport('Cumplimiento u. (%)', 'cumplimiento_cantidad'),
        ColumnaExport('Meta del día (pts)', 'meta_puntos', 'entero'),
        ColumnaExport('Vendido (pts)', 'real_puntos', 'entero'),
        ColumnaExport('Cumplimiento pts (%)', 'cumplimiento_puntos'),
        ColumnaExport('Meta del mes ($)', 'meta_mensual_dinero', 'dinero'),
    ]
    if con_puntos:
        return columnas
    return [columna for columna in columnas if not columna.campo.endswith('_puntos')]


#: De qué llave del JSON sale cada hoja.
CAMPO_CORTE = {
    'regional': 'por_regional',
    'puntos': 'por_punto_venta',
    'marcas': 'por_marca',
    'productos': 'por_producto',
}


def exportar_dia(request, canal: Canal = CLARO) -> HttpResponse:
    """
    El día en .xlsx, con los mismos filtros de la pantalla.

    `?corte=regional|puntos|marcas|productos` baja solo ese desglose —es lo que
    pide el botón de cada tarjeta— y sin el parámetro bajan los cuatro.
    """
    pedidos = [c for c in request.query_params.getlist('corte') if c in CORTES_DIA]
    datos = _calcular_dia(request, canal)

    hojas = [
        (
            titulo,
            _columnas_dia(titulo.replace('Por ', '').capitalize(), canal.con_puntos),
            datos[CAMPO_CORTE[clave]],
        )
        for clave, (titulo, _campo) in CORTES_DIA.items()
        if not pedidos or clave in pedidos
    ]

    contenido = construir_export_multihoja(hojas)
    sufijo = f'-{pedidos[0]}' if len(pedidos) == 1 else ''
    respuesta = HttpResponse(
        contenido,
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    respuesta['Content-Disposition'] = (
        f'attachment; filename="{canal.prefijo_archivo}cumplimiento-'
        f'{datos["dia"]["fecha"]}{sufijo}.xlsx"'
    )
    return respuesta


@api_view(['GET'])
@permission_classes([HasBiTradeApp])
def cumplimiento_diario_exportar(request):
    """Descarga el cumplimiento de un día de Claro en .xlsx."""
    return exportar_dia(request)
