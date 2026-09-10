# Supli · Frontend

Frontend de la plataforma (React 19 + TypeScript + Vite).

| Zona | Rutas | Sesión | Tema |
|---|---|---|---|
| Público | `/` | No | Siempre claro |
| Login | `/login` | Solo invitados | Siempre claro |
| Plataforma | `/inicio`, `/inicio/perfil` | Requerida | Claro / oscuro / sistema |
| Administración | `/inicio/admin` | Solo `kind=admin` | Claro / oscuro / sistema |
| Valoración | `/inicio/valoracion` | Con la app asignada | Claro / oscuro / sistema |
| BI Trade | `/inicio/bi-trade` | Con la app asignada | Claro / oscuro / sistema |

El tema se decide por zona: `PublicLayout` y `AuthLayout` llaman a
`useForceLightTheme()`; `AppLayout` llama a `useAppearanceEffect()`.

### Apariencia

Cada persona elige **tema** (claro/oscuro/sistema), **color de acento** (7
opciones) y **bordes** (recto/normal/redondeado) desde `/inicio/perfil`.

Se guarda en la cuenta (`PATCH /api/auth/preferences`), no en el navegador: al
entrar desde otro equipo la interfaz se ve igual. `localStorage` solo sirve de
caché para evitar el parpadeo mientras llega `/auth/me`.

Técnicamente son atributos en `<html>`: la clase `dark`, `data-accent` y
`data-radius`. Los acentos sobrescriben `--primary` y su familia en
`src/styles/index.css`; el resto de la paleta sigue siendo la neutra del preset,
así que un componente nuevo hereda el acento sin tocarlo.

La sesión usa **JWT** contra el backend. El sidebar del área privada se arma con
las `applications` que devuelve `/api/auth/me`, así que asignar una app a alguien
la hace aparecer en su menú sin tocar el frontend.

El módulo de Administración (`src/modules/admin/`) gestiona usuarios, áreas,
aplicaciones y roles con pestañas: tabla + diálogo por entidad, react-query para
el cacheo y `sonner` para el aviso de cada acción.

### Paleta de comandos (Ctrl/⌘ + K)

`AppLayout` monta una paleta que salta a cualquier pantalla sin navegar a mano.
Junta tres cosas: la navegación general, las apps que trae `/auth/me` y los
atajos que cada app declara en `src/app/layouts/comandos.ts`.

Esos atajos son **datos, no componentes**: la paleta no importa nada de
`modules/`, así que sumar los accesos de un módulo nuevo es agregar una entrada
a ese archivo. Cada atajo puede llevar un `permiso`, que se contrasta con los
permisos efectivos que ya vienen en la sesión — así la paleta nunca ofrece una
pantalla que le respondería `403` a esa persona.

El botón del topbar muestra el atajo para quien no lo conoce.

### Módulo de BI Trade Marketing

`src/modules/bi-trade/` — ventas por punto de venta.

| Ruta | Pantalla |
|---|---|
| `/inicio/bi-trade` | Portada con la tarjeta **BI Claro punto de venta** |
| `…/claro` | Tablero: KPIs, ingresos por mes, cortes y rankings |
| `…/claro/ventas`, `…/claro/productos`, `…/claro/puntos-venta` | CRUD de cada modelo |

Los tres botones para editar la información están en el encabezado del tablero.
Las piezas genéricas (`Kpi`, `Encabezado`, `EstadoTabla`, `BarraProporcion`)
viven en `src/shared/components/layout/` y los formatos de fecha y moneda en
`src/shared/lib/formato.ts`: las comparten los dos módulos en vez de
duplicarlas.

### Módulo de Valoración

`src/modules/valoracion/` — evaluación de desempeño 180°. Las secciones se
pintan según lo que devuelve `GET /api/valoracion/resumen`, así que cada persona
ve solo su parte: un colaborador entra a *Mis evaluaciones* y *Mis resultados*,
un líder suma *Resultados del equipo*, y People/BI ven configuración e informes.

| Ruta | Pantalla |
|---|---|
| `/inicio/valoracion` | Home: pendientes, avance y publicación |
| `…/mis-evaluaciones`, `…/mis-evaluaciones/:id` | Lo asignado y el formulario |
| `…/mis-resultados`, `…/resultados/:id` | Consolidado propio y detalle por ítem |
| `…/equipo` | Resultados del equipo (o de la compañía) |
| `…/dashboard`, `…/dashboard/persona/:id` | Informes y ficha individual |
| `…/consolidado` | Tabla completa + exportes CSV |
| `…/planes` | Planes de acción |
| `…/ciclos`, `…/ciclos/:id` | Ciclos y asignaciones |
| `…/preguntas`, `…/competencias`, `…/jerarquia` | Configuración |

`RequireApp` corta el acceso por URL directa con el mismo criterio con el que se
arma el sidebar: si la app no viene en `/auth/me`, no se entra.

