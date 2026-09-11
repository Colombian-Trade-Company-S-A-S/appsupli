# Supli · Backend (Django REST Framework)

API de la plataforma. Proyecto base sin apps de negocio todavía.
Base de datos: SQLite.

## Arranque

```bash
python -m venv env
env\Scripts\activate              # Windows  ·  source env/bin/activate en Linux/Mac
pip install -r requirements-dev.txt

copy .env.example .env            # ya viene creado

python manage.py migrate
python manage.py runserver        # http://localhost:8000
```

Documentación de la API: <http://localhost:8000/api/docs/>
Admin de Django: <http://localhost:8000/admin/>

## Estructura

```
backend/
├── config/
│   ├── settings/          # base.py + development.py + production.py
│   └── urls.py            # cada área montará aquí su propio urls.py
├── apps/
│   └── core/              # base compartida: TimeStampedModel, paginación, errores
└── manage.py
```

## Convenciones ya configuradas

- JSON en **camelCase** en ambos sentidos (`djangorestframework-camel-case`).
- Listados paginados: `{items, total, page, pageSize}` (`?page=2&page_size=50`).
- Filtros: `?search=`, `?ordering=-created_at` (django-filter).
- Errores normalizados: `{code, message}` y `{code, message, errors}` en validación.
- CORS abierto al dev server de Vite (`CORS_ALLOWED_ORIGINS` en `.env`).

## Agregar un área nueva

1. `python manage.py startapp <area> apps/<area>`
2. Modelos heredando de `TimeStampedModel`, serializers y viewsets.
3. `apps/<area>/urls.py` con `DefaultRouter(trailing_slash=False)` — el frontend
   llama sin slash final.
4. Registrar la app en `LOCAL_APPS` y su ruta en `config/urls.py`.
5. `makemigrations` + `migrate`.

## Usuarios y accesos

Autenticación con **JWT** (`djangorestframework-simplejwt`) y login por correo.

| Endpoint | Qué hace |
|---|---|
| `POST /api/auth/login` | `{email, password}` → `{accessToken, refreshToken, user}` |
| `GET /api/auth/me` | Usuario actual con sus apps y permisos |
| `POST /api/auth/refresh` | Renueva el access token |
| `POST /api/auth/logout` | El frontend descarta los tokens |
| `PATCH /api/auth/preferences` | Guarda apariencia: `theme`, `accent`, `radius` |

### Modelo de accesos

```
Area         → área o departamento (Ventas, Tech, Accounting...)
Application  → una app/módulo (código, nombre, ruta base, ícono, orden)
Permission   → una acción dentro de una app: "sales:orders:approve"
Role         → paquete de permisos reutilizable
User         → area + roles + applications + extra_permissions
```

Un usuario entra a una app si es **admin**, si la app está en su lista
`applications`, o si tiene algún permiso que pertenezca a esa app.

**Admin** (`kind = admin`) entra a todo con todos los permisos, sin importar lo
que tenga asignado. Se define en el campo *Tipo de usuario*.

Todo se asigna desde el **módulo de Administración** de la plataforma
(`/inicio/admin`) o desde el admin de Django (`/admin/`).

### API de administración

Solo para `kind=admin`; cualquier otro usuario recibe `403`.

| Endpoint | Qué hace |
|---|---|
| `/api/admin/users` | CRUD de usuarios (incluye accesos y contraseña) |
| `POST /api/admin/users/{id}/toggle-active` | Activa o inactiva la cuenta |
| `/api/admin/areas` | CRUD de áreas |
| `/api/admin/applications` | CRUD de aplicaciones |
| `/api/admin/permissions` | Catálogo de permisos |
| `/api/admin/roles` | CRUD de roles con sus permisos |

Reglas de seguridad: nadie puede eliminar ni desactivar su propia cuenta.

Para crear la app de Administración en una base nueva:

```bash
python manage.py seed_admin_app
```

### Importar usuarios

```bash
python manage.py import_users "C:/ruta/credenciales.xlsx"
python manage.py import_users archivo.xlsx --reset-passwords   # también pisa contraseñas
```

Lee el Excel de credenciales (Nombre, Apellido, Email, Username, Contraseña,
Area, Cargo, Tipo de usuario, Jefe directo, Teléfono, Activo), resuelve el jefe
directo por nombre y marca como admin a quien tenga *Tipo de usuario = Admin*.
Es idempotente.

## BI Trade Marketing

Ventas por punto de venta: `apps/bi_trade`, montada en `/api/bi-trade/`.

