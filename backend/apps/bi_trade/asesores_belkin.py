"""
La historia de los asesores Apple de un punto: quién fue el asesor y cuándo.

Los asesores que se suceden en un punto forman una cadena (`reemplaza`): cada
uno termina el día antes de que empiece el siguiente, sin huecos ni cruces.
Por eso, al mover una fecha se mueve también la del vecino:

    Julián  1 oct → 31 oct      Daniel  1 nov → hoy
    (si Julián termina el 15 oct, Daniel empieza el 16 oct)

El primero de la cadena puede no tener inicio (era el asesor antes de llevar
fechas) y el último no tiene fin: es el asesor de hoy, el que sale en el
formulario. Un punto con dos asesores a la vez tiene dos cadenas.

Cada recomendación es de quien era el asesor ese día: al mover las fechas, lo
registrado se reacomoda entre los asesores de la cadena según su fecha.
"""
from __future__ import annotations

from datetime import date, timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import AsesorApple, RegistroBelkin


def _f(fecha: date | None) -> str:
    return f'{fecha:%d/%m/%Y}' if fecha else ''


def siguiente_de(asesor: AsesorApple) -> AsesorApple | None:
    return AsesorApple.objects.filter(reemplaza=asesor).first()


def cadena(asesor: AsesorApple) -> list[AsesorApple]:
    """Toda la cadena del asesor, del primero al último."""
    primero = asesor
    vistos = {primero.pk}
    while primero.reemplaza_id and primero.reemplaza_id not in vistos:
        primero = primero.reemplaza
        vistos.add(primero.pk)
    eslabones = [primero]
    while (siguiente := siguiente_de(eslabones[-1])) and siguiente.pk not in {
        e.pk for e in eslabones
    }:
        eslabones.append(siguiente)
    return eslabones


def _activo(hasta: date | None) -> bool:
    return hasta is None or hasta >= timezone.localdate()


def reacomodar_registros(eslabones: list[AsesorApple]) -> int:
    """
    Le da cada recomendación de la cadena a quien era el asesor ese día.

    Solo entre los de la cadena: lo de otro asesor del punto (otra cadena) no
    se toca. Lo que ningún eslabón cubre se deja como está.
    """
    movidos = 0
    ids = [e.pk for e in eslabones]
    for registro in RegistroBelkin.objects.filter(id_asesor_id__in=ids).only(
        'id_registro', 'id_asesor_id', 'fecha_recomendacion'
    ):
        dueno = next((e for e in eslabones if e.vigente_en(registro.fecha_recomendacion)), None)
        if dueno and dueno.pk != registro.id_asesor_id:
            RegistroBelkin.objects.filter(pk=registro.pk).update(id_asesor=dueno)
            movidos += 1
    return movidos


@transaction.atomic
def ajustar_vigencia(asesor: AsesorApple, desde: date | None, hasta: date | None) -> int:
    """
    Pone las fechas del asesor y ajusta las de sus vecinos en la cadena.

    Reglas: el inicio va antes del fin; el inicio no puede ir antes del inicio
    del anterior (se le acortaría a cero) y el fin no puede pasar del fin del
    siguiente. Quien tiene un siguiente tiene fin; el último puede no tenerlo.
    Devuelve cuántas recomendaciones cambiaron de asesor.
    """
    anterior = asesor.reemplaza
    siguiente = siguiente_de(asesor)

    if anterior and desde is None:
        raise ValidationError(
            {'desde': f'Reemplazó a {anterior.nombre}: hay que decir desde cuándo.'}
        )
    if siguiente and hasta is None:
        raise ValidationError(
            {'hasta': f'Lo reemplazó {siguiente.nombre}: hay que decir hasta cuándo.'}
        )
    if desde and hasta and hasta < desde:
        raise ValidationError({'hasta': 'El fin va después del inicio.'})
    if anterior and anterior.desde and desde <= anterior.desde:
        raise ValidationError(
            {'desde': f'{anterior.nombre} empezó el {_f(anterior.desde)}: '
                      'el inicio tiene que ser después.'}
        )
    if siguiente and siguiente.hasta and hasta >= siguiente.hasta:
        raise ValidationError(
            {'hasta': f'{siguiente.nombre} terminó el {_f(siguiente.hasta)}: '
                      'el fin tiene que ser antes.'}
        )

    asesor.desde, asesor.hasta, asesor.activo = desde, hasta, _activo(hasta)
    asesor.save(update_fields=['desde', 'hasta', 'activo', 'updated_at'])
    if anterior:
        anterior.hasta = desde - timedelta(days=1)
        anterior.activo = _activo(anterior.hasta)
        anterior.save(update_fields=['hasta', 'activo', 'updated_at'])
    if siguiente:
        siguiente.desde = hasta + timedelta(days=1)
        siguiente.activo = _activo(siguiente.hasta)
        siguiente.save(update_fields=['desde', 'activo', 'updated_at'])
    return reacomodar_registros(cadena(asesor))


@transaction.atomic
def cambiar_asesor(anterior: AsesorApple, nombre: str, desde: date) -> tuple[AsesorApple, int]:
    """
    Desde `desde`, el asesor del punto es otro. El anterior conserva su nombre
    y lo suyo; termina el día antes. Devuelve el nuevo y cuántas
    recomendaciones pasaron a él (las del anterior desde esa fecha).
    """
    nombre = (nombre or '').strip()
    if not nombre:
        raise ValidationError({'nombre': 'Escribe el nombre del nuevo asesor.'})
    if siguiente_de(anterior):
        raise ValidationError(
            {'nombre': f'A {anterior.nombre} ya lo reemplazó {siguiente_de(anterior).nombre}.'}
        )
    if anterior.desde and desde <= anterior.desde:
        raise ValidationError(
            {'desde': f'{anterior.nombre} es asesor desde el {_f(anterior.desde)}: '
                      'el cambio tiene que ser después.'}
        )
    if anterior.hasta and desde > anterior.hasta + timedelta(days=1):
        raise ValidationError(
            {'desde': f'{anterior.nombre} ya dejó de ser asesor el {_f(anterior.hasta)}.'}
        )
    punto = anterior.id_punto_venta
    if (
        AsesorApple.objects.filter(id_punto_venta=punto, nombre__iexact=nombre)
        .exclude(pk=anterior.pk)
        .exists()
    ):
        raise ValidationError({'nombre': f'«{nombre}» ya es asesor de {punto.nombre_pdv}.'})

    anterior.hasta = desde - timedelta(days=1)
    anterior.activo = _activo(anterior.hasta)
    anterior.save(update_fields=['hasta', 'activo', 'updated_at'])
    nuevo = AsesorApple.objects.create(
        nombre=nombre, id_punto_venta=punto, desde=desde, activo=True, reemplaza=anterior
    )
    return nuevo, reacomodar_registros(cadena(nuevo))
