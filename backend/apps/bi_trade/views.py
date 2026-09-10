"""
BI Trade Marketing: CRUD de puntos de venta, productos y ventas, más el
tablero que resume todo.

Leer exige tener la aplicación; escribir exige `bi-trade:data:manage`, que se
reparte con roles desde Administración.
"""
from django.db.models import Count, F, IntegerField, Sum
from django.db.models.functions import TruncMonth
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .api_permissions import CanManageData, HasBiTradeApp
from .models import Producto, PuntoVenta, Venta
from .serializers import (
    OPCIONES,
    ProductoSerializer,
    PuntoVentaSerializer,
    VentaSerializer,
)


class BiTradeViewSet(viewsets.ModelViewSet):
    """Base: cualquiera con la app consulta; solo quien tiene el permiso edita."""

    pagination_class = None

    def get_permissions(self):
        regla = None if self.request.method in ('GET', 'HEAD') else CanManageData
        return [HasBiTradeApp()] + ([regla()] if regla else [])


class PuntoVentaViewSet(BiTradeViewSet):
    queryset = PuntoVenta.objects.prefetch_related('ventas').order_by('nombre_pdv')
    serializer_class = PuntoVentaSerializer
    search_fields = ('id_punto_venta', 'nombre_pdv')
    filterset_fields = ('regional', 'materiales')

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
    search_fields = ('id_producto__nombre_producto', 'id_punto_venta__nombre_pdv')
    filterset_fields = ('id_producto', 'id_punto_venta', 'fecha_venta')


@api_view(['GET'])
@permission_classes([HasBiTradeApp])
def opciones(request):
    """Catálogos para los formularios y los filtros."""
    marcas = list(
        Producto.objects.exclude(marca='')
        .values_list('marca', flat=True)
        .distinct()
        .order_by('marca')
    )
    return Response({**OPCIONES, 'marcas': marcas})


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
