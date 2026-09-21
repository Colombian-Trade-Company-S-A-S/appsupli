# Especificación técnica y de arquitectura — Supli Performance (Fase 2)

**Código:** INT-TEC-ET-001
**Módulo:** Supli Performance — Medición de objetivos y KPIs
**Versión:** 1.2 · Septiembre 2026 · *(v1.2: la selección de sub-módulo se hace desde un ítem colapsable en el panel izquierdo; los tabs superiores muestran las vistas del sub-módulo activo)*
**Autor:** Laura Ayala (Tech Manager)
**Dirigido a:** Equipo de Desarrollo Tecnología y Datos
**Entrega objetivo:** 28 de septiembre de 2026 (Fase 1)

---

## 1. Objetivo del documento

Entregar al equipo la base técnica para construir la nueva funcionalidad de **medición de objetivos y KPIs** dentro de Supli Performance, sin retrabajo. El documento define el stack, la arquitectura, el modelo de datos, el motor de cálculo, las reglas de negocio, los roles y los endpoints.

Supli Performance ya existe como el módulo de valoración y feedback (hoy visible como "Valoración"). Esta fase reorganiza la navegación: **Supli Performance pasa a ser el contenedor (la puerta de entrada)** y adentro alberga dos sub-módulos — **Valoración** (cualitativo, existente) y **Objetivos y KPIs** (cuantitativo, lo que se desarrolla en esta fase). **No se reconstruye nada existente**: Valoración solo se reubica bajo el contenedor y se reutiliza la base de usuarios, jerarquía y roles del módulo actual.

### Alcance por fase

| Fase | Cuándo | Qué se construye |
|---|---|---|
| **Fase 1** | 28 sep 2026 | Supli Performance como **contenedor colapsable** en el panel izquierdo (con Valoración y Objetivos y KPIs como sub-módulos) · sub-módulo **Objetivos y KPIs** · vistas segmentadas por rol · formulario de **registro/definición de objetivos** (lo hace el jefe) · consulta de objetivos (colaborador, solo lectura) · cargue de los objetivos de octubre |
| **Fase 2** | Octubre 2026 | Cargue de **resultado ejecutado** y **evidencia** · cálculo automático de % de cumplimiento · semáforo · dashboards · Top Performance · histórico |
| Fase 3 | Posterior | Compensación variable (bonos/comisiones). **Fuera de alcance.** |

> El resultado y la evidencia se **modelan** desde ya (tablas listas) pero su vista/captura no entra en Fase 1.

---

## 2. Stack técnico

Alineado con las convenciones actuales de los proyectos internos en Render:

- **Backend:** Node.js / Express (`server/index.js`)
- **Frontend:** JavaScript vanilla, archivo único (`public/index.html`)
- **Base de datos:** PostgreSQL — esquema dedicado **`Supli_Performance`**
- **Despliegue:** Render vía `git push`. Las migraciones corren automáticamente en el arranque del servidor con `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` (no hay paso de migración manual).
- **Convenciones de datos:**
  - Columnas de URL/soporte con prefijo `link_*`.
  - Timestamps `created_at` / `updated_at` con `TIMESTAMPTZ DEFAULT now()`.
  - Estados como `TEXT` con `CHECK (... IN (...))`, no `ENUM` nativo (facilita `ADD COLUMN IF NOT EXISTS` y evolución sin `ALTER TYPE`).

### Integración con el módulo existente

- La autenticación, el listado de usuarios y la **jerarquía (jefe ↔ colaborador)** ya existen en el módulo de Valoración. Este módulo **no crea usuarios ni roles nuevos**: los referencia (`REFERENCES usuario(id)`).
- Ajustar el nombre real de las tablas/columnas de usuario y jerarquía a las del proyecto (aquí se asume `usuario(id)`). Confirmar antes de escribir las FKs.

---

## 3. Arquitectura

