# Supli Performance · Fase 1 — Objetivos y KPIs

**Qué es este documento:** lo que quedó construido de la Fase 1 y, antes de eso, las
inconsistencias entre los documentos que recibimos y las decisiones que necesito confirmadas para
no tener que rehacer trabajo.

**Insumos analizados**

| Archivo | Qué es | Origen |
|---|---|---|
| `VERSIÓN 2 SUPLI PERFORMANCE.docx` | Framework MVP de negocio | People |
| `Especificacion_Tecnica_Supli_Performance_V2_Fase2.md` (v1.2, INT-TEC-ET-001) | Especificación técnica | Laura Ayala · Tech Manager |
| `Prototipo_supli_performance_formulario_objetivos.html` | Mockup aprobado del formulario | — |

**Estado:** Fase 1 construida y probada en local. **Falta desplegar** (ver «Puesta en producción»).
**Fecha objetivo de la especificación:** 28 de septiembre de 2026.

---

# 1. Inconsistencias y preguntas para el MVP

> Cada punto dice qué encontré, qué quedó implementado mientras tanto y qué necesito que se
> decida. Donde no hubo respuesta, se tomó la opción que **no obliga a migrar datos después**.

### 1.1 El 100% de ponderación: ¿por objetivo o por persona? ⚠️ Alta

- El **docx** dice: «la suma de los pesos de los KPIs asociados a **un objetivo** deberá
  corresponder al 100%».
- La **especificación técnica** (§4.2 y §6, regla 1) dice: la suma por **`(colaborador, periodo)`**
  debe ser exactamente 100.
- El **mockup** confirma lo segundo: «80% de ponderación asignada · falta 20%» sobre el conjunto de
  objetivos de la persona.

**Implementado:** como está en la especificación técnica y el mockup — **la suma de los pesos de
todos los objetivos de una persona en un mes debe dar 100**. Además no se deja guardar un objetivo
que haría pasar de 100.

**Decidir:** confirmar que el docx quiso decir lo mismo. Si de verdad es «100% por objetivo»,
cambia el modelo de datos, no solo una validación.

### 1.2 ¿Un objetivo tiene un KPI o varios? ⚠️ Alta

El docx habla de «KPIs asociados a un objetivo» (varios); la especificación y el mockup ponen
objetivo y KPI en la misma fila (uno).

**Implementado:** una fila = un objetivo con su KPI, como la especificación y el mockup. Si mañana
se necesitan varios KPIs por objetivo, se agrega una tabla hija sin romper lo cargado.

**Decidir:** confirmar. Es la misma pregunta que 1.1 vista desde el otro lado.

### 1.3 El alcance del MVP no es el mismo en los dos documentos ⚠️ Alta

El **docx** da por incluido para la última semana de septiembre: objetivos, KPIs, resultados,
evidencias, dashboards, semáforo, Top Performance, histórico, **Challenges** y **Reconocimiento**,
con filtros por regional y CAV y cortes mensual/Q/semestral/anual.

La **especificación técnica** compromete para el 28 de septiembre solo la Fase 1 (contenedor +
objetivos + validación de pesos + carga de octubre), deja resultados y dashboards para octubre y
**no modela Challenges ni Reconocimiento en ninguna parte**: ni tabla, ni endpoint, ni pantalla.

**Implementado:** la Fase 1 de la especificación técnica, completa. Ver la parte 2.

**Decidir:** o Challenges y Reconocimiento quedan explícitamente fuera de septiembre, o hace falta
su especificación (campos, criterios, reglas) para poder estimarlos. Hoy no hay con qué construirlos.

### 1.4 La especificación técnica está escrita para otro proyecto ℹ️ Aviso

El §2 pide Node.js/Express, frontend en un `public/index.html` de JavaScript plano, un esquema
`Supli_Performance` aparte, migraciones con `CREATE TABLE IF NOT EXISTS` al arrancar el servidor y
entrega en zip. Eso describe el proyecto anterior (`xppcoltrade`), no esta plataforma, que es
**Django + DRF + React/Vite** con migraciones de Django y despliegue por `git push` a Render.

