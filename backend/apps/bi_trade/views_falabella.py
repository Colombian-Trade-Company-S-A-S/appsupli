"""
Falabella: el mismo BI de Claro sobre sus propias tablas, igual que Homecenter.

Aquí no hay cálculo propio. Los CRUD heredan los de Claro y cambian solo lo que
es de Falabella —las tablas, los serializers y los encabezados `_falabella` de
las plantillas—; el tablero llama al mismo cálculo con el canal FALABELLA.

No existe el «Importar» general del informe del ERP: ese informe es de Claro.
Cada módulo sí tiene su plantilla y su importación. Además, las ventas y el
inventario se cargan con los reportes .csv del portal de Falabella
(`importar-reporte`, ver `reporte_falabella`), igual que los queries de HC.
"""
from django.db import connection, transaction
from django.db.models import Count
from rest_framework import status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response

from apps.core.excel import Columna

from .api_permissions import CanManageData, HasBiTradeApp
from .canales import FALABELLA
from .filters import InventarioFalabellaFilter, MetaFalabellaFilter, VentaFalabellaFilter
from .models import (
    InventarioFalabella,
    Materiales,
    MetaComercialFalabella,
    ProductoFalabella,
    PuntoVentaFalabella,
    RegionalFalabella,
    VentaFalabella,
)
from .reporte_falabella import ErrorDeReporte, leer_inventario, leer_ventas
from .serializers import (
    InventarioFalabellaSerializer,
    MetaFalabellaSerializer,
    ProductoFalabellaSerializer,
    PuntoVentaFalabellaSerializer,
    VentaFalabellaSerializer,
)
from .views import (
    InventarioViewSet,
    MetaViewSet,
    ProductoViewSet,
    PuntoVentaViewSet,
    VentasConMeta,
    VentaViewSet,
    _calcular_avance,
    _calcular_dia,
    aviso_sin_meta,
    exportar_avance,
    exportar_dia,
    opciones_de,
)
from .views_hc import SOBRESCRIBIR, _Cruce, _error


class _PlantillaFalabella:
    """
    Las plantillas de Falabella hablan con encabezados `_falabella`; el
    serializer, no. Aquí se traduce de uno a otro al importar.
    """

    ENCABEZADOS = {
        'id_punto_venta_falabella': 'id_punto_venta',
        'id_producto_falabella': 'id_producto',
        'precio_venta_falabella': 'precio_venta_claro',
    }

    def fila_a_payload(self, fila: dict) -> dict:
        return {
            self.ENCABEZADOS.get(clave, clave): valor
            for clave, valor in fila.items()
            if clave != '_fila'
        }


def _dependencias_falabella() -> list[tuple[str, int]]:
    """Lo que impide vaciar los catálogos de Falabella: sus ventas, inventario y metas."""
    return [
        ('ventas', VentaFalabella.objects.count()),
        ('registros de inventario', InventarioFalabella.objects.count()),
        ('metas', MetaComercialFalabella.objects.count()),
    ]


_PRODUCTO_FALABELLA = Columna(
    'id_producto_falabella',
    ayuda='Código de un producto Falabella que ya exista.',
    ejemplo='FALP-001',
)
_PUNTO_FALABELLA = Columna(
    'id_punto_venta_falabella',
    ayuda='Código de una tienda Falabella que ya exista.',
    ejemplo='FAL-201',
)


# ── Los reportes .csv del portal de Falabella ──────────────────────────────

_SIN_CRUCE = (
    'Ninguna fila del archivo cruza con los productos y tiendas de Falabella, así que no se '
    'cambió nada. Crea primero los SKU y los ID Local que faltan.'
)
_SIN_META = (
    'Ninguna venta del archivo es de un producto con meta ese mes en su punto de venta, así '
    'que no se cambió nada. Sube primero las metas del mes.'
)

#: Número cualquiera, fijo, que identifica el bloqueo de las cargas de ventas
#: Falabella. Distinto del de HC: son tablas distintas.
_LLAVE_BLOQUEO_VENTAS = 710_002


def _bloquear_ventas_falabella() -> None:
    """Una sola carga de ventas Falabella a la vez: un doble clic no duplica."""
    if connection.vendor == 'postgresql':
        with connection.cursor() as cursor:
            cursor.execute('SELECT pg_advisory_xact_lock(%s)', [_LLAVE_BLOQUEO_VENTAS])


