import { useSyncExternalStore } from 'react';

/** `beforeinstallprompt` aún no viene en los tipos estándar de TypeScript. */
type AvisoInstalacion = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export interface EstadoInstalacion {
  /** Ya corre como app, en su propia ventana. */
  instalada: boolean;
  /** El navegador deja instalar de un toque (Chrome, Edge, Android). */
  puede: boolean;
  /** iPhone o iPad: Safari solo deja instalar a mano. */
  manual: boolean;
}

let aviso: AvisoInstalacion | null = null;
let instalada = false;
const suscriptores = new Set<() => void>();

const esStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

// iPadOS se presenta como Mac; se distingue porque tiene pantalla táctil.
const esIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

let estado: EstadoInstalacion = { instalada: false, puede: false, manual: false };

function avisar() {
  const yaInstalada = instalada || esStandalone();
  estado = {
    instalada: yaInstalada,
    puede: !yaInstalada && aviso !== null,
    manual: !yaInstalada && aviso === null && esIOS(),
  };
  suscriptores.forEach((fn) => fn());
}

/**
 * Registra el service worker y escucha el aviso de instalar. Va en `main.tsx`,
 * antes de pintar: el navegador manda el aviso una sola vez al cargar.
 */
export function prepararInstalacion() {
  window.addEventListener('beforeinstallprompt', (evento) => {
    evento.preventDefault();
    aviso = evento as AvisoInstalacion;
    avisar();
  });
  window.addEventListener('appinstalled', () => {
    aviso = null;
    instalada = true;
    avisar();
  });
  window.matchMedia('(display-mode: standalone)').addEventListener('change', avisar);
  avisar();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    });
  }
}

/**
 * Abre el diálogo oficial del navegador y dice qué respondió la persona.
 * El aviso sirve una sola vez: después hay que esperar a que el navegador
 * mande otro.
 */
export async function instalar(): Promise<'accepted' | 'dismissed' | null> {
  if (!aviso) return null;
  await aviso.prompt();
  const { outcome } = await aviso.userChoice;
  aviso = null;
  avisar();
  return outcome;
}

export function useInstalacion(): EstadoInstalacion {
  return useSyncExternalStore(
    (fn) => {
      suscriptores.add(fn);
      return () => suscriptores.delete(fn);
    },
    () => estado,
  );
}
