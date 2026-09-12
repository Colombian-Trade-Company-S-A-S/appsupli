"""Serializers de BI Trade Marketing."""
from django.utils import timezone
from rest_framework import serializers
from rest_framework.validators import UniqueTogetherValidator

from .models import (
    PRECIO_MAXIMO,
    Acelerador,
    Campana,
    EscalaTicket,
    Inventario,
    InventarioFalabella,
    InventarioHc,
    InventarioTmk,
    MarcaPartner,
    Materiales,
    MetaComercial,
    MetaComercialFalabella,
    MetaComercialHc,
    MetaComercialTmk,
    MetaPartner,
    Producto,
    ProductoFalabella,
    ProductoHc,
    ProductoPartner,
    ProductoTmk,
    PuntoVenta,
    PuntoVentaFalabella,
    PuntoVentaHc,
    PuntoVentaPartner,
    PuntoVentaTmk,
    Regional,
    RegionalFalabella,
    RegionalHc,
    RegionalPartner,
    RegionalTmk,
    RegistroPartner,
    Venta,
    VentaFalabella,
    VentaHc,
    VentaTmk,
)


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
        # `self.Meta.model` y no `PuntoVenta`: el serializer de Homecenter
        # hereda esta validación y tiene que mirar su propia tabla.
        if self.instance is None and self.Meta.model.objects.filter(pk=codigo).exists():
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
        if self.instance is None and self.Meta.model.objects.filter(pk=codigo).exists():
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


class _ParProductoPunto(serializers.ModelSerializer):
    """Campos comunes de todo lo que cuelga de un producto y un punto de venta."""

    nombre_producto = serializers.CharField(source='id_producto.nombre_producto', read_only=True)
    marca = serializers.CharField(source='id_producto.marca', read_only=True)
    nombre_pdv = serializers.CharField(source='id_punto_venta.nombre_pdv', read_only=True)
    regional = serializers.CharField(source='id_punto_venta.regional', read_only=True, default='')


class InventarioSerializer(_ParProductoPunto):
    class Meta:
        model = Inventario
        # DRF genera una validación de unicidad desde el modelo; se declara
        # aquí solo para reemplazar su mensaje en inglés por uno que diga qué
        # hacer.
        validators = [
            UniqueTogetherValidator(
                queryset=Inventario.objects.all(),
                fields=('id_producto', 'id_punto_venta'),
                message=(
                    'Ya hay inventario cargado de ese producto en ese punto de venta. '
                    'Edita el registro que existe en vez de crear otro.'
                ),
            )
        ]
        fields = (
            'id_inventario',
            'id_producto',
            'nombre_producto',
            'marca',
            'id_punto_venta',
            'nombre_pdv',
            'regional',
            'cantidad_inventario',
        )


class MetaSerializer(_ParProductoPunto):
    # Calculados, no guardados: salen de las unidades por el precio y el
    # puntaje del producto, como el total de una venta.
    meta_dinero = serializers.IntegerField(read_only=True)
    meta_puntos = serializers.IntegerField(read_only=True)
    precio_venta_coltrade = serializers.IntegerField(
        source='id_producto.precio_venta_coltrade', read_only=True
    )
    puntaje = serializers.IntegerField(
        source='id_producto.puntaje', read_only=True, default=0
    )

    class Meta:
        model = MetaComercial
        # La fecha entra en la llave: dos periodos distintos no se pisan.
        validators = [
            UniqueTogetherValidator(
                queryset=MetaComercial.objects.all(),
                fields=('id_producto', 'id_punto_venta', 'fecha_meta'),
                message=(
                    'Ya hay una meta de ese producto en ese punto de venta para esa fecha. '
                    'Edita la que existe, o cambia la fecha si es la meta de otro periodo.'
                ),
            )
        ]
        fields = (
            'id_meta',
            'id_producto',
            'nombre_producto',
            'marca',
            'id_punto_venta',
            'nombre_pdv',
            'regional',
            'fecha_meta',
            'meta_cantidad',
            'precio_venta_coltrade',
            'puntaje',
            'meta_dinero',
            'meta_puntos',
        )

    def validate_meta_cantidad(self, value: int) -> int:
        if value < 1:
            raise serializers.ValidationError('La meta de unidades debe ser al menos 1.')
        return value