def _archivo_reporte(request):
    """El .csv subido, o la respuesta de error si no llegó o no es un .csv."""
    archivo = request.FILES.get('archivo')
    if archivo is None:
        return None, _error('No llegó ningún archivo.')
    if not archivo.name.lower().endswith('.csv'):
        return None, _error('El archivo debe ser el .csv tal como sale del portal de Falabella.')
    return archivo, None


def _cruce_falabella(pares) -> _Cruce:
    return _Cruce(pares, ProductoFalabella, PuntoVentaFalabella)


def _fuera(cruce: _Cruce) -> str:
    if not cruce.omitidas:
        return ''
    return (
        f' {cruce.omitidas} quedaron fuera porque su SKU o su ID Local no existe en Falabella.'
    )


class PuntoVentaFalabellaViewSet(_PlantillaFalabella, PuntoVentaViewSet):
    queryset = PuntoVentaFalabella.objects.annotate(conteo_ventas=Count('ventas')).order_by(
        'nombre_pdv'
    )
    serializer_class = PuntoVentaFalabellaSerializer
    nombre_plural = 'los puntos de venta Falabella'
    archivo_plantilla = 'plantilla-puntos-venta-falabella'
    columnas_excel = [
        Columna('id_punto_venta_falabella', ayuda='Código de la tienda. Máximo 60 caracteres.',
                ejemplo='FAL-201'),
        Columna('nombre_pdv', ayuda='Máximo 100 caracteres.', ejemplo='Falabella Andino'),
        Columna('regional', tipo='opcion', obligatoria=False,
                opciones=list(RegionalFalabella.values),
                ejemplo=RegionalFalabella.ZONA_NORTE.value),
        Columna('materiales', tipo='opcion', obligatoria=False, opciones=list(Materiales.values),
                ejemplo=Materiales.TODOS.value),
    ]

    def dependencias(self):
        return _dependencias_falabella()


class ProductoFalabellaViewSet(_PlantillaFalabella, ProductoViewSet):
    canal = FALABELLA
    queryset = ProductoFalabella.objects.annotate(conteo_ventas=Count('ventas')).order_by(
        'nombre_producto'
    )
    serializer_class = ProductoFalabellaSerializer
    nombre_plural = 'los productos Falabella'
    archivo_plantilla = 'plantilla-productos-falabella'
    columnas_excel = [
        Columna('id_producto_falabella', ayuda='Código del producto. Máximo 60 caracteres.',
                ejemplo='FALP-001'),
        Columna('nombre_producto', ayuda='Máximo 60 caracteres.', ejemplo='Audífonos JBL Tune'),
        Columna('marca', ayuda='Una marca de la lista de marcas. Da igual mayúsculas o tildes.',
                ejemplo='JBL'),
        Columna('precio_venta_falabella', tipo='entero',
                ayuda='Precio en Falabella. Hasta 100.000.000.', ejemplo='299900'),
        Columna('precio_venta_coltrade', tipo='entero',
                ayuda='Hasta 100.000.000. Con este precio se calculan los ingresos.',
                ejemplo='265000'),
    ]

    def dependencias(self):
        return _dependencias_falabella()