```
PuntoVenta  → id_punto_venta (PK de texto), nombre_pdv, regional, materiales
Producto    → id_producto (PK de texto), nombre_producto, marca,
              precio_venta_claro, precio_venta_coltrade, puntaje
Venta       → id_venta (autonumérico), id_producto, id_punto_venta,
              fecha_venta, cantidad_vendida
Inventario  → id_inventario, id_producto, id_punto_venta, cantidad_inventario
Meta        → id_meta, id_producto, id_punto_venta, meta_cantidad,
              meta_dinero, meta_puntos
```

Inventario y metas llevan **una sola fila por producto y punto de venta**
(`unique_together`): el inventario es el stock actual, no un histórico, y dos
metas para el mismo par harían imposible medir cumplimiento. La clase del
modelo se llama `MetaComercial` porque Django reserva `Meta` para la
configuración interna de cada modelo; la tabla sí se llama `metas`.

Los nombres de campo son los del negocio, no se traducen: son las mismas
columnas con las que llegan los archivos del BI. Las dos llaves primarias son
de **texto** y las escribe la persona, así que el serializer valida duplicados
en lugar de dejar que reviente la base. `regional` y `materiales` son nulables
a propósito: en una fuente de BI «sin dato» no es lo mismo que cadena vacía.

Un punto de venta o un producto con ventas registradas **no se borra** (`PROTECT`
en el modelo y un mensaje claro en la API).

| Endpoint | Qué hace |
|---|---|
| `/api/bi-trade/puntos-venta` | CRUD de puntos de venta |
| `/api/bi-trade/productos` | CRUD del catálogo |
| `/api/bi-trade/ventas` | CRUD de ventas |
| `GET /api/bi-trade/dashboard` | Tablero: totales y cortes por regional, marca, producto y PDV |
| `/api/bi-trade/inventario` | CRUD de existencias |
| `/api/bi-trade/metas` | CRUD de metas |
| `GET /api/bi-trade/cumplimiento` | Real vs. meta en unidades, dinero y puntos |
| `GET /api/bi-trade/opciones` | Catálogos para formularios y filtros |
| `GET /api/bi-trade/<recurso>/plantilla` | Descarga el `.xlsx` en blanco |
| `POST /api/bi-trade/<recurso>/importar` | Carga un `.xlsx` (campo `archivo`) |
| `DELETE /api/bi-trade/<recurso>/eliminar-todos` | Vacía la tabla, si nada depende de ella |

El tablero calcula el ingreso como `cantidad_vendida × precio_venta_coltrade`,
todo con agregaciones en la base: la tabla de ventas es la que va a crecer.
Acepta `?regional=` y `?marca=`.

El cumplimiento compara cada medida contra su propia meta — unidades contra
`meta_cantidad`, dinero contra `meta_dinero` y puntos (unidades × puntaje del
producto) contra `meta_puntos` — y reporta el inventario como stock disponible
más su cobertura sobre lo ya vendido. Una meta sin ventas aparece como 0%, no
desaparece del listado.

> ⚠️ Al agregar por expresión, la anotación por línea **no puede llamarse igual
> que el alias del `aggregate`**: Django resuelve el alias contra sí mismo y
> devuelve `0` en silencio. Por eso las anotaciones llevan el sufijo `_linea`.

Consultar solo exige tener la app; crear, editar o borrar exige
`bi-trade:data:manage`.

### Excel

`excel.py` define una `Columna` por campo y de ahí salen **las dos cosas**: la
plantilla que se descarga y el lector que valida lo que se sube. Así la
plantilla nunca se desincroniza del importador.

La plantilla trae dos hojas: `Datos` (encabezados congelados, una fila de
ejemplo y desplegables en las columnas con opciones) e `Instrucciones` (tipo de
cada columna, si es obligatoria y los valores válidos).

La importación es **todo o nada**: si una fila falla no se guarda ninguna y se
devuelve el detalle en `filas: [{fila, errores}]` para corregir el archivo de
una sola pasada. Las columnas se localizan por el texto del encabezado, no por
su posición, así que reordenarlas en Excel no rompe nada.

Donde hay clave natural la carga **actualiza en vez de duplicar**: el código en
puntos de venta y productos, el par producto + punto de venta en inventario y
metas. Las ventas no tienen clave natural, así que reimportar el mismo archivo
sí duplica — la plantilla lo advierte.

```bash
python manage.py seed_bi_trade_app             # app + permiso
python manage.py seed_bi_trade_demo            # datos de ejemplo para ver el tablero
python manage.py seed_bi_trade_demo --limpiar  # borra los de ejemplo y recarga
```

## Valoración de desempeño

