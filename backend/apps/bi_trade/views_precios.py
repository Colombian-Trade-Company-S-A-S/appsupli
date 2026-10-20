"""
Los precios Coltrade por periodo de los cuatro canales.

Cada canal tiene su tabla y su ruta (`precios`, `hc/precios`…), con el mismo
CRUD, la misma plantilla y la misma importación. Cómo se usan esos precios en
las ventas y las metas está en `precios`.
"""

from collections import defaultdict
from datetime import date, datetime

from django.db import transaction
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.excel import Columna, ColumnaExport

from .canales import CLARO, FALABELLA, HC, TMK
from .models import PrecioProducto, PrecioProductoFalabella, PrecioProductoHc, PrecioProductoTmk
from .serializers import (
    PrecioFalabellaSerializer,
    PrecioHcSerializer,
    PrecioSerializer,
    PrecioTmkSerializer,
    describir_periodo,
)
from .views import BiTradeViewSet
from .views_falabella import _PRODUCTO_FALABELLA, _PlantillaFalabella
from .views_hc import _PRODUCTO_HC, _PlantillaHc
from .views_tmk import _PRODUCTO_TMK, _PlantillaTmk


def periodos_que_se_pisan(modelo, productos) -> list[tuple]:
    """
    Los pares de periodos de un mismo producto que se pisan.

    Ordenados por fecha de inicio, si dos periodos cualesquiera se pisan
    también se pisan dos seguidos: basta con mirar cada uno contra el próximo.
    """
    por_producto = defaultdict(list)
    for periodo in modelo.objects.filter(id_producto__in=productos).order_by(
        'id_producto', 'desde'
    ):
        por_producto[periodo.id_producto_id].append(periodo)
    return [
        (anterior, siguiente)
        for periodos in por_producto.values()
        for anterior, siguiente in zip(periodos, periodos[1:], strict=False)
        if anterior.hasta is None or anterior.hasta >= siguiente.desde
    ]


def _fecha(valor) -> date | None:
    if isinstance(valor, datetime):
        return valor.date()
    return valor if isinstance(valor, date) else None


