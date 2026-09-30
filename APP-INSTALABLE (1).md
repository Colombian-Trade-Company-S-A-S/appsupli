# Cómo funciona "Instalar app" (PWA)

Cuando tocas **Instalar app**, la página web se abre en su propia ventana, con
tu logo, en el escritorio o en la pantalla de inicio del celular, como si fuera
un programa. Eso se llama **PWA** (*Progressive Web App*, aplicación web
progresiva).

**No se usó ninguna librería.** Es algo que ya traen los navegadores (Chrome,
Edge, Safari, Android). Se activa con tres piezas estándar de la web: un
**manifiesto**, un **service worker** y unas **etiquetas en el `index.html`**.
React y TypeScript solo se usan para el botón "Instalar app".

---

## 1. Las tres piezas que pide el navegador

Para ofrecer "Instalar", el navegador revisa que la página tenga esto:

| Pieza | Qué es | Archivo en el proyecto |
|---|---|---|
| **Manifiesto** | Un JSON con el nombre, el logo, los colores y la ruta con la que abre la app | `frontend/public/manifest.webmanifest` |
| **Service worker** | Un archivo JavaScript que el navegador instala aparte de la página | `frontend/public/sw.js` |
| **HTTPS** | La página tiene que servirse por `https://` (o ser `localhost`) | Render ya da https |

Si falta alguna, el navegador no muestra la opción de instalar.

### 1.1 El manifiesto — `frontend/public/manifest.webmanifest`

```json
{
  "name": "unu Chat — consejos sobre tus conversaciones",
  "short_name": "unu Chat",
  "start_url": "/chatbot",
  "scope": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#0a0a0a",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

Qué hace cada campo:

- **`name` / `short_name`**: el nombre largo (en el instalador) y el corto
  (debajo del icono en el celular).
- **`start_url`**: dónde abre la app instalada. Aquí es `/chatbot`, así que
  abre directo en el chat y no en la hoja de vida.
- **`scope`**: qué rutas se consideran "dentro de la app". Con `/`, todo el
  sitio.
- **`display: "standalone"`**: **es lo que la vuelve de escritorio.** Abre en
  una ventana propia, sin barra de direcciones ni pestañas.
- **`theme_color`**: el color de la barra de título de la ventana (y de la
  barra del celular).
- **`background_color`**: el fondo de la pantalla de carga mientras abre.
- **`icons`**: los logos. El navegador exige al menos uno de **192 px** y uno
  de **512 px**. El `maskable` tiene margen alrededor, porque Android recorta
  el icono en círculo o en gota y sin margen se cortaría el logo.

### 1.2 El service worker — `frontend/public/sw.js`

```js
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (evento) => evento.waitUntil(self.clients.claim()))
self.addEventListener("fetch", () => {
  // Sin respondWith: el navegador hace la petición como siempre.
})
```

Un service worker es un script que corre **aparte de la página**, en segundo
plano. Sirve para cosas como funcionar sin internet o recibir notificaciones.
Aquí es **mínimo a propósito**:

- **No guarda nada en caché.** Así, cada vez que subes cambios a Render, la
  gente ve la versión nueva de inmediato. Una PWA que cachea todo es la causa
  número uno de "subí cambios y no se ven".
- Existe solo porque algunos navegadores lo piden para ofrecer "Instalar".

Se registra al arrancar la app, en `frontend/src/main.tsx`:

```ts
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined)
  })
}
```

### 1.3 Las etiquetas del `index.html` — `frontend/index.html`

```html
<link rel="manifest" href="/manifest.webmanifest" />
<meta name="theme-color" content="#0a0a0a" />
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="unu Chat" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
```

- `<link rel="manifest">` es lo que le dice al navegador **dónde está el
  manifiesto**. Sin esta línea, el manifiesto no existe para él.
- Las `apple-*` son para **iPhone**: Safari no lee bien el manifiesto y usa
  estas etiquetas para el icono y el nombre.

### 1.4 Los iconos — `frontend/public/icons/`

Salen de tu imagen original (`public/img/Imagen de ChatGPT…png`):

| Archivo | Tamaño | Para qué |
|---|---|---|
| `icon-192.png` | 192×192 | Icono normal (Android, escritorio) |
| `icon-512.png` | 512×512 | Pantalla de carga e instalador |
| `maskable-512.png` | 512×512, logo al 78 % | Android, que recorta el icono |
| `apple-touch-icon.png` | 180×180 | iPhone |

Todo lo que está en `frontend/public/` Vite lo copia tal cual a la raíz del
sitio. Por eso `public/sw.js` queda en `https://tu-sitio/sw.js`.

