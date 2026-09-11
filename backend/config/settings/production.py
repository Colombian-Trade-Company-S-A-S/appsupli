"""
Entorno productivo (Render): Postgres por `DATABASE_URL`, HTTPS y estáticos con
WhiteNoise.
"""
from decouple import config
from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403
from .base import ALLOWED_HOSTS, CSRF_TRUSTED_ORIGINS, DATABASE_URL

DEBUG = False

# Sin valor por defecto: en producción, caer en la clave de desarrollo sería
# firmar los tokens con una clave que está en el repositorio.
SECRET_KEY = config('SECRET_KEY')

if not DATABASE_URL:
    raise ImproperlyConfigured('Falta DATABASE_URL: en producción no se usa SQLite.')

# Render pone el dominio público del servicio en RENDER_EXTERNAL_HOSTNAME:
# así no hay que escribirlo a mano en ALLOWED_HOSTS.
_DOMINIO_RENDER = config('RENDER_EXTERNAL_HOSTNAME', default='')
if _DOMINIO_RENDER:
    ALLOWED_HOSTS = [*ALLOWED_HOSTS, _DOMINIO_RENDER]
    CSRF_TRUSTED_ORIGINS = [*CSRF_TRUSTED_ORIGINS, f'https://{_DOMINIO_RENDER}']

# Los estáticos se comprimen y se versionan en el build: se pueden cachear
# para siempre porque cada cambio cambia el nombre del archivo.
STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage'},
}

SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
# Render termina el TLS y le pasa la petición al contenedor por http: esta
# cabecera es la que dice que del lado del navegador era https.
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
X_FRAME_OPTIONS = 'DENY'

# Los logs de Render son la salida estándar del contenedor.
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {'console': {'class': 'logging.StreamHandler'}},
    'root': {'handlers': ['console'], 'level': 'INFO'},
}