**Implementado:** la arquitectura de supli. El modelo de datos (§4), el motor de cálculo (§5), las
reglas (§6), los roles (§7) y los endpoints (§8) se respetaron tal cual; solo cambia el lenguaje.

**No requiere decisión**, pero conviene corregir el §2 del documento para la próxima fase.

### 1.5 ¿Cuándo un objetivo pasa de «borrador» a «activo»?

La especificación define tres estados (`borrador → activo → congelado`) pero solo dice cuándo se
congela (al poner el mes en medición).

**Implementado:** nace en `borrador` y pasa a `congelado` al activar el mes. El estado `activo`
existe en el modelo, sin uso.

**Decidir:** si «activo» significa algo (por ejemplo, «el jefe ya lo revisó y lo dio por bueno»),
decir qué acción lo dispara.

### 1.6 El cálculo inverso se divide por cero ⚠️ Media

`proporcional_inverso` calcula `meta ÷ ejecutado`. Si lo ejecutado es **0** —que es el mejor
resultado posible en un KPI de «menos es mejor»: cero días, cero tickets, cero errores— la fórmula
se rompe.

**Implementado:** ejecutar 0 cuenta como **100%** de cumplimiento (topado, salvo que el objetivo
permita sobrecumplimiento).

**Decidir:** confirmar con People que ese es el criterio.

### 1.7 Meta en cero

Un objetivo proporcional con meta 0 tampoco se puede calcular.

**Implementado:** no se deja guardar; la meta debe ser mayor que cero en los dos tipos
proporcionales. En los binarios no se pide meta.

### 1.8 Sobrecumplimiento: sigue pendiente de People ⚠️ Media

La especificación lo deja parametrizado por objetivo con tope en 100, a la espera de la respuesta
de People.

**Implementado:** igual — un interruptor por objetivo, apagado por defecto, con su nota en el
formulario. Cuando People responda, se cambia el valor por defecto (o se define por cargo) **sin
migración**.

### 1.9 Fórmula personalizada: ¿se necesita en octubre?

La especificación advierte que no se use `eval` y nombra librerías de Node.

**Implementado:** un evaluador propio y acotado: solo aritmética con `logrado` y `meta`, más
`min`, `max`, `abs` y `round`. Cualquier otra cosa —una llamada, un import, un nombre desconocido—
se rechaza al guardar el objetivo, no en octubre. Hay pruebas que intentan colar
`__import__("os")` y `open("...")` y verifican que fallen.

**Decidir:** si los objetivos de octubre se cubren con binario, proporcional e inverso, se puede
esconder el tipo «fórmula» del formulario y reducir superficie.

### 1.10 Semáforo: falta la escala ⚠️ Media

El docx y la especificación piden semáforo de cumplimiento, pero **nadie definió los rangos**.

**Implementado:** el campo `umbral_cumplimiento` por objetivo queda capturado. Los colores no se
pueden pintar todavía.

**Decidir (People):** los cortes. Por ejemplo: rojo < 80, amarillo 80–94, verde ≥ 95.

### 1.11 Organigrama: los filtros que pide el docx no tienen datos ⚠️ Media

El docx pide filtrar por cargo, rol, área, **dirección**, **organización**, **regional** y
**CAV/punto de venta**. En la plataforma solo existían área (catálogo) y cargo (texto libre).

**Implementado:** se agregaron al usuario los cuatro campos que faltaban —`dirección`,
`organización`, `regional`, `CAV/punto de venta`— **vacíos y opcionales**, editables desde
Administración, para que People los diligencie cuando tenga la estructura. Ningún filtro depende
todavía de ellos.

**Decidir:** (a) quién y cuándo los diligencia; (b) si el **cargo** debe volverse catálogo: hoy es
texto libre y «objetivos por cargo/rol» no se puede agrupar de forma confiable con texto libre.

### 1.12 Evidencias: ¿archivo o enlace? ⚠️ Media (afecta a la Fase 2)

El docx pide adjuntar bases de datos, actas y proyectos. La especificación solo modela
`link_soporte` (URL).

**Implementado:** la tabla `Evidencia` con enlace, como la especificación. **Aviso técnico:** el
disco de Render es efímero —un archivo subido se pierde en el siguiente despliegue—, así que
adjuntar archivos de verdad exige almacenamiento externo (S3/Azure) y eso es trabajo aparte.

