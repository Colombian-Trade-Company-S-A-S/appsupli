from django.test import Client, override_settings


@override_settings(ALLOWED_HOSTS=['supli-api.onrender.com'], SECURE_SSL_REDIRECT=True)
def test_el_health_check_responde_sin_host_permitido_ni_https():
    """La sonda de Render llega por http y desde otro host: igual responde 200."""
    respuesta = Client().get('/api/health', HTTP_HOST='10.0.0.7:8000')

    assert respuesta.status_code == 200
    assert respuesta.json() == {'status': 'ok'}
