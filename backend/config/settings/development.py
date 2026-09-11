"""
Entorno local: DEBUG y CORS abierto al dev server de Vite.

La base es la de DATABASE_URL en `.env` (el Postgres de Render); sin esa
variable, el SQLite local.
"""
from .base import *  # noqa: F403

DEBUG = True
ALLOWED_HOSTS = ['*']

# Errores completos en consola durante desarrollo.
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {'console': {'class': 'logging.StreamHandler'}},
    'root': {'handlers': ['console'], 'level': 'INFO'},
}