**Decidir:** enlaces a SharePoint/OneDrive (lo que la compañía ya usa, costo cero) o presupuestar
el almacenamiento.

### 1.13 El «Q-Periodo» de 4 meses

El docx pide ver el Performance mensual, por **«Q-Periodo acumulado de 4 meses»**, semestral y
anual. Un cuatrimestre, no un trimestre.

**Decidir:** confirmar que no es un error de tipeo, porque define todos los cortes de la Fase 2.

### 1.14 Quién es «People Manager» y quién es «Dirección» dentro de la plataforma

Los roles quedaron creados (`performance-people`, `performance-direccion`) pero **sin asignar**:
asignarlos toca la base de producción y esa decisión no es mía.

**Decidir:** a qué cuentas se les asigna cada rol.

### 1.15 La jerarquía tiene que estar completa ⚠️ Alta para la carga de octubre

El módulo resuelve «el equipo de un líder» con el jefe directo (`User.manager`), tal como lo hace
Valoración. **Quien no tenga jefe asignado no le aparece a nadie**, y por lo tanto nadie puede
definirle objetivos.

**Decidir/hacer:** revisar la jerarquía completa antes de cargar octubre. Se edita desde
Valoración → Jerarquía. (Recordar que quedaron dos casos sin resolver de la migración: el jefe de
Marcela y el de Jessica.)

### 1.16 Asesores y promotores

La regla 8 dice que su resultado lo carga el Trade Leader / Trade Manager.

**Implementado:** cada objetivo tiene `responsable del resultado`, que por defecto es el
colaborador y se puede cambiar a otra persona.

**Decidir:** el listado de cargos a los que les aplica, que la propia especificación pide en su
§11.3.

### 1.17 ¿Se abre el mes a mano?

**Implementado:** el mes se abre solo con el primer objetivo que se carga, y se cierra —pasa a
medición— con el botón «Poner el mes en medición», que valida el 100% de todos.

**Decidir:** si People quiere además una fecha límite de congelamiento automático (aparece en los
insumos pendientes del §11.2 de la especificación).

---

# 2. Lo que se desarrolló

Todo lo que la especificación técnica lista como Fase 1 (§9), con la arquitectura que ya tiene la
plataforma.

## 2.1 El menú: Supli Performance como contenedor

Como pide el §3: **Supli Performance deja de ser una app suelta y pasa a ser el contenedor**. Al
abrirlo, en el panel izquierdo se despliegan sus sub-módulos:

```
Aplicaciones
├── BI Trade Marketing
├── Supli Performance          ← contenedor
│   ├── Objetivos y KPIs       ← nuevo
│   └── Valoración             ← la que ya existía, reubicada
└── Administración
```

- El modelo `Application` ganó un campo `parent`: una app puede colgar de otra. El menú, la portada
  y los accesos se arman solos con eso.
- **Valoración no se tocó**: conserva su código, su ruta `/inicio/valoracion`, sus permisos y sus
  accesos. Solo cambió de lugar en el menú y volvió a llamarse «Valoración».
- Quien tiene acceso a un sub-módulo ve el contenedor automáticamente; quien solo tiene Valoración
  no ve Objetivos y KPIs, ni entrando por la URL.

## 2.2 Modelo de datos

Las cuatro tablas del §4, como modelos de Django (app `apps/performance`):

| Modelo | Para qué | Fase |
|---|---|---|
| `Periodo` | El mes y su estado: `definición → en medición → cerrado` | 1 |
| `Objetivo` | Objetivo + KPI de una persona en un mes, con peso, tipo de medición, meta, umbral, sobrecumplimiento, fórmula, fuente y responsable | 1 |
| `Resultado` | Lo ejecutado y su % de cumplimiento, con validación del líder | **2 — modelado desde ya** |
| `Evidencia` | El soporte del resultado (`link_soporte`) | **2 — modelado desde ya** |

Las llaves a personas apuntan al usuario real de la plataforma (`accounts.User`), no a una tabla
nueva: **no se crean usuarios ni jerarquías**, se reusan los de Valoración.

