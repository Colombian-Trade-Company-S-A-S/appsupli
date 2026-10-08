"""
Sincronización con Odoo: lee empleados y departamentos y los copia a la base de appsupli.

Odoo manda en nombre, cargo, área, dirección, organización, regional y jefe. La
app nunca escribe en Odoo: guarda su propia copia, y si Odoo se cae todo sigue
funcionando con la última sincronización.

Las tres opciones son independientes:
  · crear       — los empleados activos de Odoo que aún no existen acá.
  · actualizar  — refresca los datos de quienes ya están, y los empareja con
                  Odoo por id, por correo o por cédula.
  · desactivar  — quien está archivado en Odoo queda inactivo acá. No se borra:
                  se conserva su histórico.
  · eliminar    — quien no aparece en Odoo, ni activo ni archivado, se borra
                  con sus registros (objetivos, retos, valoraciones). Nunca a
                  un admin ni a quien corre la sincronización.

Con `simular` se calcula todo igual y al final se deshace: es la vista previa.
"""
import unicodedata
from collections import Counter

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from apps.accounts.models import Area, Departamento, User

from .client import OdooClient, OdooError
from .models import Sincronizacion

PARTICULAS = {'de', 'del', 'la', 'las', 'los', 'y', 'san', 'da', 'do', 'dos', 'van', 'von'}


def _titulo(texto: str) -> str:
    return ' '.join(p.lower() if p.lower() in PARTICULAS else p.capitalize() for p in texto.split())


def separar_nombre(completo: str) -> tuple[str, str]:
    """
    Odoo guarda «APELLIDOS NOMBRES» en un solo campo: las dos primeras palabras
    son los apellidos y el resto, los nombres. Las partículas van pegadas a la
    palabra que sigue, para que «EBERTO DE JESÚS» quede como un solo nombre.
    """
    grupos, pendiente = [], []
    for palabra in (completo or '').split():
        pendiente.append(palabra)
        if palabra.lower() not in PARTICULAS:
            grupos.append(' '.join(pendiente))
            pendiente = []
    if pendiente:
        grupos.append(' '.join(pendiente))

    if len(grupos) <= 1:
        return _titulo(' '.join(grupos)), ''
    if len(grupos) == 2:
        return _titulo(grupos[1]), _titulo(grupos[0])
    return _titulo(' '.join(grupos[2:])), _titulo(' '.join(grupos[:2]))


def _id(relacion) -> int | None:
    """Los many2one de Odoo llegan como `[id, nombre]` o `False`."""
    return relacion[0] if relacion else None


def _nombre(relacion) -> str:
    return relacion[1] if relacion else ''


def _correo(valor) -> str:
    return (valor or '').strip().lower()


def _cedula(valor) -> str:
    return str(valor or '').strip()


def clave_nombre(nombre: str) -> frozenset[str]:
    """
    El nombre como conjunto de palabras, sin tildes ni mayúsculas: «Alejandra
    Blanco Álvarez» y «BLANCO ALVAREZ ALEJANDRA» son la misma persona.
    """
    plano = unicodedata.normalize('NFKD', nombre or '').encode('ascii', 'ignore').decode().lower()
    return frozenset(plano.split())


