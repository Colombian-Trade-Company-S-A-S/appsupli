import { useEffect } from 'react';
import { create } from 'zustand';

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';
export type Accent = 'neutral' | 'indigo' | 'blue' | 'emerald' | 'amber' | 'rose' | 'violet';
export type Radius = 'sharp' | 'default' | 'rounded';

export interface Appearance {
  theme: Theme;
  accent: Accent;
  radius: Radius;
}

/** Catálogo de acentos. `swatch` es el color de la muestra en el selector. */
export const ACCENTS: Array<{ value: Accent; label: string; swatch: string }> = [
  { value: 'neutral', label: 'Neutro', swatch: 'var(--foreground)' },
  { value: 'indigo', label: 'Índigo', swatch: 'oklch(0.55 0.21 285)' },
  { value: 'blue', label: 'Azul', swatch: 'oklch(0.55 0.18 250)' },
  { value: 'emerald', label: 'Verde', swatch: 'oklch(0.52 0.13 158)' },
  { value: 'amber', label: 'Ámbar', swatch: 'oklch(0.62 0.14 70)' },
  { value: 'rose', label: 'Rosa', swatch: 'oklch(0.56 0.2 15)' },
  { value: 'violet', label: 'Violeta', swatch: 'oklch(0.55 0.22 310)' },
];

export const RADII: Array<{ value: Radius; label: string; preview: string }> = [
  { value: 'sharp', label: 'Recto', preview: '0.25rem' },
  { value: 'default', label: 'Normal', preview: '0.625rem' },
  { value: 'rounded', label: 'Redondeado', preview: '1rem' },
];

const STORAGE_KEY = 'supli.appearance';
const POR_DEFECTO: Appearance = { theme: 'system', accent: 'neutral', radius: 'default' };

const media = () => window.matchMedia('(prefers-color-scheme: dark)');

const resolver = (theme: Theme): ResolvedTheme =>
  theme === 'system' ? (media().matches ? 'dark' : 'light') : theme;

/** Copia local: evita el parpadeo mientras llega la preferencia del backend. */
function leerCache(): Appearance {
  try {
    return { ...POR_DEFECTO, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') };
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
    get().set(preferencias);
  },
}));

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
 * Fuerza el tema claro mientras el componente esté montado.
 * Lo usan la landing y el login: fuera de la app nunca hay modo oscuro.
 */
export function useForceLightTheme() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark');
    return () => {
      root.classList.toggle('dark', useAppearanceStore.getState().resolvedTheme === 'dark');
    };
  }, []);
}