# Catálogos que el frontend necesita para pintar los formularios.
OPCIONES = {
    'regionales': [{'value': v, 'label': etiqueta} for v, etiqueta in Regional.choices],
    'materiales': [{'value': v, 'label': etiqueta} for v, etiqueta in Materiales.choices],
}


class EscalaTicketSerializer(serializers.ModelSerializer):
    class Meta:
        model = EscalaTicket
        fields = ('id_escala', 'ventas', 'tickets')


class AceleradorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Acelerador
        fields = ('id_acelerador', 'ventas_totales', 'tickets_por_dia')


class CampanaSerializer(serializers.ModelSerializer):
    """
    Una campaña con sus escalas y aceleradores dentro.

    Van anidados y escribibles porque no se editan por separado: una escala
    suelta no significa nada sin su campaña, y guardar el concurso en varias
    llamadas dejaría reglas a medias si una falla.
    """

    escalas = EscalaTicketSerializer(many=True, required=False)
    aceleradores = AceleradorSerializer(many=True, required=False)
    dias = serializers.SerializerMethodField()

    class Meta:
        model = Campana
        fields = (
            'id_campana',
            'nombre',
            'desde',
            'hasta',
            'activa',
            'ventas_minimas',
            'tickets_minimos',
            'productos_foco',
            'foco_minimo',
            'productos_cargador',
            'bono_ventas',
            'bono_cargadores',
            'bono_tickets',
            'escalas',
            'aceleradores',
            'dias',
        )

    def get_dias(self, obj) -> int:
        """Cuántos días dura la vigencia, contando los dos extremos."""
        return (obj.hasta - obj.desde).days + 1

    def validate(self, datos):
        desde = datos.get('desde', getattr(self.instance, 'desde', None))
        hasta = datos.get('hasta', getattr(self.instance, 'hasta', None))
        if desde and hasta and hasta < desde:
            raise serializers.ValidationError(
                {'hasta': 'La fecha final no puede ser anterior a la inicial.'}
            )
        return datos

    def _guardar_reglas(self, campana, escalas, aceleradores):
        """Reemplaza las reglas por las que llegaron, si llegaron."""
        if escalas is not None:
            campana.escalas.all().delete()
            EscalaTicket.objects.bulk_create(
                EscalaTicket(campana=campana, **escala) for escala in escalas
            )
        if aceleradores is not None:
            campana.aceleradores.all().delete()
            Acelerador.objects.bulk_create(
                Acelerador(campana=campana, **acelerador) for acelerador in aceleradores
            )

    def create(self, validated_data):
        escalas = validated_data.pop('escalas', None)
        aceleradores = validated_data.pop('aceleradores', None)
        foco = validated_data.pop('productos_foco', [])
        cargador = validated_data.pop('productos_cargador', [])
        campana = Campana.objects.create(**validated_data)
        campana.productos_foco.set(foco)
        campana.productos_cargador.set(cargador)
        self._guardar_reglas(campana, escalas, aceleradores)
        return campana

    def update(self, instance, validated_data):
        escalas = validated_data.pop('escalas', None)
        aceleradores = validated_data.pop('aceleradores', None)
        foco = validated_data.pop('productos_foco', None)
        cargador = validated_data.pop('productos_cargador', None)
        for campo, valor in validated_data.items():
            setattr(instance, campo, valor)
        instance.save()
        if foco is not None:
            instance.productos_foco.set(foco)
        if cargador is not None:
            instance.productos_cargador.set(cargador)
        self._guardar_reglas(instance, escalas, aceleradores)
        return instance


OPCIONES_HC = {
    'regionales': [{'value': v, 'label': etiqueta} for v, etiqueta in RegionalHc.choices],
    'materiales': [{'value': v, 'label': etiqueta} for v, etiqueta in Materiales.choices],
}


# ── Homecenter ─────────────────────────────────────────────────────────────
# Los mismos serializers sobre las tablas `_hc`. El JSON sale con los mismos
# nombres que el de Claro: así las pantallas sirven a los dos canales.


#: Lo que no tienen los canales sin puntos (Homecenter, Falabella, Tmk): ni
#: el puntaje del producto ni la meta en puntos.
CAMPOS_DE_PUNTOS = ('puntaje', 'meta_puntos')


