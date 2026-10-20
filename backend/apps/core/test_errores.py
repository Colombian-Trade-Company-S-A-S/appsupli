from rest_framework import exceptions

from apps.core.exceptions import api_exception_handler


def test_un_error_de_validacion_suelto_llega_como_texto_limpio():
    respuesta = api_exception_handler(
        exceptions.ValidationError('Este reto ya fue publicado.'), {}
    )

    assert respuesta.status_code == 400
    assert respuesta.data['message'] == 'Este reto ya fue publicado.'


def test_varios_mensajes_se_unen_en_uno():
    respuesta = api_exception_handler(exceptions.ValidationError(['Uno.', 'Dos.']), {})

    assert respuesta.data['message'] == 'Uno. Dos.'
