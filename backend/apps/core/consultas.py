"""
Ayuda para las pruebas que cuidan que un listado no haga una consulta por fila.

Se mide la misma petición con pocos y con muchos datos: si el número de
consultas crece, alguna relación se está pidiendo fila por fila (N+1). Al
fallar, el mensaje dice qué consultas aumentaron, que es justo lo que hay que
ir a arreglar.
"""
import re
from collections import Counter

from django.db import connection
from django.test.utils import CaptureQueriesContext


class Medicion:
    """Las consultas de un bloque de código, listas para comparar."""

    def __init__(self):
        self._captura = CaptureQueriesContext(connection)

    def __enter__(self):
        self._captura.__enter__()
        return self

    def __exit__(self, *exc):
        return self._captura.__exit__(*exc)

    @property
    def total(self) -> int:
        return len(self._captura.captured_queries)

    def formas(self) -> Counter:
        """Cada consulta sin sus valores, para agrupar las que solo cambian de id."""
        return Counter(
            re.sub(r"'[^']*'|\b\d+\b", '?', consulta['sql'])[:160]
            for consulta in self._captura.captured_queries
        )


def mismo_costo(pocos: Medicion, muchos: Medicion) -> None:
    """Falla si con más datos hubo más consultas, y dice cuáles se multiplicaron."""
    if muchos.total == pocos.total:
        return
    crecieron = muchos.formas() - pocos.formas()
    detalle = '\n'.join(f'  +{veces}  {sql}' for sql, veces in crecieron.most_common(6))
    raise AssertionError(
        f'Con más filas pasó de {pocos.total} a {muchos.total} consultas (N+1). '
        f'Las que crecieron:\n{detalle}'
    )