---

## 2. El botón "Instalar app" (aquí sí entra React + TypeScript)

Los navegadores ya traen su propia opción de instalar (el iconito ⊕ en la barra
de direcciones de Chrome o Edge), pero casi nadie la ve. Por eso hay un botón
propio en la barra lateral del chat.

### 2.1 Cómo se captura el aviso — `frontend/src/lib/instalar.ts`

Chrome, Edge y Android mandan **una sola vez**, al cargar la página, un evento
llamado `beforeinstallprompt` que significa "esta página se puede instalar".
El truco es:

1. **Escucharlo apenas arranca la app** (desde `main.tsx`). Si se escucha
   tarde, el evento ya pasó y se pierde.
2. **Guardarlo** en una variable y cancelar la barrita que el navegador
   mostraría por su cuenta (`evento.preventDefault()`).
3. Cuando la persona toca el botón, **llamar a `evento.prompt()`**, que abre
   el diálogo oficial de instalación.

```ts
let aviso: AvisoInstalacion | null = null

export function escucharInstalacion() {
  window.addEventListener("beforeinstallprompt", (evento) => {
    evento.preventDefault()          // sin la barrita del navegador
    aviso = evento as AvisoInstalacion
    avisar()                         // el botón se entera y aparece
  })
  window.addEventListener("appinstalled", () => {
    aviso = null                     // ya se instaló: el botón desaparece
    instalada = true
    avisar()
  })
}

export async function instalar() {
  if (!aviso) return
  await aviso.prompt()               // diálogo oficial "¿Instalar unu Chat?"
  await aviso.userChoice             // aceptó o canceló
  aviso = null                       // el aviso sirve una sola vez
  avisar()
}
```

**TypeScript:** `beforeinstallprompt` todavía no viene en los tipos estándar de
TypeScript. Por eso se declara a mano:

```ts
type AvisoInstalacion = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}
```

**React:** el hook `useInstalacion()` usa `React.useSyncExternalStore`, que es la
forma oficial de React para leer un estado que vive **fuera** de React (aquí,
la variable `aviso`). Cuando el evento llega, el hook se actualiza y el botón
aparece o desaparece solo. Devuelve tres datos:

- `instalada`: ya está abierta como app, así que no hay nada que instalar.
- `puede`: el navegador dejó instalar de un toque (Chrome, Edge, Android).
- `manual`: es un iPhone, donde hay que instalar a mano.

La app sabe si ya está abierta como app con
`window.matchMedia("(display-mode: standalone)")`: es `true` cuando corre en su
propia ventana.

### 2.2 El botón — `frontend/src/components/chatbot/boton-instalar.tsx`

```tsx
const { instalada, puede, manual } = useInstalacion()
if (instalada || (!puede && !manual)) return null   // no hay nada que mostrar

<SidebarMenuButton onClick={() => (puede ? void instalar() : setPasos(true))}>
  Instalar app
</SidebarMenuButton>
```