```
appsupli.onrender.com
│
├── General
│   ├── Inicio
│   └── Mi perfil
│
└── Aplicaciones
    ├── BI Trade Marketing
    ├── Supli Performance          → CONTENEDOR · ítem colapsable (puerta de entrada)
    │   ├── Objetivos y KPIs       → sub-módulo cuantitativo (NUEVO, esta fase)
    │   └── Valoración             → sub-módulo cualitativo (existente, se reubica)
    └── Administración
```

- **Supli Performance es el contenedor**, representado como un **ítem colapsable** en el panel izquierdo. Al hacer clic se despliega y muestra sus sub-módulos: **Objetivos y KPIs** (nuevo) y **Valoración** (existente). La antigua app "Valoración" **deja de ser una entrada independiente** (el panel vuelve a listar 3 aplicaciones).
- **La selección de sub-módulo se hace desde el menú lateral** (no con tabs superiores). La **barra superior (tabs) muestra las vistas del sub-módulo activo**; para Objetivos y KPIs: `Inicio` · `Mis objetivos` · `Objetivos del equipo` · `Dashboard` · `Top Performance`.
- **Implicación de frontend:** el ruteo debe contemplar `contenedor → sub-módulo (menú lateral) → vista (tab superior)`. El sub-módulo activo determina qué tabs se renderizan. El desarrollo de esta fase se concentra en **Objetivos y KPIs**; **Valoración no se modifica**, solo cuelga del contenedor.
- La **sesión y el modelo de roles son compartidos** entre ambos sub-módulos: se reutiliza el layout, la barra superior, el sistema de sesión y los roles del app actual.
- La lógica de negocio (validación de pesos, cálculo de cumplimiento, permisos) vive en el **backend** (Express). El frontend solo consume la API y renderiza.

---

## 4. Modelo de datos

Esquema `Supli_Performance`. Tres tablas núcleo (`objetivo`, `resultado`, `evidencia`) y una tabla catálogo opcional de periodos.

### 4.1 DDL

```sql
CREATE SCHEMA IF NOT EXISTS "Supli_Performance";

-- Catálogo de periodos (opcional pero recomendado: controla el "abrir/congelar" mes)
CREATE TABLE IF NOT EXISTS "Supli_Performance".periodo (
  id            SERIAL PRIMARY KEY,
  periodo       DATE NOT NULL UNIQUE,        -- primer día del mes (2026-10-01)
  estado        TEXT NOT NULL DEFAULT 'definicion'
                CHECK (estado IN ('definicion','en_medicion','cerrado')),
  abierto_por   INT,                         -- REFERENCES usuario(id)
  fecha_apertura   TIMESTAMPTZ,
  fecha_cierre     TIMESTAMPTZ
);

-- 1. Definición del objetivo (Fase 1)
CREATE TABLE IF NOT EXISTS "Supli_Performance".objetivo (
  id                        SERIAL PRIMARY KEY,
  colaborador_id            INT  NOT NULL,      -- REFERENCES usuario(id): a quién se asigna
  registrado_por_id         INT  NOT NULL,      -- REFERENCES usuario(id): el jefe / People
  periodo                   DATE NOT NULL,      -- primer día del mes
  objetivo                  TEXT NOT NULL,
  kpi                       TEXT NOT NULL,
  peso                      NUMERIC(5,2) NOT NULL,   -- % ponderación
  tipo_medicion             TEXT NOT NULL
                            CHECK (tipo_medicion IN
                              ('binario','proporcional','proporcional_inverso','formula')),
  unidad                    TEXT,               -- 'peso','porcentaje','unidades','dias','si_no'
  meta_valor                NUMERIC,            -- NULL en binario
  umbral_cumplimiento       NUMERIC,            -- opcional; alimenta el semáforo
  permite_sobrecumplimiento BOOLEAN NOT NULL DEFAULT FALSE,  -- decisión pendiente con People
  tope_cumplimiento         NUMERIC DEFAULT 100,             -- se aplica si NO permite sobrecumplir
  formula                   TEXT,               -- solo cuando tipo_medicion='formula'
  fuente_datos              TEXT,
  responsable_resultado_id  INT,                -- REFERENCES usuario(id); default = colaborador
  estado                    TEXT NOT NULL DEFAULT 'borrador'
                            CHECK (estado IN ('borrador','activo','congelado')),
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_obj_colab_periodo
  ON "Supli_Performance".objetivo (colaborador_id, periodo);

-- 2. Resultado mensual (Fase 2)
CREATE TABLE IF NOT EXISTS "Supli_Performance".resultado (
  id                      SERIAL PRIMARY KEY,
  objetivo_id             INT NOT NULL UNIQUE,   -- REFERENCES objetivo(id): un resultado por objetivo/mes
  resultado_ejecutado     NUMERIC,               -- lo logrado (binario: 0/1)
  porcentaje_cumplimiento NUMERIC,               -- CALCULADO por backend, nunca digitado
  cargado_por_id          INT,                   -- REFERENCES usuario(id)
  fecha_carga             TIMESTAMPTZ,
  estado_validacion       TEXT NOT NULL DEFAULT 'pendiente'
                          CHECK (estado_validacion IN ('pendiente','validado','rechazado')),
  validado_por_id         INT,                   -- REFERENCES usuario(id)
  fecha_validacion        TIMESTAMPTZ,
  observacion             TEXT
);

-- 3. Evidencia (Fase 2; modelada desde ya)
CREATE TABLE IF NOT EXISTS "Supli_Performance".evidencia (
  id            SERIAL PRIMARY KEY,
  resultado_id  INT NOT NULL,                    -- REFERENCES resultado(id)
  tipo          TEXT CHECK (tipo IN
                  ('archivo','link','acta','reporte','proyecto','base_datos','otro')),
  nombre        TEXT,
  link_soporte  TEXT,                            -- convención link_* para URLs
  created_at    TIMESTAMPTZ DEFAULT now()
);
```

