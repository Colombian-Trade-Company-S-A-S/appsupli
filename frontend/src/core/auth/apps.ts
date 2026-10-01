import type { Application, User } from './types';

/**
 * `/auth/me` trae las apps como árbol: en la raíz los contenedores y, dentro
 * de `children`, los sub-módulos (Objetivos y KPIs y Valoración cuelgan de
 * Supli Performance). Para preguntar «¿tiene esta app?» o recorrer todas por
 * código hay que mirar el árbol entero, no solo la raíz.
 */
export function aplanarApps(apps: Application[]): Application[] {
  return apps.flatMap((app) => [app, ...aplanarApps(app.children ?? [])]);
}

/** Si la persona entra a la app, sea contenedor o sub-módulo. */
export function tieneApp(user: User | null | undefined, code: string): boolean {
  if (!user) return false;
  return user.isAdmin || aplanarApps(user.applications).some((app) => app.code === code);
}
