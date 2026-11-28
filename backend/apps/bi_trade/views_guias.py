"""
El botón «Exportar PDF de uso» de cada informe: baja la guía de ese informe.

Una ruta por informe (`guia`, `hc/guia`, `partners/guia`…) para que
`HasBiTradeApp` revise, como en todo lo demás, que la persona vea ese informe.
"""
from urllib.parse import quote

from django.http import HttpResponse
from rest_framework.decorators import api_view, permission_classes

from .api_permissions import HasBiTradeApp
from .guias import nombre_ascii, nombre_de, pdf_de


def vista_guia(informe: str):
    """La vista que descarga la guía de `informe`, con su nombre de archivo."""

    @api_view(['GET'])
    @permission_classes([HasBiTradeApp])
    def guia(request):
        respuesta = HttpResponse(pdf_de(informe), content_type='application/pdf')
        # `filename` sin tildes para cualquier navegador; `filename*` con ellas.
        respuesta['Content-Disposition'] = (
            f'attachment; filename="{nombre_ascii(informe)}"; '
            f"filename*=UTF-8''{quote(nombre_de(informe))}"
        )
        return respuesta

    return guia
