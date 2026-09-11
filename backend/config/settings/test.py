"""
Pruebas: siempre SQLite, sin importar lo que diga `.env`.

Así las pruebas no dependen de la red ni intentan crear una base de pruebas
en el Postgres de Render.
"""
from .development import *  # noqa: F403

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    }
}
