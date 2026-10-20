"""
El catálogo de marcas: una sola lista para Claro, Homecenter, Falabella y Tmk.

Consultarla pide la app; cambiarla pide el permiso de editar los datos. Lo
que se cambia aquí cambia en todos los productos que la usan, de todos los
canales: renombrar una marca la renombra en cada producto, y fusionar dos
deja todos sus productos en la que queda.
"""

from django.db import transaction
from django.db.models import Count, OuterRef, Subquery, Value
from django.db.models.functions import Coalesce
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from .api_permissions import CanManageData, HasBiTradeApp
from .canales import CANALES
from .models import Marca
from .serializers import MarcaSerializer
from .views import BiTradeViewSet


def productos_de(marca: Marca) -> int:
    """Cuántos productos la usan, sumando los cuatro canales."""
    return sum(canal.producto.objects.filter(marca=marca).count() for canal in CANALES.values())


class MarcaViewSet(BiTradeViewSet):
    serializer_class = MarcaSerializer
    search_fields = ('nombre',)
    nombre_plural = 'las marcas'

    def get_queryset(self):
        conteos = [
            Coalesce(
                Subquery(
                    canal.producto.objects.filter(marca=OuterRef('nombre'))
                    .values('marca')
                    .annotate(n=Count('pk'))
                    .values('n')[:1]
                ),
                Value(0),
            )
            for canal in CANALES.values()
        ]
        return Marca.objects.annotate(productos_count=sum(conteos[1:], conteos[0])).order_by(
            'nombre'
        )

    def dependencias(self):
        return [('productos', sum(productos_de(marca) for marca in Marca.objects.all()))]

    @transaction.atomic
    def perform_update(self, serializer):
        """
        Renombrar una marca la renombra en sus productos, en la misma transacción.

        La llave del producto es el nombre: la base acepta el cambio porque
        revisa esa llave al cerrar la transacción, cuando ya todos se movieron.
        """
        anterior = serializer.instance.nombre
        marca = serializer.save()
        if marca.nombre != anterior:
            for canal in CANALES.values():
                canal.producto.objects.filter(marca_id=anterior).update(marca=marca)

    def destroy(self, request, *args, **kwargs):
        marca = self.get_object()
        en_uso = productos_de(marca)
        if en_uso:
            return Response(
                {
                    'code': 'protected',
                    'message': (
                        f'«{marca.nombre}» tiene {en_uso} producto(s). Fusiónala con la marca '
                        'que corresponde para moverlos, o cámbiales la marca primero.'
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)

    @action(
        detail=True,
        methods=['post'],
        url_path='fusionar',
        permission_classes=[HasBiTradeApp, CanManageData],
    )
    def fusionar(self, request, pk=None):
        """
        Pasa todos los productos de esta marca a `destino` y la borra.

        Es como se corrige un duplicado: «Generico» se fusiona con «Generica» y
        queda una sola, con los productos de las dos.
        """
        origen = self.get_object()
        nombre = ' '.join(str(request.data.get('destino') or '').split())
        destino = Marca.objects.filter(nombre=nombre).exclude(pk=origen.pk).first()
        if destino is None:
            return Response(
                {'code': 'invalid', 'message': 'Elige otra marca de la lista para fusionarla.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            movidos = sum(
                canal.producto.objects.filter(marca=origen).update(marca=destino)
                for canal in CANALES.values()
            )
            origen.delete()

        return Response(
            {
                'movidos': movidos,
                'destino': MarcaSerializer(destino).data,
                'message': (
                    f'«{origen.nombre}» se fusionó con «{destino.nombre}»: '
                    f'{movidos} producto(s) quedaron en «{destino.nombre}».'
                ),
            }
        )