class PrecioViewSet(BiTradeViewSet):
    """
    Los precios de Claro. Los demás canales heredan todo y cambian su tabla.

    Un archivo puede traer varios periodos del mismo producto: se guardan
    todos y, antes de confirmar, se revisa que ninguno pise a otro —ni del
    archivo ni de lo que ya estaba—. Si alguno se pisa no se guarda nada.
    """

    canal = CLARO
    queryset = PrecioProducto.objects.select_related('id_producto').order_by(
        'id_producto__nombre_producto', '-desde'
    )
    serializer_class = PrecioSerializer
    filterset_fields = ('id_producto',)
    search_fields = ('id_producto__id_producto', 'id_producto__nombre_producto')
    nombre_plural = 'los precios'
    archivo_plantilla = 'plantilla-precios'
    archivo_exportacion = 'precios'
    columnas_exportacion = [
        ColumnaExport('Código producto', 'id_producto'),
        ColumnaExport('Producto', 'id_producto__nombre_producto'),
        ColumnaExport('Desde', 'desde', 'fecha'),
        ColumnaExport('Hasta', 'hasta', 'fecha'),
        ColumnaExport('Precio Coltrade', 'precio_venta_coltrade', 'dinero'),
    ]
    nota_plantilla = (
        'Cada fila es el precio Coltrade de un producto entre dos fechas. Sin «hasta», '
        'sigue vigente. Si el producto ya tiene un precio que empieza en esa misma fecha, '
        'la fila lo actualiza. Los periodos de un producto no se pueden pisar; los días '
        'que ningún periodo cubre valen el precio del producto.'
    )
    columna_producto = Columna(
        'id_producto', ayuda='Código de un producto que ya exista.', ejemplo='SKU-1001'
    )
    campos_clave = ('id_producto', 'desde')

    @property
    def columnas_excel(self) -> list[Columna]:
        return [
            self.columna_producto,
            Columna(
                'desde',
                tipo='fecha',
                ayuda='Primer día del precio, AAAA-MM-DD.',
                ejemplo='2026-10-01',
            ),
            Columna(
                'hasta',
                tipo='fecha',
                obligatoria=False,
                ayuda='Opcional. Último día del precio. Vacío: sigue vigente.',
                ejemplo='2026-10-31',
            ),
            Columna(
                'precio_venta_coltrade',
                tipo='entero',
                ayuda='En pesos, sin decimales. Hasta 100.000.000.',
                ejemplo='48000',
            ),
        ]

    @action(detail=False, methods=['get'], url_path='vigente')
    def vigente(self, request):
        """
        El precio que se aplicaría, para mostrarlo antes de guardar.

        `producto` y `fecha`: el precio de ese día, el de una venta. Con
        `mes=1`, el del mes de esa fecha, el de una meta. Es la misma regla que
        usan los tableros; el formulario no la repite, la pregunta.
        """
        params = request.query_params
        producto = self.canal.producto.objects.filter(pk=params.get('producto', '')).first()
        try:
            fecha = date.fromisoformat(params.get('fecha', ''))
        except ValueError:
            fecha = None
        if producto is None or fecha is None:
            return Response(
                {'code': 'invalid', 'message': 'Indica un producto que exista y una fecha.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        precio = (
            producto.precio_del_mes(fecha.year, fecha.month)
            if params.get('mes')
            else producto.precio_en(fecha)
        )
        return Response({'precio': precio, 'precio_base': producto.precio_venta_coltrade})

    def _importar_filas(self, filas: list[dict], errores: list[dict]) -> tuple[int, int]:
        fila_de = {}
        for fila in filas:
            payload = self.fila_a_payload(fila)
            fila_de[
                (str(payload.get('id_producto') or '').strip(), _fecha(payload.get('desde')))
            ] = fila['_fila']

        with transaction.atomic():
            resultado = super()._importar_filas(filas, errores)
            if errores:
                return resultado
            productos = {producto for producto, _desde in fila_de}
            for anterior, siguiente in periodos_que_se_pisan(self.canal.precio, productos):
                numero = fila_de.get((siguiente.id_producto_id, siguiente.desde)) or fila_de.get(
                    (anterior.id_producto_id, anterior.desde), 0
                )
                errores.append(
                    {
                        'fila': numero,
                        'errores': [
                            f'{siguiente.id_producto_id}: el precio de '
                            f'{describir_periodo(siguiente)} se cruza con el de '
                            f'{describir_periodo(anterior)}.'
                        ],
                    }
                )
            if errores:
                transaction.set_rollback(True)
                return 0, 0
        return resultado


class PrecioHcViewSet(_PlantillaHc, PrecioViewSet):
    canal = HC
    queryset = PrecioProductoHc.objects.select_related('id_producto').order_by(
        'id_producto__nombre_producto', '-desde'
    )
    serializer_class = PrecioHcSerializer
    nombre_plural = 'los precios Homecenter'
    archivo_plantilla = 'plantilla-precios-hc'
    archivo_exportacion = 'precios-hc'
    columna_producto = _PRODUCTO_HC


class PrecioFalabellaViewSet(_PlantillaFalabella, PrecioViewSet):
    canal = FALABELLA
    queryset = PrecioProductoFalabella.objects.select_related('id_producto').order_by(
        'id_producto__nombre_producto', '-desde'
    )
    serializer_class = PrecioFalabellaSerializer
    nombre_plural = 'los precios Falabella'
    archivo_plantilla = 'plantilla-precios-falabella'
    archivo_exportacion = 'precios-falabella'
    columna_producto = _PRODUCTO_FALABELLA


class PrecioTmkViewSet(_PlantillaTmk, PrecioViewSet):
    canal = TMK
    queryset = PrecioProductoTmk.objects.select_related('id_producto').order_by(
        'id_producto__nombre_producto', '-desde'
    )
    serializer_class = PrecioTmkSerializer
    nombre_plural = 'los precios Tmk Ecommerce Claro'
    archivo_plantilla = 'plantilla-precios-tmk'
    archivo_exportacion = 'precios-tmk'
    columna_producto = _PRODUCTO_TMK
