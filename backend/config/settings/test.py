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

# Ni Odoo ni Microsoft Graph en las pruebas, aunque `.env` traiga las claves:
# una prueba que olvide simular el cliente fallaría, en vez de escribir en el
# Odoo real (la foto de perfil se escribe en el empleado).
ODOO_URL = ''
ODOO_DB = ''
ODOO_USER = ''
ODOO_SECRET = ''
PLANNER_TENANT_ID = ''
PLANNER_CLIENT_ID = ''
PLANNER_CLIENT_SECRET = ''