Para el §11.1 de la especificación, que pedía confirmar los nombres reales:

- Usuario: `accounts.User` (tabla `accounts_user`)
- Jefe: `User.manager` · el equipo de alguien es `user.team`
- Área: `User.area` → `accounts_area` · Cargo: `User.position` · Tipo: `User.kind`
- Roles y permisos: `accounts_role`, `accounts_permission`, `accounts_application`

## 2.3 Motor de cálculo

El §5, en Python (`apps/performance/cumplimiento.py`). **El porcentaje nunca se digita**: lo calcula
el backend.

| Tipo | Cómo se calcula |
|---|---|
| Binario | Cumple → 100% · No cumple → 0% |
| Proporcional | `logrado ÷ meta × 100` (más es mejor) |
| Proporcional inverso | `meta ÷ logrado × 100` (menos es mejor); ejecutar 0 → 100% |
| Fórmula | Expresión con `logrado` y `meta`, evaluada de forma acotada |

Más el tope de sobrecumplimiento, el piso en cero, el redondeo a dos decimales y
`cumplimiento_total()` = `Σ (peso ÷ 100 × %)`, que es lo que después ordena el ranking y el Top
Performance de la Fase 2. Está probado unitariamente, como pide el paso 8 del §9.

## 2.4 Reglas de negocio (§6)

| # | Regla | Dónde quedó |
|---|---|---|
| 1 | Los pesos de una persona deben sumar 100% | Se valida al activar el mes; además no se deja pasar de 100 al guardar |
| 2 | Máximo 6 objetivos por persona y mes | Al crear |
| 3 | El objetivo lo crea el jefe o People; el colaborador nunca | Permisos de la API |
| 4 | El colaborador solo consulta (y en Fase 2 carga resultado) | Vista «Mis objetivos», sin acciones |
| 5 | Al pasar a medición, los objetivos se congelan | Al activar el mes: no se editan ni se eliminan |
| 6 | El histórico no se sobrescribe al cambiar de mes | Cada `(persona, mes)` es un registro aparte |
| 7 | El % de cumplimiento siempre calculado, nunca recibido | El campo no es editable por la API |
| 8 | El resultado de asesores y promotores lo carga su Trade Leader | Campo «responsable del resultado» |

## 2.5 Roles y permisos (§7)

| Rol | Qué puede |
|---|---|
| **People Manager** (`performance-people`) | Define objetivos de cualquiera, abre y activa el mes |
| **Dirección / CEO** (`performance-direccion`) | Ve los objetivos de toda la organización, solo lectura |
| **Líder / Jefe** | Define y ve los de su equipo. **No necesita rol**: sale de la jerarquía, igual que en Valoración |
| **Miembro** | Ve los suyos. Basta con tener el sub-módulo asignado |

## 2.6 API

Base `/api/performance`. Son los endpoints de la Fase 1 del §8:

| Método | Ruta | Quién | Qué hace |
|---|---|---|---|
| GET | `/objetivos?colaborador=&periodo=` | Líder, People, dueño | Objetivos de una persona en un mes |
| POST | `/objetivos` | Líder (su equipo), People | Crea (valida máximo 6 y ponderación) |
| PATCH/PUT | `/objetivos/:id` | Líder (su equipo), People | Edita, solo si el mes no está en medición |
| DELETE | `/objetivos/:id` | Líder (su equipo), People | Elimina, solo en definición |
| GET | `/mis-objetivos?periodo=` | Cualquiera | Los propios, en solo lectura |
| GET | `/periodos/:periodo/resumen` | Líder, People | Suma de pesos y conteo: el banner del 100% |
| POST | `/periodos/:periodo/activar` | People | Valida Σ=100 por persona y congela el mes |
| GET | `/opciones` | Cualquiera | Catálogos, equipo y capacidades |
| GET | `/resumen` | Cualquiera | La portada del sub-módulo |

La activación responde **422 `PESO_INCOMPLETO`** con la lista de quiénes no llegan al 100% y por
cuánto, tal como el pseudocódigo del §8. Si alguien falla **no se activa nada**: el mes no arranca
a medias.

## 2.7 Pantallas