> Las FKs se dejan comentadas hasta confirmar los nombres reales de las tablas de usuario/jerarquía del módulo de Valoración. Agregarlas con `ALTER TABLE ... ADD CONSTRAINT ... IF NOT EXISTS` una vez confirmados.

### 4.2 Diccionario de campos clave (tabla `objetivo`)

| Campo | Descripción | Regla |
|---|---|---|
| `peso` | % de ponderación del objetivo | La suma por `(colaborador_id, periodo)` debe ser exactamente 100 |
| `tipo_medicion` | Cómo se calcula el cumplimiento | Punto de extensión: agregar un tipo NO requiere rediseño |
| `meta_valor` | Meta cuantitativa | Obligatoria salvo en `binario` |
| `umbral_cumplimiento` | Valor/% desde el cual cuenta como cumplido | Opcional; usado por el semáforo |
| `permite_sobrecumplimiento` / `tope_cumplimiento` | Controlan si el % puede pasar de 100 | Default: topado a 100 (pendiente People) |
| `estado` | `borrador → activo → congelado` | Se congela al pasar el periodo a `en_medicion` |

---

## 5. Motor de cálculo del % de cumplimiento

**Regla central:** el `porcentaje_cumplimiento` **nunca se digita**; lo calcula el backend según `tipo_medicion`. Toda la flexibilidad de medición vive en esta única función. Agregar una forma de medir mañana = agregar un `case`, sin tocar el modelo ni el formulario.

```js
// server/performance/cumplimiento.js
function calcularCumplimiento(objetivo, resultadoEjecutado) {
  const { tipo_medicion, meta_valor, permite_sobrecumplimiento, tope_cumplimiento, formula } = objetivo;
  let pct;

  switch (tipo_medicion) {
    case 'binario':
      // resultadoEjecutado: 1 (cumple) o 0 (no cumple)
      pct = Number(resultadoEjecutado) >= 1 ? 100 : 0;
      break;

    case 'proporcional':                 // más es mejor
      pct = (Number(resultadoEjecutado) / Number(meta_valor)) * 100;
      break;

    case 'proporcional_inverso':         // menos es mejor (tiempos, costos, tickets)
      pct = (Number(meta_valor) / Number(resultadoEjecutado)) * 100;
      break;

    case 'formula':                      // fórmula parametrizada por KPI
      pct = evaluarFormula(formula, { logrado: Number(resultadoEjecutado), meta: Number(meta_valor) });
      break;

    default:
      throw new Error('tipo_medicion no soportado: ' + tipo_medicion);
  }

  // Sobrecumplimiento: si no se permite, se topa (default 100)
  if (!permite_sobrecumplimiento && pct > (tope_cumplimiento ?? 100)) {
    pct = tope_cumplimiento ?? 100;
  }
  if (pct < 0) pct = 0;

  return Math.round(pct * 100) / 100; // 2 decimales
}
```

