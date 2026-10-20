"""Crea el schema de Postgres (DB_SCHEMA) donde viven las tablas de Supli."""
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from psycopg import sql


class Command(BaseCommand):
    help = 'Crea el schema DB_SCHEMA si no existe. Hay que correrlo antes de migrate.'

    def handle(self, *args, **options):
        if connection.vendor != 'postgresql':
            raise CommandError('Solo aplica a Postgres (hay que definir DB_HOST).')
        schema = settings.DB_SCHEMA
        if schema == 'public':
            self.stdout.write('DB_SCHEMA es «public»: no hay nada que crear.')
            return
        with connection.cursor() as cursor:
            cursor.execute(
                sql.SQL('CREATE SCHEMA IF NOT EXISTS {}').format(sql.Identifier(schema))
            )
        self.stdout.write(self.style.SUCCESS(f'Schema «{schema}» listo.'))
