"""Serializers de BI Trade Marketing."""
from rest_framework import serializers

from .models import Materiales, Producto, PuntoVenta, Regional, Venta


class PuntoVentaSerializer(serializers.ModelSerializer):
    ventas_count = serializers.IntegerField(source='ventas.count', read_only=True)

    class Meta:
        model = PuntoVenta
        fields = (
            'id_punto_venta',
            'nombre_pdv',
            'regional',
            'materiales',
            'ventas_count',
        )

    def validate_id_punto_venta(self, value: str) -> str:
        """La PK la escribe la persona, así que hay que cuidar los duplicados."""
        codigo = value.strip()
        if not codigo:
            raise serializers.ValidationError('El código no puede ir vacío.')
        if self.instance is None and PuntoVenta.objects.filter(pk=codigo).exists():
            raise serializers.ValidationError(
                f'Ya existe un punto de venta con el código {codigo}.'
            )
        return codigo


class ProductoSerializer(serializers.ModelSerializer):
    ventas_count = serializers.IntegerField(source='ventas.count', read_only=True)

    class Meta:
        model = Producto
        fields = (
            'id_producto',
            'nombre_producto',
            'marca',
            'precio_venta_claro',
            'precio_venta_coltrade',
            'puntaje',
            'ventas_count',
        )

    def validate_id_producto(self, value: str) -> str:
        codigo = value.strip()
        if not codigo:
            raise serializers.ValidationError('El código no puede ir vacío.')
        if self.instance is None and Producto.objects.filter(pk=codigo).exists():
            raise serializers.ValidationError(f'Ya existe un producto con el código {codigo}.')
        return codigo


class VentaSerializer(serializers.ModelSerializer):
    nombre_producto = serializers.CharField(source='id_producto.nombre_producto', read_only=True)
    marca = serializers.CharField(source='id_producto.marca', read_only=True)
    nombre_pdv = serializers.CharField(source='id_punto_venta.nombre_pdv', read_only=True)
    regional = serializers.CharField(source='id_punto_venta.regional', read_only=True, default='')
    precio_venta_coltrade = serializers.IntegerField(
        source='id_producto.precio_venta_coltrade', read_only=True
    )
    total_coltrade = serializers.IntegerField(read_only=True)

    class Meta:
        model = Venta
        fields = (
            'id_venta',
            'id_producto',
            'nombre_producto',
            'marca',
            'id_punto_venta',
            'nombre_pdv',
            'regional',
            'fecha_venta',
            'cantidad_vendida',
            'precio_venta_coltrade',
            'total_coltrade',
        )

    def validate_cantidad_vendida(self, value: int) -> int:
        if value < 1:
            raise serializers.ValidationError('La cantidad vendida debe ser al menos 1.')
        return value


# Catálogos que el frontend necesita para pintar los formularios.
OPCIONES = {
    'regionales': [{'value': v, 'label': etiqueta} for v, etiqueta in Regional.choices],
    'materiales': [{'value': v, 'label': etiqueta} for v, etiqueta in Materiales.choices],
}