class Sincronizador:
    def __init__(
        self, *, crear: bool, actualizar: bool, desactivar: bool, eliminar: bool = False,
        ejecutada_por: User | None = None,
    ):
        self.crear = crear
        self.actualizar = actualizar
        self.desactivar = desactivar
        self.eliminar = eliminar
        self.ejecutada_por = ejecutada_por
        self.ahora = timezone.now()
        self.dominio = settings.ODOO_DOMINIO_INGRESO.lower().lstrip('@')
        self.resumen = Counter()
        self.excepciones: list[dict] = []
        self._areas: dict[str, Area] = {}

    def correr(self, departamentos: list[dict], empleados: list[dict]) -> None:
        self._sincronizar_departamentos(departamentos)
        self._sincronizar_empleados(empleados)
        if self.eliminar:
            if not self.resumen['empleados_activos_odoo']:
                # Un Odoo vacío o mal configurado no puede vaciar appsupli.
                raise OdooError('Odoo no devolvió empleados activos: no se elimina a nadie.')
            self._eliminar_ausentes()

    # ── Departamentos ────────────────────────────────────────────────────
    def _sincronizar_departamentos(self, filas: list[dict]) -> None:
        self.departamentos = {d.odoo_id: d for d in Departamento.objects.all()}
        for fila in filas:
            dep = self.departamentos.get(fila['id']) or Departamento(odoo_id=fila['id'])
            nombre, activo = fila['name'][:200], bool(fila['active'])
            if dep.pk is None or (dep.nombre, dep.activo) != (nombre, activo):
                dep.nombre, dep.activo = nombre, activo
                dep.save()
            self.departamentos[dep.odoo_id] = dep

        # El padre, en una segunda vuelta: puede venir después que el hijo.
        for fila in filas:
            dep = self.departamentos[fila['id']]
            padre = self.departamentos.get(_id(fila['parent_id']))
            if dep.padre_id != (padre.pk if padre else None):
                dep.padre = padre
                dep.save(update_fields=['padre', 'updated_at'])

        self.con_hijos = {_id(f['parent_id']) for f in filas if f['active'] and f['parent_id']}
        self.resumen['departamentos'] = len(filas)

    def _ubicacion(self, dep: Departamento | None) -> tuple[str, Area | None]:
        """Dirección y área de un departamento, según dónde está en el árbol."""
        if dep is None:
            return '', None
        ruta = dep.ruta()
        raiz = ruta[0]
        if raiz.odoo_id in self.con_hijos:
            # Una persona puesta directo en la dirección no tiene área.
            return raiz.nombre[:120], self._area(ruta[1].nombre) if len(ruta) > 1 else None
        # Raíz sin hijos: es un área sin dirección intermedia, y es a propósito.
        return '', self._area(raiz.nombre)

    def _area(self, nombre: str) -> Area:
        clave = nombre.lower()
        if clave not in self._areas:
            area = Area.objects.filter(name__iexact=nombre).first()
            if area is None:
                area = Area.objects.create(
                    name=nombre[:100], description='Creada por la sincronización con Odoo.', odoo=True
                )
            elif not (area.odoo and area.is_active):
                # Un área que ya existía con el mismo nombre pasa a ser de Odoo.
                area.odoo = area.is_active = True
                area.save(update_fields=['odoo', 'is_active', 'updated_at'])
            self._areas[clave] = area
        return self._areas[clave]

    # ── Empleados ────────────────────────────────────────────────────────
    def _sincronizar_empleados(self, filas: list[dict]) -> None:
        activos = [f for f in filas if f['active']]
        archivados = [f for f in filas if not f['active']]
        self.resumen['empleados_activos_odoo'] = len(activos)

        self.cedulas_odoo = Counter(_cedula(f['identification_id']) for f in activos if f['identification_id'])
        self.correos_odoo = Counter(_correo(f['work_email']) for f in activos if f['work_email'])
        self.con_personas = {_id(f['parent_id']) for f in activos if f['parent_id']}
        # Para emparejar por nombre: solo cuenta si hay una única ficha con él.
        self.nombres_odoo = Counter(clave_nombre(f['name']) for f in filas)

        usuarios = list(User.objects.all())
        self.por_odoo = {u.odoo_id: u for u in usuarios if u.odoo_id}
        self.por_correo = {u.email.lower(): u for u in usuarios if u.email}
        self.por_cedula: dict[str, list[User]] = {}
        for u in usuarios:
            if u.cedula:
                self.por_cedula.setdefault(u.cedula, []).append(u)
        self.por_nombre: dict[frozenset, list[User]] = {}
        for u in usuarios:
            self.por_nombre.setdefault(clave_nombre(u.full_name), []).append(u)
        # Nombre incompleto acá (sin segundo nombre o apellido): las fichas de
        # Odoo cuyo nombre contiene todas sus palabras.
        claves_odoo = [(f['id'], clave_nombre(f['name'])) for f in filas]
        self.contenido_en: dict[int, list[int]] = {
            u.pk: [i for i, clave in claves_odoo if clave_u <= clave]
            for u in usuarios
            if len(clave_u := clave_nombre(u.full_name)) >= 2
        }
        self.usernames = {u.username for u in usuarios}
        self.reclamados: set[int] = set()
        # Todos los que tienen ficha en Odoo, activa o archivada: no se eliminan.
        self.en_odoo: set[int] = set()

        # 1. Emparejar o crear. Primero todos, para que el jefe ya exista
        #    cuando se le asigne a su equipo.
        por_actualizar: list[tuple[User, dict, bool]] = []
        for fila in activos:
            self._revisar_calidad(fila)
            usuario = self._emparejar(fila)
            if usuario is not None:
                self.reclamados.add(usuario.pk)
                # Ya, no en la segunda vuelta: su equipo lo busca por id de Odoo.
                self.por_odoo[fila['id']] = usuario
                if not usuario.is_active:
                    self._excepcion('inactivo_en_appsupli', fila, 'Activo en Odoo pero inactivo en appsupli.')
                if self.actualizar:
                    por_actualizar.append((usuario, fila, False))
                else:
                    self.resumen['existentes_sin_actualizar'] += 1
            elif self.crear:
                usuario = self._crear(fila)
                por_actualizar.append((usuario, fila, True))
                self.resumen['creados'] += 1
            else:
                self.resumen['nuevos_sin_crear'] += 1

        # 2. Datos y jefe.
        for usuario, fila, nuevo in por_actualizar:
            cambio = self._aplicar(usuario, fila)
            if not nuevo:
                self.resumen['actualizados' if cambio else 'sin_cambios'] += 1

        # 3. Bajas.
        for fila in archivados:
            self._dar_de_baja(fila)

    def _emparejar(self, fila: dict) -> User | None:
        """
        Por id de Odoo; si no, por correo; si no, por cédula; si no, por nombre
        completo. Los tres últimos, solo si no hay ambigüedad.
        """
        usuario = self.por_odoo.get(fila['id'])
        if usuario is not None:
            return usuario

        libre = lambda u: u.odoo_id is None and u.pk not in self.reclamados  # noqa: E731
        correo = _correo(fila['work_email'])
        if correo and self.correos_odoo[correo] == 1:
            usuario = self.por_correo.get(correo)
            if usuario is not None and libre(usuario):
                return usuario

        cedula = _cedula(fila['identification_id'])
        if cedula and self.cedulas_odoo[cedula] == 1:
            candidatos = [u for u in self.por_cedula.get(cedula, []) if libre(u)]
            if len(candidatos) == 1:
                return candidatos[0]
        return self._por_nombre(fila, libre)

    def _por_nombre(self, fila: dict, libre) -> User | None:
        """
        El último recurso: asesores que acá tienen un correo personal y en Odoo
        ninguno. Emparejarlos les conserva la cuenta y el ingreso.
        """
        clave = clave_nombre(fila['name'])
        if len(clave) >= 2 and self.nombres_odoo[clave] == 1:
            candidatos = [u for u in self.por_nombre.get(clave, []) if libre(u)]
            if len(candidatos) == 1:
                return candidatos[0]
        # Acá el nombre está incompleto: vale si solo esta ficha de Odoo lo contiene.
        candidatos = [
            u for u in self._usuarios_libres(libre) if self.contenido_en.get(u.pk) == [fila['id']]
        ]
        return candidatos[0] if len(candidatos) == 1 else None

    def _usuarios_libres(self, libre):
        vistos = {}
        for lista in self.por_nombre.values():
            for u in lista:
                if libre(u):
                    vistos[u.pk] = u
        return vistos.values()

    def _crear(self, fila: dict) -> User:
        nombres, apellidos = separar_nombre(fila['name'])
        correo = _correo(fila['work_email'])
        base = correo.split('@')[0] if self._correo_permitido(correo) else f'{nombres} {apellidos}'
        username = slugify(base).replace('-', '.')[:70] or 'odoo'
        if username in self.usernames:
            username = f'{username}.{fila["id"]}'
        self.usernames.add(username)

        # Sin clave: entra con Microsoft cuando esté, o el admin le pone una.
        usuario = User(
            username=username, first_name=nombres or 'Sin nombre', last_name=apellidos, odoo_id=fila['id']
        )
        usuario.set_unusable_password()
        usuario.save()
        self.por_odoo[fila['id']] = usuario
        self.reclamados.add(usuario.pk)
        return usuario

    def _correo_permitido(self, correo: str) -> bool:
        return bool(correo) and correo.endswith(f'@{self.dominio}')

    def _correo_para(self, usuario: User, fila: dict) -> str | None:
        """El correo de Odoo, si sirve para iniciar sesión y nadie más lo tiene."""
        correo = _correo(fila['work_email'])
        if not self._correo_permitido(correo) or self.correos_odoo[correo] > 1:
            return None
        dueno = self.por_correo.get(correo)
        if dueno is not None and dueno.pk != usuario.pk:
            self._excepcion('correo_en_uso', fila, f'{correo} ya lo tiene otra persona en appsupli.')
            return None
        return correo

    def _aplicar(self, usuario: User, fila: dict) -> bool:
        """
        Copia los datos de Odoo al usuario. Devuelve si algo cambió.

        Un dato vacío en Odoo no borra lo que hay acá: si a alguien le falta el
        departamento o el jefe allá, se queda con lo que tenía y sale en las
        excepciones para que RRHH lo complete.
        """
        nombres, apellidos = separar_nombre(fila['name'])
        dep = self.departamentos.get(_id(fila['department_id']))
        jefe = self.por_odoo.get(_id(fila['parent_id']))

        valores = {
            'odoo_id': fila['id'],
            'first_name': nombres[:100],
            'last_name': apellidos[:100],
            'cedula': _cedula(fila['identification_id'])[:30],
            'position': (fila['job_title'] or _nombre(fila['job_id']))[:120],
            'organizacion': _nombre(fila['company_id'])[:120],
            'regional': _nombre(fila['work_location_id'])[:120],
            'manager': jefe if jefe != usuario else None,
            'email': self._correo_para(usuario, fila),
        }
        valores = {campo: valor for campo, valor in valores.items() if valor}
        if dep is not None:
            # Aquí una dirección vacía sí es un dato: el área no cuelga de ninguna.
            valores['departamento'] = dep
            valores['direccion'], area = self._ubicacion(dep)
            if area is not None:
                valores['area'] = area
        # El admin de la plataforma no deja de serlo por lo que diga Odoo.
        if usuario.kind != User.Kind.ADMIN:
            valores['kind'] = User.Kind.LEADER if fila['id'] in self.con_personas else User.Kind.COLLABORATOR

        cambios = [campo for campo, valor in valores.items() if getattr(usuario, campo) != valor]
        for campo in cambios:
            setattr(usuario, campo, valores[campo])
        if 'email' in cambios:
            self.por_correo[usuario.email] = usuario
        usuario.sincronizado_odoo_at = self.ahora
        usuario.save()
        return bool(cambios)

    def _dar_de_baja(self, fila: dict) -> None:
        usuario = self.por_odoo.get(fila['id'])
        if usuario is None:
            correo = _correo(fila['work_email'])
            candidato = self.por_correo.get(correo) if correo else None
            if candidato is not None and candidato.odoo_id is None and candidato.pk not in self.reclamados:
                usuario = candidato
            else:
                usuario = self._por_nombre(fila, lambda u: u.odoo_id is None and u.pk not in self.reclamados)
        if usuario is not None:
            self.en_odoo.add(usuario.pk)
        # Si otra ficha activa de Odoo ya reclamó a esta persona, sigue activa.
        if usuario is None or usuario.pk in self.reclamados or not usuario.is_active:
            return

        if usuario.is_admin:
            self._excepcion('admin_de_baja', fila, 'Archivado en Odoo, pero es admin: no se desactiva solo.')
            return
        if not self.desactivar:
            self.resumen['bajas_sin_desactivar'] += 1
            return
        usuario.is_active = False
        usuario.odoo_id = usuario.odoo_id or fila['id']
        usuario.sincronizado_odoo_at = self.ahora
        usuario.save(update_fields=['is_active', 'odoo_id', 'sincronizado_odoo_at', 'updated_at'])
        self.reclamados.add(usuario.pk)
        self.resumen['desactivados'] += 1

    def _eliminar_ausentes(self) -> None:
        """Borra a quien no está en Odoo, con todos sus registros."""
        from apps.challenge.models import Reto
        from apps.performance.models import Objetivo

        presentes = self.reclamados | self.en_odoo
        for usuario in User.objects.exclude(pk__in=presentes).order_by('first_name', 'last_name'):
            fila = {'id': None, 'name': usuario.full_name}
            if usuario.is_admin or usuario == self.ejecutada_por:
                self._excepcion('conservado_sin_odoo', fila, 'No está en Odoo, pero es admin: no se elimina.')
                continue
            # Lo que la base protege del borrado: los objetivos que registró
            # para otros y los retos que creó. Lo demás cae en cascada.
            Objetivo.objects.filter(registrado_por=usuario).delete()
            Reto.objects.filter(creado_por=usuario).delete()
            self._excepcion('eliminado', fila, f'{usuario.email or "Sin correo"}: no está en Odoo.')
            usuario.delete()
            self.resumen['eliminados'] += 1

    # ── Calidad de datos ─────────────────────────────────────────────────
    def _revisar_calidad(self, fila: dict) -> None:
        cedula = _cedula(fila['identification_id'])
        if not cedula:
            self._excepcion('sin_cedula', fila, 'Sin cédula: es la llave para emparejar con appsupli.')
        elif self.cedulas_odoo[cedula] > 1:
            self._excepcion('cedula_duplicada', fila, f'La cédula {cedula} está en más de un empleado activo.')
        if not fila['parent_id']:
            self._excepcion('sin_jefe', fila, 'Sin jefe inmediato en Odoo.')
        if not fila['department_id']:
            self._excepcion('sin_departamento', fila, 'Sin departamento en Odoo.')

        correo = _correo(fila['work_email'])
        if not correo:
            self.resumen['sin_correo'] += 1
        elif self.correos_odoo[correo] > 1:
            self._excepcion('correo_duplicado', fila, f'{correo} está en más de un empleado activo.')
        elif not self._correo_permitido(correo):
            self._excepcion('correo_otro_dominio', fila, f'{correo} no es @{self.dominio}: no podrá iniciar sesión.')

    def _excepcion(self, tipo: str, fila: dict, detalle: str) -> None:
        self.excepciones.append({'tipo': tipo, 'odoo_id': fila['id'], 'nombre': fila['name'], 'detalle': detalle})


