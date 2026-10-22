"""
Arma el historial de los resultados que ya existían antes de que hubiera
historial.

De cada uno se conoce solo el último estado: quién lo cargó y cuándo, y —si ya
se resolvió— quién lo validó o lo devolvió, con su último comentario. Con eso
se crean uno o dos registros por resultado, con las fechas originales.
"""
from django.db import migrations


def crear_historial(apps, schema_editor):
    Resultado = apps.get_model('performance', 'Resultado')
    Historial = apps.get_model('performance', 'HistorialResultado')

    for resultado in Resultado.objects.all():
        if Historial.objects.filter(resultado=resultado).exists():
            continue
        carga = Historial.objects.create(
            resultado=resultado,
            accion='cargado',
            autor_id=resultado.cargado_por_id,
            comentario=resultado.observacion,
            resultado_ejecutado=resultado.resultado_ejecutado,
            porcentaje_cumplimiento=resultado.porcentaje_cumplimiento,
        )
        if resultado.fecha_carga:
            Historial.objects.filter(pk=carga.pk).update(created_at=resultado.fecha_carga)

        if resultado.estado_validacion in ('validado', 'rechazado'):
            cierre = Historial.objects.create(
                resultado=resultado,
                accion=resultado.estado_validacion,
                autor_id=resultado.validado_por_id,
                comentario=resultado.feedback,
                resultado_ejecutado=resultado.resultado_ejecutado,
                porcentaje_cumplimiento=resultado.porcentaje_cumplimiento,
            )
            if resultado.fecha_validacion:
                Historial.objects.filter(pk=cierre.pk).update(
                    created_at=resultado.fecha_validacion
                )
        elif resultado.feedback:
            comentario = Historial.objects.create(
                resultado=resultado,
                accion='feedback',
                autor_id=resultado.feedback_por_id,
                comentario=resultado.feedback,
                resultado_ejecutado=resultado.resultado_ejecutado,
                porcentaje_cumplimiento=resultado.porcentaje_cumplimiento,
            )
            if resultado.feedback_fecha:
                Historial.objects.filter(pk=comentario.pk).update(
                    created_at=resultado.feedback_fecha
                )


class Migration(migrations.Migration):
    dependencies = [
        ('performance', '0005_historial_del_resultado'),
    ]

    operations = [
        migrations.RunPython(crear_historial, migrations.RunPython.noop),
    ]
