import { lazy, type LazyExoticComponent, type ReactElement } from 'react';

/**
 * Tarjetas que cada módulo aporta al home de la plataforma.
 *
 * El home no importa nada de `modules/` directamente: pide aquí el widget que
 * corresponde al código de cada app a la que la persona tiene acceso. Así un
 * módulo nuevo se asoma en el home agregando una línea, y el shell no queda
 * acoplado a los módulos de negocio.
 */
export const WIDGETS_POR_APP: Record<string, LazyExoticComponent<() => ReactElement | null>> = {
  valoracion: lazy(() => import('@/modules/valoracion/components/HomeWidget')),
};