- `evaluarFormula` debe ser un evaluador **acotado** (no `eval`): usar un parser de expresiones matemáticas seguro (p. ej. `expr-eval` o `mathjs` con scope restringido a las variables `logrado` y `meta`).
- **Cumplimiento total de la persona (para ranking):** `Σ (peso_i/100 × pct_i)` sobre sus objetivos del periodo.

---

## 6. Reglas de negocio y dónde se validan

| # | Regla | Dónde se aplica |
|---|---|---|
| 1 | La suma de `peso` por colaborador/periodo debe ser **exactamente 100%**. El sistema **advierte y NO deja guardar/activar** el mes si no suma 100. | **API** (no es un `CHECK`, es entre filas): validar en el endpoint de activación del periodo |
| 2 | Máximo **6 objetivos** por colaborador/periodo. | API |
| 3 | El objetivo lo **crea/edita solo el jefe o People**. El colaborador nunca lo edita. | Middleware de permisos |
| 4 | El colaborador solo puede **cargar resultado y evidencia** (Fase 2), no editar el objetivo. | Middleware de permisos |
| 5 | Al pasar el periodo a `en_medicion`, los objetivos se **congelan** (`estado='congelado'`); no se editan sin autorización. | API + estado en BD |
| 6 | El **histórico** no se sobrescribe al cambiar de mes: cada `(colaborador, periodo)` es un registro independiente. | Modelo de datos |
| 7 | `porcentaje_cumplimiento` siempre calculado, nunca recibido del cliente. | API / motor de cálculo |
| 8 | Asesores y promotores: su resultado lo carga el **Trade Leader / Trade Manager**. | `responsable_resultado_id` + permisos |

**Decisión pendiente (People):** el sobrecumplimiento (>100%) está parametrizado por objetivo (`permite_sobrecumplimiento` / `tope_cumplimiento`) con default topado a 100. Cuando People responda, solo se ajusta el default o se define por cargo — sin migración. Ver documento `Preguntas_People_Supli_Performance`.

---

## 7. Roles y permisos

Se respeta el modelo del Framework MVP. Mapa de acciones:

| Rol | Ver propios | Ver equipo | Ver toda la org | Crear/editar objetivos | Cargar resultado (F2) | Validar (F2) | Admin |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Miembro del equipo | ✓ | — | — | — | ✓ (propios) | — | — |
| Líder / Jefe | ✓ | ✓ (su equipo) | — | ✓ (su equipo) | validar | ✓ (su equipo) | — |
| Trade Leader / Manager | ✓ | ✓ | — | ✓ (su equipo) | ✓ (por asesores/promotores) | ✓ | — |
| People Manager | ✓ | ✓ | ✓ | ✓ (cualquiera) | ✓ | ✓ | ✓ |
| CEO | — | ✓ | ✓ (lectura) | — | — | — | — |
| Administrativo | según permiso | según permiso | ✓ | según permiso | — | — | parcial |

- El "equipo" de un líder se resuelve por la **jerarquía existente** (jefe inmediato).
- Implementar como **middleware** de Express que recibe `rol` + `usuario_id` y valida contra el `colaborador_id`/`equipo` del recurso.

---

## 8. API (endpoints)

Base: `/api/performance`. Todos requieren sesión; el middleware de permisos valida rol y pertenencia.

