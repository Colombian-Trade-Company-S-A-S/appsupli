"""
Plan Recomiéndame Belkin: la regla del bono y lo que el plan toma del informe.

Las dos cosas vienen del Power BI con el que Trade liquidaba el plan. Aquí
viven aparte de las vistas porque las usan dos lugares: el tablero del plan y
la importación del informe de ventas de Claro.
"""
from django.db.models import Count

from .informe import Lectura
from .models import (
    AsesorApple,
    FuenteRegistroBelkin,
    ProductoBelkin,
    PuntoVentaBelkin,
    RegistroBelkin,
)

# ── El bono ────────────────────────────────────────────────────────────────

#: Los escalones del bono, del más alto al más bajo: cuánto paga cada paquete y
#: cuántas recomendaciones lo completan según la categoría del punto.
ESCALONES_BONO = (
    (70_000, {1: 36, 2: 24, 3: 18}),
    (50_000, {1: 32, 2: 16, 3: 14}),
    (40_000, {1: 26, 2: 14, 3: 12}),
    (30_000, {1: 20, 2: 12, 3: 10}),
)
#: Lo máximo que gana un promotor en el mes.
TOPE_BONO = 300_000


def calcular_bono(recomendaciones: int, categoria: int | None) -> int:
    """
    El bono del mes para un promotor de un punto de esa categoría.

    Las recomendaciones se reparten en paquetes de mayor a menor: primero todos
    los de 70.000 que alcancen, con lo que sobra los de 50.000, después los de
    40.000 y los de 30.000. Lo que no completa un paquete no paga, y el total se
    corta en el tope. Sin categoría no hay bono.
    """
    if categoria not in ESCALONES_BONO[0][1]:
        return 0
    restante = recomendaciones
    total = 0
    for valor, umbrales in ESCALONES_BONO:
        paquetes, restante = divmod(restante, umbrales[categoria])
        total += paquetes * valor
    return min(total, TOPE_BONO)


def siguiente_bono(recomendaciones: int, categoria: int | None) -> dict | None:
    """
    Cuántas recomendaciones más suben el bono, y a cuánto queda.

    `None` si ya llegó al tope o si el punto no tiene categoría. Con el umbral
    más alto de la categoría siempre se completa un paquete más, así que no
    hace falta buscar más lejos.
    """
    actual = calcular_bono(recomendaciones, categoria)
    if categoria not in ESCALONES_BONO[0][1] or actual >= TOPE_BONO:
        return None
    for faltan in range(1, ESCALONES_BONO[0][1][categoria] + 1):
        nuevo = calcular_bono(recomendaciones + faltan, categoria)
        if nuevo > actual:
            return {'faltan': faltan, 'bono': nuevo}
    return None


def escalones_por_categoria() -> list[dict]:
    """La tabla del bono para mostrarla tal cual en el tablero."""
    return [
        {
            'categoria': categoria,
            'escalones': [
                {'valor': valor, 'recomendaciones': umbrales[categoria]}
                for valor, umbrales in ESCALONES_BONO
            ],
        }
        for categoria in sorted(ESCALONES_BONO[0][1])
    ]


# ── Lo que el plan toma del informe ────────────────────────────────────────


def registros_del_informe(lectura: Lectura, anio: int, mes: int, reemplazar: bool, usuario) -> dict:
    """
    Pasa al plan las ventas Belkin de los puntos fuera de Coltrade.

    Esos puntos no usan el formulario: lo que cuenta para su bono es lo que
    venden, y eso llega en el mismo informe que se importa en Claro. Entra una
    venta si su punto está en el plan sin regional y activo, y si su material
    está en la lista de productos del plan (activo o no: «activo» decide qué
    sale en el formulario, no qué se vende). Cada unidad es un registro, como
    en el formulario.

    Sigue el modo de la importación de ventas: al reemplazar se borra lo que el
    informe había dejado en el mes; al completar se respetan los días que ya
    tienen registros del informe. Lo cargado desde el formulario no se toca.
    """
    puntos = set(
        PuntoVentaBelkin.objects.filter(activo=True, id_regional__isnull=True).values_list(
            'id_punto_venta', flat=True
        )
    )
    productos = set(ProductoBelkin.objects.values_list('id_producto', flat=True))

    # Al punto con un solo asesor activo se le asigna; si tiene varios, o
    # ninguno, el registro queda sin asesor: el informe no dice quién vendió.
    asesor_del_punto = {}
    unicos = (
        AsesorApple.objects.filter(activo=True, id_punto_venta__in=puntos)
        .values('id_punto_venta')
        .annotate(n=Count('pk'))
        .filter(n=1)
        .values_list('id_punto_venta', flat=True)
    )
    for asesor in AsesorApple.objects.filter(activo=True, id_punto_venta__in=list(unicos)):
        asesor_del_punto[asesor.id_punto_venta_id] = asesor.pk

    existentes = RegistroBelkin.objects.filter(
        fuente=FuenteRegistroBelkin.INFORME,
        fecha_recomendacion__year=anio,
        fecha_recomendacion__month=mes,
    )
    eliminados = 0
    if reemplazar:
        eliminados = existentes.count()
        existentes.delete()
        dias_ocupados: set = set()
    else:
        dias_ocupados = set(existentes.values_list('fecha_recomendacion', flat=True).distinct())

    omitidos_por_dia = 0
    nuevos = []
    for (producto, centro, fecha), unidades in sorted(lectura.ventas.items()):
        if fecha.year != anio or fecha.month != mes:
            continue
        if centro not in puntos or producto not in productos:
            continue
        if fecha in dias_ocupados:
            omitidos_por_dia += unidades
            continue
        nuevos.extend(
            RegistroBelkin(
                id_punto_venta_id=centro,
                id_asesor_id=asesor_del_punto.get(centro),
                id_producto_id=producto,
                fecha_recomendacion=fecha,
                fuente=FuenteRegistroBelkin.INFORME,
                registrado_por=usuario if getattr(usuario, 'pk', None) else None,
            )
            for _ in range(unidades)
        )

    RegistroBelkin.objects.bulk_create(nuevos, batch_size=500)
    return {
        'creados': len(nuevos),
        'eliminados': eliminados,
        'omitidos_por_dia': omitidos_por_dia,
        'puntos': sorted({registro.id_punto_venta_id for registro in nuevos}),
    }
