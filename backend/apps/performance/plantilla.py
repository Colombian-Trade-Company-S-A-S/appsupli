"""
La plantilla de Excel con la que se cargan los objetivos de una persona.

Las columnas salen de los mismos campos del formulario, para que cargar seis
objetivos en un archivo sea idéntico a escribirlos uno por uno: mismas reglas,
mismos mensajes de error. Lo único que no va en el archivo es el colaborador y
el periodo, que se eligen en pantalla antes de subirlo — así el mismo archivo
sirve para varias personas.
"""
from apps.core.excel import Columna

from .models import MAXIMO_OBJETIVOS, TipoMedicion, Unidad

#: Los encabezados de la plantilla, en el orden en que se llenan.
COLUMNAS = [
    Columna(
        'objetivo',
        ayuda='Qué se espera lograr en el mes, en una frase.',
        ejemplo='Entregar el portal de autogestión BI',
    ),
    Columna(
        'kpi',
        ayuda='Con qué se mide ese objetivo.',
        ejemplo='Portal en producción',
    ),
    Columna(
        'tipo_medicion',
        tipo='opcion',
        opciones=list(TipoMedicion.values),
        ayuda=(
            'binario: cumple o no cumple · proporcional: logrado ÷ meta · '
            'proporcional_inverso: menos es mejor · cualitativa: 2 criterios · '
            'formula: fórmula propia.'
        ),
        ejemplo=TipoMedicion.PROPORCIONAL.value,
    ),
    Columna(
        'unidad',
        tipo='opcion',
        obligatoria=False,
        opciones=list(Unidad.values),
        ayuda='Opcional. Los binarios y las cualitativas no la necesitan.',
        ejemplo=Unidad.PORCENTAJE.value,
    ),
    Columna(
        'meta',
        tipo='decimal',
        obligatoria=False,
        ayuda=(
            'Obligatoria en proporcional y proporcional_inverso. '
            'Los binarios y las cualitativas se dejan en blanco.'
        ),
        ejemplo='90',
    ),
    Columna(
        'peso',
        tipo='decimal',
        ayuda='% de ponderación. Entre todos los objetivos del mes deben sumar 100.',
        ejemplo='40',
    ),
    Columna(
        'umbral_cumplimiento',
        tipo='decimal',
        obligatoria=False,
        ayuda='Opcional. Desde dónde cuenta como cumplido para este objetivo.',
        ejemplo='',
    ),
    Columna(
        'permite_sobrecumplimiento',
        tipo='si_no',
        obligatoria=False,
        ayuda='Sí solo donde aplique (ventas, unidades). Por defecto queda topado en 100%.',
        ejemplo='No',
    ),
    Columna(
        'formula',
        obligatoria=False,
        ayuda='Solo para el tipo «formula». Se escribe con logrado y meta.',
        ejemplo='',
    ),
    Columna(
        'fuente_datos',
        obligatoria=False,
        ayuda='De dónde sale el dato con el que se va a medir.',
        ejemplo='Tablero de BI',
    ),
    Columna(
        'responsable_correo',
        obligatoria=False,
        ayuda=(
            'Correo de quien carga el resultado, si no es el propio colaborador. '
            'Para asesores y promotores, su Trade Leader.'
        ),
        ejemplo='',
    ),
]

NOTA = (
    f'Una fila por objetivo, máximo {MAXIMO_OBJETIVOS} por persona y mes. La suma de la '
    'columna «peso» debe dar exactamente 100: si no llega, el mes no se puede poner en '
    'medición. El % de cumplimiento no va en el archivo, lo calcula el sistema con el tipo '
    'de medición. Los objetivos se cargan hasta el último día del mes anterior; después el '
    'mes queda congelado.'
)