### Fase 1

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/objetivos?colaborador_id&periodo` | Líder, People, dueño | Lista objetivos de un colaborador/periodo |
| POST | `/objetivos` | Líder (su equipo), People | Crea un objetivo (valida máx. 6) |
| PUT | `/objetivos/:id` | Líder (su equipo), People | Edita (solo si el periodo no está en medición) |
| DELETE | `/objetivos/:id` | Líder (su equipo), People | Elimina (solo en `definicion`) |
| GET | `/periodos/:periodo/resumen?colaborador_id` | Líder, People | Devuelve suma de pesos y conteo (para el banner del 100%) |
| POST | `/periodos/:periodo/activar` | People (o líder) | Valida **Σpeso=100** por persona y pasa a `en_medicion` (congela) |
| GET | `/mis-objetivos?periodo` | Miembro | Consulta en solo lectura de sus objetivos |

### Fase 2 (octubre)

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| POST | `/objetivos/:id/resultado` | Miembro / Trade Leader | Carga `resultado_ejecutado`; el backend calcula `porcentaje_cumplimiento` |
| POST | `/objetivos/:id/evidencia` | Miembro / Trade Leader | Adjunta evidencia (`link_soporte` u archivo) |
| POST | `/resultado/:id/validar` | Líder, People | Valida o rechaza el resultado |
| GET | `/dashboard?filtros` | Según rol | Datos para dashboards, semáforo y Top Performance |

**Validación de activación (regla 1), en pseudocódigo:**

```js
// POST /periodos/:periodo/activar
for (const colaborador of colaboradoresDelPeriodo) {
  const sumaPesos = sum(objetivos.filter(o => o.colaborador_id === colaborador.id).map(o => o.peso));
  if (sumaPesos !== 100) {
    return res.status(422).json({
      error: 'PESO_INCOMPLETO',
      colaborador_id: colaborador.id,
      suma: sumaPesos,
      mensaje: `Los objetivos de ${colaborador.nombre} suman ${sumaPesos}%, deben sumar 100%.`
    });
  }
}
// si todos cumplen: UPDATE objetivo SET estado='congelado'; UPDATE periodo SET estado='en_medicion'
```

---

## 9. Orden de construcción — Fase 1 (28 sep)

1. Migraciones del esquema `Supli_Performance` (tablas 4.1) en el arranque del server.
2. Convertir Supli Performance en **contenedor colapsable** en el panel izquierdo: al desplegarlo muestra los sub-módulos Objetivos y KPIs (nuevo) y Valoración (reubicada). Los **tabs superiores renderizan las vistas del sub-módulo activo** (reutilizando layout, sesión y roles del app actual).
3. Middleware de permisos por rol (sección 7).
4. Endpoints de objetivos + validación de pesos y máx. 6 (sección 8, Fase 1).
5. **Formulario de definición de objetivos** (mockup aprobado) con campos condicionales por `tipo_medicion` y banner del 100%.
6. Vista "Objetivos del equipo" (líder) y "Mis objetivos" (miembro, solo lectura).
7. Cargue real de los objetivos de **octubre** del 100% del equipo.
8. Motor de cálculo (sección 5) listo y probado unitariamente (aunque su uso pleno es Fase 2).
9. Piloto y validación con People antes del 28.

**Condición de salida Fase 1:** módulo estable, objetivos de octubre cargados, pesos validados a 100% por persona, sin errores críticos.

---

## 10. Convenciones de trabajo y entrega

- **Mockup-first:** el mockup se aprueba antes de implementar (ya entregado para el formulario de definición).
- **Ediciones quirúrgicas** sobre archivos de producción; no se regenera desde cero.
- Validación `node -c` antes de cada entrega.
- Entrega como **zip** que refleja la estructura del repo (`server/` + `public/`) para reemplazo directo en producción.
- Comunicación en español.

---

## 11. Insumos que faltan para arrancar

1. Confirmar nombres reales de las tablas/columnas de **usuario** y **jerarquía** del módulo de Valoración (para las FKs).
2. Respuestas de **People** (ver `Preguntas_People_Supli_Performance.docx`), en especial: sobrecumplimiento, semáforo (rangos), catálogo de objetivos por cargo, fecha de congelamiento y listado del equipo con cargo/área/dirección/jefe.
3. Listado de cargos que cargan resultado vía Trade Leader/Manager (asesores/promotores).
