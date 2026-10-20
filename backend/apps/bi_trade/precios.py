"""
El precio Coltrade de un producto en el tiempo.

El precio cambia: en septiembre un producto vale 40.000 y en octubre 48.000, o
cambia a mitad de mes. Cada canal guarda esos cambios como periodos —desde,
hasta y precio— y la regla para leerlos es una sola:

  · **Un día** vale el precio del periodo que lo cubre. Si ningún periodo lo
    cubre, vale el precio del producto: el de siempre, el que tenía antes de
    que existieran los periodos. Así nada cambia hasta que alguien registra un
    precio.
  · **Una venta** se valora con el precio de su día.
  · **Una meta** es del mes entero, así que se valora con el promedio del mes,
    día hábil por día hábil: si la primera mitad valió 48.000 y la segunda
    44.000, la meta queda entre los dos, en proporción a los días hábiles de
    cada uno. Los días hábiles son los mismos entre los que se reparte la meta.

Aquí viven esa regla en Python —para un registro suelto— y su traducción a
expresiones de la base —para sumar miles de ventas sin traerlas a memoria—.
Este módulo no importa los modelos: recibe el canal, que dice de qué tablas
sale cada cosa.
"""

from collections import defaultdict
from datetime import date, timedelta

from django.db.models import (
    Case,
    F,
    IntegerField,
    OuterRef,
    Q,
    Subquery,
    Value,
    When,
)
from django.db.models.functions import Coalesce
from django.utils import timezone

from .calendario import dias_del_mes, dias_habiles

#: Un periodo de precio: (desde, hasta o `None` si sigue vigente, precio).
Rango = tuple[date, date | None, int]


# ── La regla, para un registro suelto ──────────────────────────────────────


def precio_del_dia(rangos: list[Rango], base: int | None, dia: date) -> int | None:
    """El precio de un día: el del periodo que lo cubre, o el del producto."""
    for desde, hasta, precio in rangos:
        if desde <= dia and (hasta is None or dia <= hasta):
            return precio
    return base


def precio_promedio_del_mes(
    rangos: list[Rango], base: int | None, anio: int, mes: int
) -> int | None:
    """
    El precio con que se valora la meta del mes: el promedio de sus días
    hábiles, redondeado al peso.

    Un día sin precio —un producto de Homecenter que nunca lo tuvo— no suma,
    igual que sus ventas. Si ningún día tiene precio, la meta no tiene valor.
    """
    dias = dias_habiles(anio, mes) or dias_del_mes(anio, mes)
    precios = [precio_del_dia(rangos, base, dia) for dia in dias]
    if all(precio is None for precio in precios):
        return None
    return round(sum(precio or 0 for precio in precios) / len(precios))


# ── La regla, en la base ───────────────────────────────────────────────────


def precio_vigente(canal, fecha, base: str = 'id_producto__precio_venta_coltrade') -> Coalesce:
    """
    El precio del producto en una fecha, como expresión.

    `fecha` es una fecha fija (el inventario, que es de hoy) o la columna de
    la fila (`OuterRef('fecha_venta')`). `base` es dónde está el precio del
    producto vista desde la fila: desde una venta, `id_producto__…`; desde el
    producto mismo, su campo. Los periodos de un producto no se pisan —el
    serializer no lo deja—, así que a lo sumo uno cubre la fecha.
    """
    periodo = canal.precio.objects.filter(
        Q(hasta__isnull=True) | Q(hasta__gte=fecha),
        id_producto=OuterRef('id_producto'),
        desde__lte=fecha,
    ).order_by('-desde')
    return Coalesce(
        Subquery(periodo.values('precio_venta_coltrade')[:1]),
        F(base),
        output_field=IntegerField(),
    )


def precio_de_venta(canal) -> Coalesce:
    """El precio del día de cada venta."""
    return precio_vigente(canal, OuterRef('fecha_venta'))


def precio_de_hoy(canal) -> Coalesce:
    """El precio de hoy: el del inventario, que es la foto del stock actual."""
    return precio_vigente(canal, timezone.localdate())


def meses_partidos(canal) -> dict[tuple[str, int, int], int | None]:
    """
    Los meses en que el precio de un producto cambia por dentro, con su precio
    promedio: `(producto, año, mes) → precio`.

    Un mes que un solo precio cubre entero —o que ninguno toca— vale lo mismo
    todos los días, y la base lo resuelve con el precio vigente. Solo los meses
    con un corte adentro necesitan el promedio, y se calculan aquí: el
    calendario de días hábiles no está en la base. Son pocos —los de un cambio
    de precio que no cae el día 1—, así que se leen todos de una vez.
    """
    rangos: dict[str, list[Rango]] = defaultdict(list)
    meses: dict[str, set[tuple[int, int]]] = defaultdict(set)
    for producto, desde, hasta, precio in canal.precio.objects.values_list(
        'id_producto_id', 'desde', 'hasta', 'precio_venta_coltrade'
    ):
        rangos[producto].append((desde, hasta, precio))
        if desde.day != 1:
            meses[producto].add((desde.year, desde.month))
        if hasta is not None and (hasta + timedelta(days=1)).day != 1:
            meses[producto].add((hasta.year, hasta.month))
    if not meses:
        return {}

    bases = dict(
        canal.producto.objects.filter(pk__in=list(meses)).values_list('pk', 'precio_venta_coltrade')
    )
    return {
        (producto, anio, mes): precio_promedio_del_mes(
            rangos[producto], bases.get(producto), anio, mes
        )
        for producto, del_producto in meses.items()
        for anio, mes in del_producto
    }


def precio_de_meta(canal):
    """
    El precio con que se valora cada meta, como expresión.

    Los meses partidos van uno por uno en un `CASE`; el resto toma el precio
    vigente en la fecha de la meta, que es el mismo todo el mes.
    """
    vigente = precio_vigente(canal, OuterRef('fecha_meta'))
    casos = [
        When(
            id_producto=producto,
            fecha_meta__year=anio,
            fecha_meta__month=mes,
            then=Value(precio),
        )
        for (producto, anio, mes), precio in meses_partidos(canal).items()
        if precio is not None
    ]
    if not casos:
        return vigente
    return Case(*casos, default=vigente, output_field=IntegerField())


def anotaciones_meta(canal, con_puntos: bool = True) -> dict:
    """
    El precio, la meta en dinero y la meta en puntos, calculadas en la base.

    Con `con_puntos=False` no van los puntos: es para los canales que no miden
    en puntos, cuyos productos no tienen puntaje.

    El sufijo `_meta` en los alias no es adorno: un alias de `annotate` que se
    llame igual que uno de `aggregate` hace que Django lo resuelva contra sí
    mismo y devuelva cero sin avisar.
    """
    precio = precio_de_meta(canal)
    anotaciones = {
        'precio_mes': precio,
        'dinero_meta': F('meta_cantidad') * precio,
    }
    if con_puntos:
        anotaciones['puntos_meta'] = F('meta_cantidad') * Coalesce('id_producto__puntaje', Value(0))
    return anotaciones