def sincronizar(
    *, crear: bool, actualizar: bool, desactivar: bool, eliminar: bool = False, simular: bool = False,
    ejecutada_por: User | None = None, cliente: OdooClient | None = None,
) -> Sincronizacion:
    """Corre la sincronización y deja su registro en la bitácora, salga bien o mal."""
    registro = Sincronizacion(
        ejecutada_por=ejecutada_por, crear=crear, actualizar=actualizar,
        desactivar=desactivar, eliminar=eliminar, simulacion=simular,
    )
    cliente = cliente or OdooClient()
    try:
        # Primero se lee todo de Odoo: si falla a mitad, no se alcanzó a tocar nada.
        departamentos = cliente.departamentos()
        empleados = cliente.empleados()
        with transaction.atomic():
            sincronizador = Sincronizador(
                crear=crear, actualizar=actualizar, desactivar=desactivar, eliminar=eliminar,
                ejecutada_por=ejecutada_por,
            )
            sincronizador.correr(departamentos, empleados)
            if simular:
                transaction.set_rollback(True)
        registro.resumen = dict(sincronizador.resumen)
        registro.excepciones = sincronizador.excepciones
    except OdooError as error:
        registro.estado = Sincronizacion.Estado.ERROR
        registro.error = str(error)
    registro.terminada_at = timezone.now()
    registro.save()
    return registro
