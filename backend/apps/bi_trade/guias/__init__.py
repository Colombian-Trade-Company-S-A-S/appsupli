"""
Las guías de uso de cada informe de BI Trade, en PDF.

Una por informe —Claro, Homecenter, Falabella, Tmk, Plan Partners y Plan
Belkin—, escritas para quien usa el informe, no para quien lo programa. Se
arman en el servidor al pedirlas (botón «Exportar PDF de uso» de cada
tablero), así que el PDF siempre dice lo que dice el código desplegado.

**Cuando cambie un informe, cambia aquí su guía en el mismo commit**: los
botones, los pasos de importación, las reglas de qué entra y qué no. El texto
de los canales está en `canales.py` y el de los planes en `planes.py`.

`python manage.py generar_guias_bi` las escribe en la carpeta
«BI Trade Marketing» de la raíz del repo, para tenerlas también como archivos.
"""
import unicodedata
from functools import cache

from ..permisos import NOMBRES
from .canales import CLARO, FALABELLA, HC, TMK, guia_canal
from .planes import guia_belkin, guia_partners

#: informe → cómo se arma su PDF. Uno por cada informe de `permisos.NOMBRES`.
GUIAS = {
    'claro': lambda: guia_canal(CLARO),
    'hc': lambda: guia_canal(HC),
    'falabella': lambda: guia_canal(FALABELLA),
    'tmk': lambda: guia_canal(TMK),
    'partners': guia_partners,
    'belkin': guia_belkin,
}

#: El orden en la carpeta: el número va delante del nombre del archivo.
ORDEN = ('claro', 'hc', 'falabella', 'tmk', 'partners', 'belkin')


@cache
def pdf_de(informe: str) -> bytes:
    """
    El PDF de la guía de un informe.

    Se arma una vez por proceso: el texto solo cambia con un despliegue, que
    reinicia el proceso, así que la siguiente descarga ya sale con lo nuevo.
    """
    return GUIAS[informe]()


def nombre_de(informe: str) -> str:
    """«Guía de uso - Informe de Ventas HC.pdf»."""
    return f'Guía de uso - {NOMBRES[informe]}.pdf'


def nombre_ascii(informe: str) -> str:
    """El mismo nombre sin tildes, para los navegadores que no leen `filename*`."""
    sin_tildes = unicodedata.normalize('NFKD', nombre_de(informe))
    return sin_tildes.encode('ascii', 'ignore').decode('ascii')