def _sin_puntos(campos: tuple) -> tuple:
    return tuple(campo for campo in campos if campo not in CAMPOS_DE_PUNTOS)


class PuntoVentaHcSerializer(PuntoVentaSerializer):
    class Meta(PuntoVentaSerializer.Meta):
        model = PuntoVentaHc


class ProductoHcSerializer(ProductoSerializer):
    # En la base es `precio_venta_hc`; en el JSON conserva el nombre de Claro
    # para que la pantalla de productos sea la misma.
    precio_venta_claro = serializers.IntegerField(
        source='precio_venta_hc', min_value=0, max_value=PRECIO_MAXIMO
    )

    class Meta(ProductoSerializer.Meta):
        model = ProductoHc
        fields = _sin_puntos(ProductoSerializer.Meta.fields)


class VentaHcSerializer(VentaSerializer):
    class Meta(VentaSerializer.Meta):
        model = VentaHc


class InventarioHcSerializer(InventarioSerializer):
    class Meta(InventarioSerializer.Meta):
        model = InventarioHc
        validators = [
            UniqueTogetherValidator(
                queryset=InventarioHc.objects.all(),
                fields=('id_producto', 'id_punto_venta'),
                message=InventarioSerializer.Meta.validators[0].message,
            )
        ]


class MetaHcSerializer(MetaSerializer):
    # Sin puntos: `None` quita los campos que declara el serializer de Claro.
    meta_puntos = None
    puntaje = None

    class Meta(MetaSerializer.Meta):
        model = MetaComercialHc
        fields = _sin_puntos(MetaSerializer.Meta.fields)
        validators = [
            UniqueTogetherValidator(
                queryset=MetaComercialHc.objects.all(),
                fields=('id_producto', 'id_punto_venta', 'fecha_meta'),
                message=MetaSerializer.Meta.validators[0].message,
            )
        ]


OPCIONES_FALABELLA = {
    'regionales': [{'value': v, 'label': etiqueta} for v, etiqueta in RegionalFalabella.choices],
    'materiales': [{'value': v, 'label': etiqueta} for v, etiqueta in Materiales.choices],
}


# ── Falabella ──────────────────────────────────────────────────────────────
# Los mismos serializers sobre las tablas `_falabella`, con el mismo JSON que
# Claro y Homecenter.


class PuntoVentaFalabellaSerializer(PuntoVentaSerializer):
    class Meta(PuntoVentaSerializer.Meta):
        model = PuntoVentaFalabella


class ProductoFalabellaSerializer(ProductoSerializer):
    # En la base es `precio_venta_falabella`; en el JSON conserva el nombre de
    # Claro para que la pantalla de productos sea la misma.
    precio_venta_claro = serializers.IntegerField(
        source='precio_venta_falabella', min_value=0, max_value=PRECIO_MAXIMO
    )

    class Meta(ProductoSerializer.Meta):
        model = ProductoFalabella
        fields = _sin_puntos(ProductoSerializer.Meta.fields)


class VentaFalabellaSerializer(VentaSerializer):
    class Meta(VentaSerializer.Meta):
        model = VentaFalabella


class InventarioFalabellaSerializer(InventarioSerializer):
    class Meta(InventarioSerializer.Meta):
        model = InventarioFalabella
        validators = [
            UniqueTogetherValidator(
                queryset=InventarioFalabella.objects.all(),
                fields=('id_producto', 'id_punto_venta'),
                message=InventarioSerializer.Meta.validators[0].message,
            )
        ]


class MetaFalabellaSerializer(MetaSerializer):
    # Sin puntos: `None` quita los campos que declara el serializer de Claro.
    meta_puntos = None
    puntaje = None

    class Meta(MetaSerializer.Meta):
        model = MetaComercialFalabella
        fields = _sin_puntos(MetaSerializer.Meta.fields)
        validators = [
            UniqueTogetherValidator(
                queryset=MetaComercialFalabella.objects.all(),
                fields=('id_producto', 'id_punto_venta', 'fecha_meta'),
                message=MetaSerializer.Meta.validators[0].message,
            )
        ]