Evaluación 180° por ciclos: `apps/valoracion`, montada en `/api/valoracion/`.

```
Competency  → categoría interna que agrupa preguntas (A. Cultura, B. …)
Question    → ítem del banco (liderazgo u operativo), con peso
Cycle       → periodo con su ventana de fechas y sus pesos jefe/equipo
Assignment  → par evaluador → evaluado dentro de un ciclo
Answer      → respuesta de una pregunta dentro de una asignación
Result      → consolidado de una persona en un ciclo (lo escribe el motor)
ActionPlan  → compromiso de mejora sobre un resultado
```

La jerarquía **no se duplica**: quién evalúa a quién sale de `User.manager`.

### El motor de cálculo (`scoring.py`)

Consolida en dos niveles, y el orden importa:

1. **Dentro de un ciclo** (`recompute_result`) — promedia las calificaciones por
   rol del evaluador (jefe / equipo / autoevaluación) y las pondera según los
   pesos del ciclo: liderazgo con jefe y equipo usa 60/40 configurable, operativo
   con ambas miradas usa promedio simple, y con una sola fuente usa esa. La
   autoevaluación queda como referencia y solo puntúa si no hay mirada externa.
   La persona termina con **un** resultado por ciclo, no uno por evaluador.
2. **Entre ciclos** (`consolidate_people`) — pondera cada ciclo por el número de
   calificaciones que aportó. Ejemplo: 1 calificación al 60% y 4 al 90% → **84%**
   con 5 calificaciones.

El semáforo sale del porcentaje: ≥90 referente · ≥75 consolidado · ≥60 en
desarrollo · ≥40 requiere acompañamiento · resto requiere intervención.

El motor se corre a mano (`POST /ciclos/{id}/consolidar` o
`python manage.py recalcular_valoracion`) y es reejecutable.

### Endpoints

| Endpoint | Qué hace |
|---|---|
| `GET /api/valoracion/resumen` | Home del módulo: permisos, pendientes y avance |
| `GET /api/valoracion/opciones` | Catálogos para formularios y filtros |
| `/api/valoracion/competencias`, `/preguntas` | Banco de evaluación (CRUD) |
| `/api/valoracion/ciclos` | CRUD + `consolidar`, `pendientes`, `generar-asignaciones` |
| `/api/valoracion/asignaciones` | CRUD + `reabrir`, `toggle-activa` |
| `/api/valoracion/mis-evaluaciones` | Lo que me toca calificar + `guardar` |
| `/api/valoracion/resultados` | Detalle, `mis-resultados` y `equipo` |
| `/api/valoracion/planes-accion` | Planes de mejora |
| `/api/valoracion/jerarquia` | Cargo y jefe directo |
| `/api/valoracion/dashboard`, `/consolidado` | Informes y exportes CSV |
| `GET/PATCH /api/valoracion/configuracion` | Publicar o bloquear resultados |

### Accesos

Cada capacidad es un `Permission` que se reparte con roles desde Administración;
el módulo legacy decidía por el nombre del área y esto lo reemplaza.

| Permiso | Para qué |
|---|---|
| `valoracion:config:manage` | Competencias y preguntas |
| `valoracion:cycles:manage` | Ciclos, asignaciones y consolidación |
| `valoracion:results:view_all` | Resultados de toda la compañía |
| `valoracion:results:publish` | Habilitar o bloquear los resultados al equipo |
| `valoracion:dashboard:view` | Dashboard, consolidado e informes |
| `valoracion:plans:manage` | Planes de acción |
| `valoracion:hierarchy:manage` | Editar cargos y jefes directos |

Responder lo asignado y ver el resultado propio **no** necesita permiso: basta
tener la app. Un líder ve a su equipo sin permisos, por tener gente a cargo.

```bash
python manage.py seed_valoracion_app             # app + permisos + 3 roles
python manage.py seed_valoracion_app --todos     # y da acceso a todos los activos
```

Crea los roles *Valoración · Admin People*, *· BI / Tech* y *· Dirección*.

### Candado de publicación

«Mis resultados» y «Planes de acción» nacen **bloqueados** para el equipo. Quien
tenga `results:publish` los abre desde el home del módulo, idealmente con el
avance al 100%. Es una fila única (`ValuationSettings`) con fecha y responsable.

## Producción

- `DJANGO_SETTINGS_MODULE=config.settings.production`, `SECRET_KEY` real,
  `ALLOWED_HOSTS` y `CORS_ALLOWED_ORIGINS` acotados.
- Cambiar `DATABASES` a PostgreSQL en `config/settings/production.py`.