class VentaFalabellaViewSet(_PlantillaFalabella, VentaViewSet):
    canal = FALABELLA
    queryset = VentaFalabella.objects.select_related('id_producto', 'id_punto_venta').order_by(
        '-fecha_venta', '-id_venta'
    )
    serializer_class = VentaFalabellaSerializer
    filterset_class = VentaFalabellaFilter
    nombre_plural = 'las ventas Falabella'
    archivo_plantilla = 'plantilla-ventas-falabella'
    archivo_exportacion = 'ventas-falabella'
    con_puntos = False
    columnas_excel = [
        _PRODUCTO_FALABELLA,
        _PUNTO_FALABELLA,
        Columna('fecha_venta', tipo='fecha', ayuda='Formato AAAA-MM-DD.', ejemplo='2026-03-15'),
        Columna('cantidad_vendida', tipo='entero', ayuda='Unidades vendidas. Mínimo 1.',
                ejemplo='3'),
    ]

    @action(
        detail=False,
        methods=['post'],
        url_path='importar-reporte',
        permission_classes=[HasBiTradeApp, CanManageData],
    )
    def importar_reporte(self, request):
        """
        Carga las ventas del reporte «Ventas diarias» del portal de Falabella.

        Entran todas las fechas del archivo, solo las filas con 1 unidad o más
        y, como en Claro, solo las de un producto con meta ese mes en ese punto
        de venta (ver `VentasConMeta`). Igual que el querie de HC, el corte es
        por día: si alguno de los días del archivo ya tiene ventas no se guarda
        nada y se responde 409 con esos días; con `modo=sobrescribir` se borran
        las ventas de esos días y quedan las del archivo.
        """
        archivo, error = _archivo_reporte(request)
        if error:
            return error
        try:
            lectura = leer_ventas(archivo)
        except ErrorDeReporte as exc:
            return _error(str(exc))

        cruce = _cruce_falabella((fila.sku, fila.local) for fila in lectura.ventas)
        filtro = (
            VentasConMeta({(f.fecha.year, f.fecha.month) for f in lectura.ventas}, self.canal)
            if self.canal.solo_con_meta
            else None
        )
        sin_meta = 0
        nuevas = []
        for fila in lectura.ventas:
            if not cruce.entra(fila.sku, fila.local):
                continue
            if filtro is not None and not filtro.admite(fila.sku, fila.local, fila.fecha):
                sin_meta += 1
                continue
            nuevas.append(
                VentaFalabella(
                    id_producto_id=fila.sku,
                    id_punto_venta_id=fila.local,
                    fecha_venta=fila.fecha,
                    cantidad_vendida=fila.unidades,
                )
            )
        dias = sorted({venta.fecha_venta for venta in nuevas})
        resumen = {
            'dias': [dia.isoformat() for dia in dias],
            'filas_leidas': lectura.filas_leidas,
            'sin_unidades': lectura.sin_unidades,
            # Lo que no entró porque el producto no tiene meta ese mes en ese punto.
            'sin_meta': sin_meta,
            **cruce.resumen(),
        }
        if not nuevas:
            return _error(_SIN_META if sin_meta and not cruce.omitidas else _SIN_CRUCE, **resumen)

        sobrescribir = (request.data.get('modo') or '').strip() == SOBRESCRIBIR
        with transaction.atomic():
            _bloquear_ventas_falabella()
            # Se mira ya con el bloqueo: lo que se ve aquí es lo que hay al guardar.
            ocupados = list(
                VentaFalabella.objects.filter(fecha_venta__in=dias)
                .values('fecha_venta')
                .annotate(registros=Count('id_venta'))
                .order_by('fecha_venta')
            )
            if ocupados and not sobrescribir:
                return Response(
                    {
                        'code': 'dias_con_ventas',
                        'message': (
                            f'{len(ocupados)} día(s) del archivo ya tienen ventas cargadas. '
                            'Sobrescribe para reemplazarlas, o cancela.'
                        ),
                        'dias_con_ventas': [
                            {
                                'fecha': fila['fecha_venta'].isoformat(),
                                'registros': fila['registros'],
                            }
                            for fila in ocupados
                        ],
                        **resumen,
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            eliminadas, _ = VentaFalabella.objects.filter(fecha_venta__in=dias).delete()
            VentaFalabella.objects.bulk_create(nuevas, batch_size=500)

        mensaje = f'Ventas cargadas: {len(nuevas)} registro(s) de {len(dias)} día(s)' + (
            f', reemplazando {eliminadas} que ya estaban.' if eliminadas else '.'
        )
        if sin_meta:
            mensaje += ' ' + aviso_sin_meta(sin_meta)
        return Response(
            {
                **resumen,
                'creadas': len(nuevas),
                'unidades': sum(venta.cantidad_vendida for venta in nuevas),
                'eliminadas': eliminadas,
                'message': mensaje + _fuera(cruce),
            }
        )


class InventarioFalabellaViewSet(_PlantillaFalabella, InventarioViewSet):
    canal = FALABELLA
    queryset = InventarioFalabella.objects.select_related(
        'id_producto', 'id_punto_venta'
    ).order_by('id_punto_venta__nombre_pdv', 'id_producto__nombre_producto')
    serializer_class = InventarioFalabellaSerializer
    filterset_class = InventarioFalabellaFilter
    nombre_plural = 'los registros de inventario Falabella'
    archivo_plantilla = 'plantilla-inventario-falabella'
    archivo_exportacion = 'inventario-falabella'
    columnas_excel = [
        _PRODUCTO_FALABELLA,
        _PUNTO_FALABELLA,
        Columna('cantidad_inventario', tipo='entero', ayuda='Existencias actuales. Cero = agotado.',
                ejemplo='24'),
    ]

    @action(
        detail=False,
        methods=['post'],
        url_path='importar-reporte',
        permission_classes=[HasBiTradeApp, CanManageData],
    )
    def importar_reporte(self, request):
        """
        Reemplaza el inventario Falabella con el reporte «Análisis semanal».

        Es la foto del stock disponible: se borra lo que había y queda lo del
        archivo, solo con 1 unidad o más. Si ninguna fila cruza no se borra
        nada: vaciar el inventario sin con qué reemplazarlo sería perder el dato.
        """
        archivo, error = _archivo_reporte(request)
        if error:
            return error
        try:
            lectura = leer_inventario(archivo)
        except ErrorDeReporte as exc:
            return _error(str(exc))

        cruce = _cruce_falabella(lectura.inventario)
        nuevos = [
            InventarioFalabella(
                id_producto_id=sku, id_punto_venta_id=local, cantidad_inventario=unidades
            )
            for (sku, local), unidades in sorted(lectura.inventario.items())
            if cruce.entra(sku, local)
        ]
        resumen = {
            'filas_leidas': lectura.filas_leidas,
            'sin_unidades': lectura.sin_unidades,
            **cruce.resumen(),
        }
        if not nuevos:
            return _error(_SIN_CRUCE, **resumen)

        with transaction.atomic():
            eliminados, _ = InventarioFalabella.objects.all().delete()
            InventarioFalabella.objects.bulk_create(nuevos, batch_size=500)

        return Response(
            {
                **resumen,
                'creados': len(nuevos),
                'unidades': sum(fila.cantidad_inventario for fila in nuevos),
                'eliminados': eliminados,
                'message': f'Inventario cargado: {len(nuevos)} registro(s).' + _fuera(cruce),
            }
        )


class MetaFalabellaViewSet(_PlantillaFalabella, MetaViewSet):
    canal = FALABELLA
    queryset = MetaComercialFalabella.objects.select_related(
        'id_producto', 'id_punto_venta'
    ).order_by('id_punto_venta__nombre_pdv', 'id_producto__nombre_producto')
    serializer_class = MetaFalabellaSerializer
    filterset_class = MetaFalabellaFilter
    nombre_plural = 'las metas Falabella'
    archivo_plantilla = 'plantilla-metas-falabella'
    archivo_exportacion = 'metas-falabella'
    # Este canal no mide en puntos: ni los suma, ni los ordena, ni los exporta.
    con_puntos = False
    ordering_fields = ('fecha_meta', 'meta_cantidad', 'dinero_meta')
    columnas_exportacion = [
        c for c in MetaViewSet.columnas_exportacion if c.campo != 'puntos_meta'
    ]
    nota_plantilla = MetaViewSet.nota_plantilla.replace(
        'el dinero y los puntos se calculan con el precio y el puntaje del producto.',
        'el dinero se calcula con el precio Coltrade del producto.',
    )
    columnas_excel = [
        _PRODUCTO_FALABELLA,
        _PUNTO_FALABELLA,
        Columna('fecha_meta', tipo='fecha',
                ayuda='Periodo de la meta, formato AAAA-MM-DD.', ejemplo='2026-03-01'),
        Columna('meta_cantidad', tipo='entero', ayuda='Unidades objetivo.', ejemplo='25'),
    ]


# ── El tablero de Falabella: el mismo cálculo, con el canal FALABELLA ──────

@api_view(['GET'])
@permission_classes([HasBiTradeApp])
def opciones_falabella(request):
    return Response(opciones_de(FALABELLA))


@api_view(['GET'])
@permission_classes([HasBiTradeApp])
def avance_mensual_falabella(request):
    return Response(_calcular_avance(request, FALABELLA))


@api_view(['GET'])
@permission_classes([HasBiTradeApp])
def avance_mensual_falabella_exportar(request):
    return exportar_avance(request, FALABELLA)


@api_view(['GET'])
@permission_classes([HasBiTradeApp])
def cumplimiento_diario_falabella(request):
    return Response(_calcular_dia(request, FALABELLA))


@api_view(['GET'])
@permission_classes([HasBiTradeApp])
def cumplimiento_diario_falabella_exportar(request):
    return exportar_dia(request, FALABELLA)