OPCIONES_TMK = {
    'regionales': [{'value': v, 'label': etiqueta} for v, etiqueta in RegionalTmk.choices],
    'materiales': [{'value': v, 'label': etiqueta} for v, etiqueta in Materiales.choices],
}


# ── Tmk Ecommerce Claro ──────────────────────────────────────────────────────────────
# Los mismos serializers sobre las tablas `_tmk`, con el mismo JSON que
# Claro y Homecenter.


class PuntoVentaTmkSerializer(PuntoVentaSerializer):
    class Meta(PuntoVentaSerializer.Meta):
        model = PuntoVentaTmk


class ProductoTmkSerializer(ProductoSerializer):
    # En la base es `precio_venta_tmk`; en el JSON conserva el nombre de
    # Claro para que la pantalla de productos sea la misma.
    precio_venta_claro = serializers.IntegerField(
        source='precio_venta_tmk', min_value=0, max_value=PRECIO_MAXIMO
    )

    class Meta(ProductoSerializer.Meta):
        model = ProductoTmk
        fields = _sin_puntos(ProductoSerializer.Meta.fields)


class VentaTmkSerializer(VentaSerializer):
    class Meta(VentaSerializer.Meta):
        model = VentaTmk


class InventarioTmkSerializer(InventarioSerializer):
    class Meta(InventarioSerializer.Meta):
        model = InventarioTmk
        validators = [
            UniqueTogetherValidator(
                queryset=InventarioTmk.objects.all(),
                fields=('id_producto', 'id_punto_venta'),
                message=InventarioSerializer.Meta.validators[0].message,
            )
        ]


class MetaTmkSerializer(MetaSerializer):
    # Sin puntos: `None` quita los campos que declara el serializer de Claro.
    meta_puntos = None
    puntaje = None

    class Meta(MetaSerializer.Meta):
        model = MetaComercialTmk
        fields = _sin_puntos(MetaSerializer.Meta.fields)
        validators = [
            UniqueTogetherValidator(
                queryset=MetaComercialTmk.objects.all(),
                fields=('id_producto', 'id_punto_venta', 'fecha_meta'),
                message=MetaSerializer.Meta.validators[0].message,
            )
        ]


# ── Plan Partners ──────────────────────────────────────────────────────────
# El formulario guarda el código del punto y del producto; `etiqueta` es el
# texto con los dos pegados, que es como los lee quien llena el formulario.


class RegionalPartnerSerializer(serializers.ModelSerializer):
    puntos_count = serializers.IntegerField(source='puntos_venta.count', read_only=True)
    registros_count = serializers.IntegerField(source='registros.count', read_only=True)

    class Meta:
        model = RegionalPartner
        fields = ('id_regional', 'nombre', 'activa', 'puntos_count', 'registros_count')

    def validate_nombre(self, value: str) -> str:
        nombre = value.strip()
        if not nombre:
            raise serializers.ValidationError('El nombre no puede ir vacío.')
        repetida = RegionalPartner.objects.filter(nombre__iexact=nombre)
        if self.instance:
            repetida = repetida.exclude(pk=self.instance.pk)
        if repetida.exists():
            raise serializers.ValidationError(f'Ya existe la regional «{nombre}».')
        return nombre


class PuntoVentaPartnerSerializer(serializers.ModelSerializer):
    etiqueta = serializers.CharField(read_only=True)
    regional = serializers.CharField(source='id_regional.nombre', read_only=True)
    registros_count = serializers.IntegerField(source='registros.count', read_only=True)

    class Meta:
        model = PuntoVentaPartner
        fields = (
            'id_punto_venta',
            'nombre_pdv',
            'id_regional',
            'regional',
            'activo',
            'etiqueta',
            'registros_count',
        )

    def validate_id_punto_venta(self, value: str) -> str:
        """La PK la escribe la persona, así que hay que cuidar los duplicados."""
        codigo = value.strip()
        if not codigo:
            raise serializers.ValidationError('El código no puede ir vacío.')
        if self.instance is None and PuntoVentaPartner.objects.filter(pk=codigo).exists():
            raise serializers.ValidationError(
                f'Ya existe un punto de venta con el código {codigo}.'
            )
        return codigo