El **semáforo** usa cinco tokens propios (`--level-*` en `src/styles/index.css`).
Son una rampa divergente y sus valores salen de validar la paleta, no de
elegirlos a ojo: separan bien dos niveles contiguos incluso con daltonismo. Como
dos de los cinco no llegan a 3:1 contra el fondo claro, **el color va siempre en
la marca (el punto o la barra) y la etiqueta en tinta normal**, nunca al revés.

## Stack

| Capa | Herramienta |
|---|---|
| Build | Vite 6 |
| UI | React 19 + TypeScript (strict) |
| Design system | shadcn/ui (preset `nova` neutro, primitivas Base UI) |
| Estilos | Tailwind CSS v4 |
| Rutas | React Router v7 |
| Estado servidor | TanStack Query v5 |
| Estado cliente | Zustand |
| Formularios | React Hook Form + Zod |
| HTTP | Axios (interceptores centralizados) |
| Gráficos | Recharts |

## Arranque

```bash
npm install
cp .env.example .env     # ya viene creado
npm run dev              # http://localhost:5173
```

`VITE_USE_MOCK_API=true` (por defecto) usa datos y login simulados mientras el
backend no exista. Usuarios de prueba (aparecen en la pantalla de login):

| Correo | Contraseña | Ve |
|---|---|---|
| `admin@supli.com` | `admin123` | Todo |
| `bi@supli.com` | `bi123` | BI + pedidos (solo lectura) |
| `ventas@supli.com` | `ventas123` | Ventas completo, BI, inventario |
| `bodega@supli.com` | `bodega123` | Solo Inventario |

Cuando el backend esté listo: `VITE_USE_MOCK_API=false` y
`VITE_API_PROXY_TARGET=http://localhost:8000`.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Typecheck + build de producción |
| `npm run preview` | Sirve el build |
| `npm run lint` | ESLint (0 warnings permitidos) |
| `npm run typecheck` | Solo TypeScript |
| `npm run format` | Prettier |

## Design system

Los componentes de `src/shared/components/ui/` son de **shadcn/ui**: código fuente
en el repo, no una dependencia. Se agregan y actualizan con el CLI:

```bash
npx shadcn@latest add dialog            # agregar un componente nuevo
npx shadcn@latest add button --diff     # ver qué cambió upstream antes de actualizar
```

`components.json` apunta los alias a nuestra estructura (`@/shared/components/ui`,
`@/shared/lib/utils`), así que el CLI escribe en el lugar correcto.

Reglas al construir pantallas:

- **Colores semánticos**, nunca valores crudos: `bg-primary`, `text-muted-foreground`,
  `border-border`. Nada de `bg-indigo-600` ni de overrides `dark:` manuales.
- La paleta es la **neutra de ui.shadcn.com** (blanco/negro). Los únicos ajustes
  están al final de `src/styles/index.css`, fuera de los bloques del preset para
  que un `shadcn apply` no los pise:
  - `--chart-1..5`: el preset usa la misma rampa de grises en claro y oscuro, así
    que una serie siempre quedaba invisible; aquí se invierte por tema.
  - `--success` / `--warning`: estados de negocio que el preset no trae
    (`destructive` ya viene). Los usan las variantes del `Badge`.
- Para recolorear toda la app, cambia el preset en vez de tocar componentes:
  `npx shadcn@latest apply <código> --only theme` (los códigos salen de
  ui.shadcn.com).
- **Componer antes que inventar**: `Card` + `Field` + `Empty` + `Table` ya resuelven
  casi todo. `DataTable` (nuestro) compone `Table` con estados de carga y vacío.
- Iconos dentro de botones con `data-icon="inline-start"`, sin clases de tamaño.
- Espaciado con `gap-*` en flex/grid, nunca `space-y-*`.

### Tema claro / oscuro

`ModeToggle` (en el topbar y en el login) ofrece **Claro / Oscuro / Sistema**, igual
que ui.shadcn.com. El estado vive en `useThemeStore`:

- `theme` es lo que eligió la persona y se guarda en `localStorage`.
- `resolvedTheme` es lo que se está pintando; con `system` sigue a
  `prefers-color-scheme` y reacciona si cambia el sistema operativo.
- `useThemeEffect()` (montado una sola vez en `ThemeProvider`) aplica la clase
  `dark` en `<html>`.

Al construir pantallas no hace falta pensar en el tema: usando tokens semánticos
ambos modos salen correctos solos.

## Convenciones

- Alias `@/` → `src/`.
- Páginas siempre con `export default` (necesario para `lazy`).
- Componentes de shadcn en minúscula (`button.tsx`), los propios en PascalCase
  (`DataTable.tsx`): así se distingue de un vistazo qué actualiza el CLI.
- Query keys jerárquicas por módulo (`salesKeys.orders()`).
- Todo el estado de servidor va en TanStack Query, no en Zustand.
- Errores de red normalizados a `ApiError` en el interceptor.
