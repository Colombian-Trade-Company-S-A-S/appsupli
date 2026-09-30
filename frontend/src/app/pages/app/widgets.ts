import { lazy, type LazyExoticComponent, type ReactElement } from 'react';

type Pieza = LazyExoticComponent<() => ReactElement | null>;

/**
 * Tarjetas que cada módulo aporta al home de la plataforma.
 *
 * El home no importa nada de `modules/` directamente: pide aquí el widget que
 * corresponde al código de cada app a la que la persona tiene acceso. Así un
 * módulo nuevo se asoma en el home agregando una línea, y el shell no queda
 * acoplado a los módulos de negocio.
 */
export const WIDGETS_POR_APP: Record<string, Pieza> = {
  valoracion: lazy(() => import('@/modules/valoracion/components/HomeWidget')),
};

/** Igual que los widgets, pero para la franja de indicadores de arriba. */
export const KPIS_POR_APP: Record<string, Pieza> = {
  'objetivos-kpis': lazy(() => import('@/modules/performance/components/HomeKpis')),
  'supli-challenge': lazy(() => import('@/modules/challenge/components/HomeKpis')),
};