- En **Chrome, Edge o Android** abre el diálogo oficial.
- En **iPhone** abre una ventanita con los pasos (Compartir → "Agregar a
  inicio"), porque Safari no tiene `beforeinstallprompt` y no deja instalar
  desde un botón.
- Si ya la instalaste, o el navegador no soporta instalar (Firefox de
  escritorio), el botón no aparece.

Está en la barra lateral del chat (`chat-sidebar.tsx`) y en la de ajustes y
análisis (`sidebar-consejero.tsx`).

---

## 3. ¿Funciona en producción con Render? Sí

Tu frontend en Render es un **sitio estático**
(`frontend/render.yaml`, `runtime: static`) y cumple todo:

- **HTTPS:** Render da https automático en `*.onrender.com` y en dominios
  propios. Sin https no hay PWA; con localhost funciona porque los navegadores
  lo tratan como seguro.
- **Los archivos se sirven tal cual:** `npm run build` copia `public/` a
  `dist/`, así que en Render quedan `/manifest.webmanifest`, `/sw.js` y
  `/icons/*`.
- **La regla de "SPA fallback"** (`/*` → `/index.html`) no les afecta. Render
  primero entrega el archivo si existe y solo reescribe las rutas que no
  existen, como `/chatbot/ajustes`.

Para probarlo en producción, después del deploy:

1. Abre `https://tu-frontend.onrender.com/chatbot` en Chrome o Edge.
2. Debe aparecer **"Instalar app"** en la barra lateral y el iconito ⊕ en la
   barra de direcciones.
3. Instálala: abre en su propia ventana, en `/chatbot`.

---

## 4. Cómo revisar que está bien (DevTools)

En Chrome o Edge: **F12 → pestaña Application (Aplicación)**.

- **Manifest:** muestra el nombre, los iconos y los errores, si hay alguno. Si
  dice "Installability: … " en rojo, ahí explica qué falta.
- **Service workers:** debe aparecer `sw.js` como *activated and is running*.
  - Si cambias `sw.js` y no se actualiza, marca **Update on reload** o dale
    **Unregister**.

---

## 5. Preguntas típicas

**¿La app instalada es otra app aparte? ¿Hay que actualizarla?**
No. Es la misma página web en una ventana propia. Cuando subes cambios a
Render, la app instalada los ve la próxima vez que abre, igual que el
navegador. No hay tienda ni actualizaciones manuales.

**¿Funciona sin internet?**
No, a propósito: el chat necesita el servidor para responder. Para que abriera
sin internet habría que cachear archivos en el service worker. Se puede hacer,
pero trae el problema de las versiones viejas.

**¿Cómo cambio el logo o el nombre?**
- Nombre: `name` y `short_name` en `manifest.webmanifest`, y
  `apple-mobile-web-app-title` en `index.html`.
- Logo: reemplaza los PNG de `public/icons/` manteniendo los tamaños.
- La app ya instalada puede tardar en tomar el logo nuevo (Chrome lo revisa
  cada tanto). Para verlo ya, desinstala y vuelve a instalar.

**¿Cómo se desinstala?**
- En el escritorio: en la ventana de la app, menú **⋮ → Desinstalar**.
- En Android: mantén presionado el icono y desinstálalo.
- En iPhone: mantén presionado y **Eliminar app**.

**¿Existe una librería que haga todo esto?**
Sí: **`vite-plugin-pwa`** genera el manifiesto y un service worker con caché
(usa Workbox, de Google). Conviene si quieres que la app **funcione sin
internet**. Aquí no se usó porque:
1. Sin caché no hace falta.
2. Su service worker cachea por defecto, y eso complica ver los cambios de cada
   deploy.
3. Hecho a mano son cuatro archivos pequeños que se entienden completos.

Si algún día quieres modo sin internet, se instala con
`npm i -D vite-plugin-pwa`, se agrega en `vite.config.ts` y se borran
`sw.js` y `manifest.webmanifest`, porque el plugin los genera.

**¿Qué navegadores lo soportan?**

| Navegador | Instalar | Cómo |
|---|---|---|
| Chrome y Edge (Windows, Mac, Linux) | Sí | Botón "Instalar app" o ⊕ en la barra |
| Chrome en Android | Sí | Botón "Instalar app" |
| Safari en iPhone o iPad | Sí, a mano | Compartir → Agregar a inicio |
| Safari en Mac (Sonoma o más nuevo) | Sí, a mano | Archivo → Agregar al Dock |
| Firefox de escritorio | No | El botón no aparece |

---

## 6. Resumen de archivos

```
frontend/
├── index.html                          ← <link rel="manifest"> y etiquetas de iPhone
├── public/
│   ├── manifest.webmanifest            ← nombre, logo, colores, start_url, standalone
│   ├── sw.js                           ← service worker mínimo (sin caché)
│   └── icons/                          ← 192, 512, maskable y apple-touch-icon
└── src/
    ├── main.tsx                        ← registra sw.js y escucha el aviso de instalar
    ├── lib/instalar.ts                 ← guarda el aviso y lo lanza (hook useInstalacion)
    └── components/chatbot/
        └── boton-instalar.tsx          ← botón "Instalar app" y pasos para iPhone
```