En `/inicio/performance/objetivos`, con la barra de vistas del prototipo:

- **Inicio** — el estado del mes, cuántos objetivos tengo y cuánto llevo ponderado; para un líder,
  cuántas personas de su equipo ya cerraron en 100%.
- **Mis objetivos** — la consulta del colaborador, en solo lectura, con su banner de ponderación.
- **Objetivos del equipo** — la pantalla del mockup aprobado: selector de colaborador y periodo, la
  línea de contexto (área · dirección · jefe), el banner del 100% en ámbar/verde, el formulario de
  definición con **campos condicionales según el tipo de medición** —el binario no pide meta y
  explica «Cumple → 100% · No cumple → 0%», la fórmula pide la expresión— y la tabla de objetivos
  del mes con editar y eliminar.
- **Dashboard** y **Top Performance** — visibles y marcadas «Fase 2», como el bloque bloqueado del
  prototipo. Igual que la tarjeta «Carga de resultado y evidencia — se habilita en octubre».

El % de cumplimiento no aparece en ningún formulario, a propósito.

## 2.8 Pruebas

**24 pruebas nuevas**, todas en verde, y las 292 del proyecto completo siguen pasando. Cubren: los
cuatro tipos de medición y su tope, el evaluador de fórmulas rechazando código malicioso, el
ponderado de la persona, quién puede definir objetivos y quién no (incluido «nadie define los
suyos»), el máximo de 6, el tope de 100%, la meta obligatoria, la activación del mes con y sin el
100%, el congelamiento, el histórico por mes y la estructura del menú.

## 2.9 Archivos

**Backend** — `backend/apps/performance/`: `models.py`, `cumplimiento.py`, `api_permissions.py`,
`serializers.py`, `views.py`, `urls.py`, `admin.py`, `tests.py`,
`migrations/0001_objetivos_y_kpis.py`, `management/commands/seed_performance_app.py`.
Tocados: `apps/accounts/models.py` (campo `parent` y los cuatro del organigrama),
`apps/accounts/serializers.py`, `apps/accounts/serializers_admin.py`,
`apps/accounts/migrations/0004_organigrama_y_submodulos.py`, `config/settings/base.py`,
`config/urls.py`.

**Frontend** — `frontend/src/modules/performance/`: `api.ts`, `hooks.ts`,
`components/{Piezas,FormularioObjetivo,TablaObjetivos}.tsx`,
`pages/{PerformanceInicioPage,PerformanceLayout,PerformanceHomePage,MisObjetivosPage,ObjetivosEquipoPage}.tsx`.
Tocados: `app/layouts/AppSidebar.tsx` (menú con sub-módulos), `app/router/routes.tsx`,
`core/auth/types.ts`, `shared/lib/appIcons.ts`.

## 2.10 Puesta en producción

Nada de esto está desplegado todavía. Para dejarlo andando hay que correr, en este orden:

```bash
python manage.py migrate
python manage.py seed_performance_app
```

El *seed* crea el contenedor, el sub-módulo, los permisos y los roles, y reubica Valoración. Es
idempotente. Después hay que dar los accesos, y eso **sí cambia datos de producción**, así que lo
dejo escrito y no ejecutado:

```bash
# Le da Objetivos y KPIs a quien ya tenga Valoración
python manage.py seed_performance_app --como-valoracion

# O persona por persona
python manage.py seed_performance_app --asignar-a correo@supli.tech
```

Los roles `performance-people` y `performance-direccion` se asignan desde Administración → Roles,
según lo que se decida en el punto 1.14.

## 2.11 Lo que NO se hizo, y por qué

- **Carga de resultado y evidencia, dashboards, semáforo, Top Performance e históricos**: son la
  Fase 2 (octubre) según la especificación. Las tablas ya están y el motor de cálculo ya funciona,
  así que es construir las vistas, no rehacer el modelo.
- **Challenges y Reconocimiento**: el docx los da por incluidos, la especificación técnica no los
  define. Ver el punto 1.3: hoy no hay con qué construirlos.
- **Compensación variable**: fuera de alcance por los dos documentos (Fase 3).
- **Integración con Planner**: fuera de alcance por los dos documentos.
