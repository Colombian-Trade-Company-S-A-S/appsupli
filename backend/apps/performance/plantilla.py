"""
La plantilla de Excel con la que se cargan los objetivos de una persona.

Las columnas salen de los mismos campos del formulario, para que cargar seis
objetivos en un archivo sea idéntico a escribirlos uno por uno: mismas reglas,
mismos mensajes de error. Lo único que no va en el archivo es el colaborador y
el periodo, que se eligen en pantalla antes de subirlo — así el mismo archivo
sirve para varias personas.
"""
from apps.core.excel import Columna

from .models import MAXIMO_OBJETIVOS

#: Los encabezados de la plantilla, en el orden en que se llenan.
COLUMNAS = [
    Columna(
        'objetivo',
        ayuda='Qué se espera lograr en el mes, en una frase.',
        ejemplo='Entregar el portal de autogestión BI',
    ),
    Columna(
        'kpi',
        ayuda='Con qué se mide ese objetivo: lo que el jefe revisa en la evidencia.',
        ejemplo='Portal en producción',
    ),
    Columna(
        'peso',
        tipo='decimal',
        ayuda='% de ponderación. Entre todos los objetivos del mes deben sumar 100.',
        ejemplo='40',
    ),
    Columna(
        'fuente_datos',
        obligatoria=False,
        ayuda='De dónde sale el dato con el que se va a medir.',
        ejemplo='Tablero de BI',
    ),
]

NOTA = (
    f'Una fila por objetivo, máximo {MAXIMO_OBJETIVOS} por persona y mes. La suma de la '
    'columna «peso» debe dar exactamente 100: si no llega, el mes no se puede poner en '
    'medición. Todos los objetivos se miden igual, con el % de cumplimiento: no va en el '
    'archivo, se registra en la plataforma de 0 a 100 cuando empieza el mes, con su '
    'evidencia, y lo aprueba el jefe. Los objetivos se cargan hasta el último día del mes '
    'anterior; después el mes queda congelado.'
)
