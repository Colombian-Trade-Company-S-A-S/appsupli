"""
Lo común a crear catálogo desde los reportes de los portales (Falabella, HC).

Cuando un reporte de ventas o inventario trae productos —o tiendas— que no
existen en la app, se ofrecen para crear con los datos del mismo archivo. Aquí
está lo que no depende del canal: cómo se escribe un nombre y de dónde sale la
marca.
"""
import re
from collections.abc import Callable

from .models import Marca
from .serializers import clave_de_marca

#: Marcas que los portales escriben de dos formas: quedan como una sola.
MARCAS_EQUIVALENTES = {'generica': 'generico'}

#: Qué hacer con lo que el archivo trae y no existe: el campo `productos` de
#: la importación. Sin él, si falta algo se pregunta antes de importar (409
#: `productos_por_crear`, con la vista previa).
CREAR = 'crear'
OMITIR = 'omitir'


def decision_de(request) -> str:
    return (request.data.get('productos') or '').strip()

# ── Nombre propio ──────────────────────────────────────────────────────────
# Como el resto del catálogo: «ECHO DOT 5TA GEN» → «Echo Dot 5ta Gen». Las
# siglas se quedan en mayúscula, los conectores en minúscula y lo que va
# pegado a un número también («5ta», «1m»).

_SIGLAS = {
    'AC', 'ANC', 'BLK', 'C', 'CD', 'CT', 'DGO', 'DV', 'DVR', 'EC', 'EOS', 'FZ', 'GB', 'HD', 'HP',
    'K', 'LED', 'LG', 'LTE', 'LTN', 'PS', 'RF', 'RP', 'SNP', 'STM', 'TV', 'TWS', 'U', 'UNV',
    'UPS', 'US', 'USB', 'USBC', 'UV', 'UVS', 'VA', 'W', 'WH', 'WIFI', 'WMOS', 'WTC',
}
_CONECTORES = {'a', 'con', 'de', 'del', 'el', 'en', 'in', 'la', 'on', 'para', 'y'}


def nombre_propio(texto: str, maximo: int = 60, conectores: bool = True) -> str:
    """
    Un nombre del reporte como va en el catálogo, cortado al largo del campo.

    Con `conectores=False` «la», «de»… quedan con mayúscula como el resto: es
    para nombres de lugar («Bucaramanga La Rosita»), no de productos.
    """
    texto = ' '.join(str(texto or '').replace('�', '').replace('*', ' ').split())
    texto = re.sub(r'\s*\.\s*COM\b', '.com', texto, flags=re.IGNORECASE)

    def tramo(m: re.Match) -> str:
        letras = m.group(0)
        if letras.upper() in _SIGLAS:
            return 'WiFi' if letras.upper() == 'WIFI' else letras.upper()
        antes = m.string[m.start() - 1] if m.start() else ''
        # Pegado a un número («5ta») o después de una tilde que el portal
        # perdió y escribió como «?» («ESTACI?N» → «Estaci?n»): sigue la palabra.
        if antes.isdigit() or antes == '?':
            return letras.lower()
        return letras[0].upper() + letras[1:].lower()

    palabras = []
    for i, palabra in enumerate(texto.split(' ')):
        if conectores and i and palabra.lower() in _CONECTORES:
            palabras.append(palabra.lower())
        else:
            palabras.append(re.sub(r'[^\W\d_]+', tramo, palabra))
    return ' '.join(palabras).replace('.Com', '.com')[:maximo].rstrip()


def capitalizada(texto: str, maximo: int = 60) -> str:
    """«DIGITAL POS» → «Digital Pos»: primera en mayúscula, el resto en minúscula."""
    return ' '.join(p.capitalize() for p in str(texto or '').split())[:maximo].rstrip()


class MarcasDelReporte:
    """
    La marca de cada producto por crear, elegida del catálogo.

    Se busca sin importar mayúsculas ni tildes —«SONY» es «Sony»—. La que no
    está se crea, escrita con `formato`. Lee el catálogo una sola vez.
    """

    def __init__(self, formato: Callable[[str], str] = nombre_propio):
        self.formato = formato
        self.catalogo = {
            clave_de_marca(n): n for n in Marca.objects.values_list('nombre', flat=True)
        }
        #: clave → nombre de las marcas que hay que crear.
        self.nuevas: dict[str, str] = {}

    def resolver(self, texto: str) -> str | None:
        original = clave_de_marca(texto or '')
        clave = MARCAS_EQUIVALENTES.get(original, original)
        if not clave:
            return None
        if clave in self.catalogo:
            return self.catalogo[clave]
        return self.nuevas.setdefault(clave, self.formato(texto if clave == original else clave))

    def es_nueva(self, nombre: str | None) -> bool:
        return nombre in self.nuevas.values()

    def crear(self) -> None:
        # Si otra carga creó la misma un instante antes, no es un error: ya existe.
        Marca.objects.bulk_create(
            [Marca(nombre=nombre) for nombre in self.nuevas.values()], ignore_conflicts=True
        )
