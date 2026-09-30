import { useEffect } from 'react';
import { create } from 'zustand';

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';
export type Accent = 'violet' | 'indigo' | 'blue';
export type Radius = 'sharp' | 'default' | 'rounded';

export interface Appearance {
  theme: Theme;
  accent: Accent;
  radius: Radius;
}

/**
 * Catálogo de acentos: solo los colores de marca del brandbook.
 * `swatch` es la muestra y `check` el color del chulito encima.
 */
export const ACCENTS: Array<{ value: Accent; label: string; swatch: string; check: string }> = [
  { value: 'violet', label: 'Morado', swatch: '#a66bff', check: '#0f0b33' },
  { value: 'indigo', label: 'Morado oscuro', swatch: '#5932d7', check: '#ffffff' },
  { value: 'blue', label: 'Azul', swatch: '#3b6dff', check: '#ffffff' },
];

export const RADII: Array<{ value: Radius; label: string; preview: string }> = [
  { value: 'sharp', label: 'Recto', preview: '0.25rem' },
  { value: 'default', label: 'Normal', preview: '0.625rem' },
  { value: 'rounded', label: 'Redondeado', preview: '1rem' },
];

const STORAGE_KEY = 'supli.appearance';
const POR_DEFECTO: Appearance = { theme: 'dark', accent: 'violet', radius: 'sharp' };
const ACENTOS_VALIDOS = new Set<string>(ACCENTS.map((a) => a.value));

const media = () => window.matchMedia('(prefers-color-scheme: dark)');

const resolver = (theme: Theme): ResolvedTheme =>
  theme === 'system' ? (media().matches ? 'dark' : 'light') : theme;

/** Copia local: evita el parpadeo mientras llega la preferencia del backend. */
function leerCache(): Appearance {
  try {
    const cache = { ...POR_DEFECTO, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') };
    // Acentos de antes del brandbook (verde, ámbar…) ya no existen.
    if (!ACENTOS_VALIDOS.has(cache.accent)) cache.accent = POR_DEFECTO.accent;
    return cache;
  } catch {
    return POR_DEFECTO;
  }
}

interface AppearanceState extends Appearance {
  resolvedTheme: ResolvedTheme;
  /** Aplica en local. La persistencia en la cuenta la hace quien lo llama. */
  set: (cambios: Partial<Appearance>) => void;
  /** Carga lo que venga de la cuenta al iniciar sesión. */
  hydrate: (preferencias: Partial<Appearance>) => void;
}

export const useAppearanceStore = create<AppearanceState>((set, get) => ({
  ...leerCache(),
  resolvedTheme: resolver(leerCache().theme),

  set(cambios) {
    const siguiente = {
      theme: cambios.theme ?? get().theme,
      accent: cambios.accent ?? get().accent,
      radius: cambios.radius ?? get().radius,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(siguiente));
    set({ ...siguiente, resolvedTheme: resolver(siguiente.theme) });
  },

  hydrate(preferencias) {
    const { accent, ...resto } = preferencias;
    get().set(accent && ACENTOS_VALIDOS.has(accent) ? preferencias : resto);
  },
}));

/** Pinta la apariencia guardada antes del primer render: sin destello blanco. */
export function aplicarAparienciaInicial() {
  const { resolvedTheme, accent, radius } = useAppearanceStore.getState();
  const root = document.documentElement;
  root.classList.toggle('dark', resolvedTheme === 'dark');
  root.dataset.accent = accent;
  root.dataset.radius = radius;
}

/** Escribe la apariencia en <html>. La monta el layout privado. */
export function useAppearanceEffect() {
  const { theme, accent, radius, resolvedTheme } = useAppearanceStore();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolvedTheme === 'dark');
    root.dataset.accent = accent;
    root.dataset.radius = radius;
  }, [resolvedTheme, accent, radius]);

  useEffect(() => {
    if (theme !== 'system') return;
    const mq = media();
    const sincronizar = () =>
      useAppearanceStore.setState({ resolvedTheme: mq.matches ? 'dark' : 'light' });
    mq.addEventListener('change', sincronizar);
    return () => mq.removeEventListener('change', sincronizar);
  }, [theme]);
}

/**
 * Fuerza un tema mientras el componente esté montado, sin tocar la
 * preferencia de la persona. La portada y el login van en oscuro (la base
 * del brandbook); los formularios públicos de Partners, en claro.
 */
export function useForceTheme(tema: ResolvedTheme) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', tema === 'dark');
    return () => {
      root.classList.toggle('dark', useAppearanceStore.getState().resolvedTheme === 'dark');
    };
  }, [tema]);
}