class ProductoPartnerSerializer(serializers.ModelSerializer):
    etiqueta = serializers.CharField(read_only=True)
    registros_count = serializers.IntegerField(source='registros.count', read_only=True)

    class Meta:
        model = ProductoPartner
        fields = (
            'id_producto',
            'nombre_producto',
            'precio',
            'activo',
            'etiqueta',
            'registros_count',
        )

    def validate_id_producto(self, value: str) -> str:
        codigo = value.strip()
        if not codigo:
            raise serializers.ValidationError('El código no puede ir vacío.')
        if self.instance is None and ProductoPartner.objects.filter(pk=codigo).exists():
            raise serializers.ValidationError(f'Ya existe un producto con el código {codigo}.')
        return codigo


class RegistroPartnerSerializer(serializers.ModelSerializer):
    regional = serializers.CharField(source='id_regional.nombre', read_only=True)
    nombre_pdv = serializers.CharField(source='id_punto_venta.nombre_pdv', read_only=True)
    punto_venta_etiqueta = serializers.CharField(source='id_punto_venta.etiqueta', read_only=True)
    nombre_producto = serializers.CharField(source='id_producto.nombre_producto', read_only=True)
    producto_etiqueta = serializers.CharField(source='id_producto.etiqueta', read_only=True)
    origen = serializers.SerializerMethodField()

    class Meta:
        model = RegistroPartner
        fields = (
            'id_registro',
            'id_regional',
            'regional',
            'marca',
            'id_punto_venta',
            'nombre_pdv',
            'punto_venta_etiqueta',
            'id_producto',
            'nombre_producto',
            'producto_etiqueta',
            'fecha_recomendacion',
            'serial',
            'documento_promotor',
            'factura',
            'origen',
            'created_at',
        )

    def get_origen(self, obj) -> str:
        """Quién lo cargó: la persona con cuenta, o el enlace público."""
        if obj.registrado_por_id:
            return obj.registrado_por.full_name
        if obj.enlace_id:
            return f'Enlace · {obj.enlace.nombre}'
        return ''

    def validate_serial(self, value: str) -> str:
        serial = value.strip()
        if not serial:
            raise serializers.ValidationError('El serial no puede ir vacío.')
        return serial

    def validate_documento_promotor(self, value: str) -> str:
        documento = value.strip()
        if not documento.isdigit():
            raise serializers.ValidationError('El documento va sin puntos ni letras.')
        if not 5 <= len(documento) <= 15:
            raise serializers.ValidationError('El documento debe tener entre 5 y 15 dígitos.')
        return documento

    def validate_factura(self, value: str) -> str:
        factura = value.strip()
        if not factura:
            raise serializers.ValidationError('La factura no puede ir vacía.')
        return factura

    def validate_fecha_recomendacion(self, value):
        if value > timezone.localdate():
            raise serializers.ValidationError('La fecha no puede ser futura.')
        return value

    def validate(self, attrs: dict) -> dict:
        """El punto de venta tiene que ser de la regional elegida.

        Si no se cruzan, lo más probable es que se haya cambiado la regional
        después de elegir el punto, y el registro quedaría mal clasificado.
        """
        punto = attrs.get('id_punto_venta') or getattr(self.instance, 'id_punto_venta', None)
        regional = attrs.get('id_regional') or getattr(self.instance, 'id_regional', None)
        if punto and regional and punto.id_regional_id != regional.pk:
            raise serializers.ValidationError(
                {
                    'id_punto_venta': (
                        f'«{punto.nombre_pdv}» es de {punto.id_regional.nombre}, '
                        f'no de {regional.nombre}.'
                    )
                }
            )
        return attrs


class MetaPartnerSerializer(serializers.ModelSerializer):
    nombre_pdv = serializers.CharField(source='id_punto_venta.nombre_pdv', read_only=True)
    regional = serializers.CharField(source='id_punto_venta.id_regional.nombre', read_only=True)

    class Meta:
        model = MetaPartner
        fields = (
            'id_meta',
            'anio',
            'mes',
            'id_punto_venta',
            'nombre_pdv',
            'regional',
            'marca',
            'meta_unidades',
        )


MARCAS_PARTNERS = [{'value': v, 'label': etiqueta} for v, etiqueta in MarcaPartner.choices]
