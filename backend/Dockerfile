# Backend de Supli: Django servido con gunicorn. Pensado para Render, pero
# corre igual en cualquier lado que le pase DATABASE_URL y SECRET_KEY.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DJANGO_SETTINGS_MODULE=config.settings.production

WORKDIR /app

# Primero solo las dependencias: si no cambian, Docker reutiliza esta capa y
# el build es mucho más rápido.
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Los estáticos (admin y documentación de la API) quedan dentro de la imagen.
# collectstatic no toca la base, pero los settings de producción exigen estas
# dos variables: aquí van valores de relleno que no se usan para nada más.
RUN SECRET_KEY=solo-para-collectstatic DATABASE_URL=sqlite:////tmp/build.sqlite3 \
    python manage.py collectstatic --noinput

# Sin root: si alguien rompe la app, no es dueño del contenedor.
RUN useradd --create-home --uid 1000 app && chown -R app /app
USER app

EXPOSE 8000

# Cada arranque aplica las migraciones pendientes y después levanta gunicorn
# en el puerto que diga Render. El timeout de 120 s es por la importación del
# informe del ERP, que trae miles de filas.
CMD ["sh", "-c", "python manage.py migrate --noinput && exec gunicorn config.wsgi:application --bind 0.0.0.0:${PORT:-8000} --workers ${WEB_CONCURRENCY:-2} --timeout 120 --access-logfile -"]
