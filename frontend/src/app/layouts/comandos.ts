/**
 * Atajos que cada app aporta a la paleta de comandos (Ctrl+K).
 *
 * Son datos, no componentes: la paleta no importa nada de `modules/`, así que
 * agregar los accesos de un módulo nuevo es agregar una entrada aquí.
 *
 * `permiso` filtra por los permisos efectivos que ya viene trayendo
 * `/auth/me`, sin pedirle nada más al backend. Sin `permiso`, el atajo lo ve
 * cualquiera que tenga la app asignada.
 */
export interface ComandoDeApp {
  label: string;
  to: string;
  /** Palabras extra por las que también se debe encontrar. */
  keywords?: string[];
  permiso?: string;
}

export const COMANDOS_POR_APP: Record<string, ComandoDeApp[]> = {
  valoracion: [
    {
      label: 'Mis evaluaciones',
      to: '/inicio/valoracion/mis-evaluaciones',
      keywords: ['responder', 'calificar', 'pendientes', 'evaluar'],
    },
    {
      label: 'Mis resultados',
      to: '/inicio/valoracion/mis-resultados',
      keywords: ['semáforo', 'consolidado', 'puntaje'],
    },
    {
      label: 'Resultados del equipo',
      to: '/inicio/valoracion/equipo',
      keywords: ['equipo', 'a cargo', 'subordinados'],
    },
    {
      label: 'Planes de acción',
      to: '/inicio/valoracion/planes',
      keywords: ['mejora', 'compromisos', 'brechas'],
    },
    {
      label: 'Dashboard de valoración',
      to: '/inicio/valoracion/dashboard',
      keywords: ['informes', 'métricas', 'organizacional'],
      permiso: 'valoracion:dashboard:view',
    },
    {
      label: 'Consolidado individual',
      to: '/inicio/valoracion/consolidado',
      keywords: ['exportar', 'csv', 'tabla'],
      permiso: 'valoracion:dashboard:view',
    },
    {
      label: 'Ciclos de evaluación',
      to: '/inicio/valoracion/ciclos',
      keywords: ['periodo', 'asignaciones', 'consolidar'],
      permiso: 'valoracion:cycles:manage',
    },
    {
      label: 'Banco de preguntas',
      to: '/inicio/valoracion/preguntas',
      keywords: ['ítems', 'enunciados'],
      permiso: 'valoracion:config:manage',
    },
    {
      label: 'Competencias',
      to: '/inicio/valoracion/competencias',
      keywords: ['categorías', 'cultura', 'liderazgo'],
      permiso: 'valoracion:config:manage',
    },
    {
      label: 'Jerarquía',
      to: '/inicio/valoracion/jerarquia',
      keywords: ['organigrama', 'jefe directo', 'cargos'],
      permiso: 'valoracion:hierarchy:manage',
    },
  ],
  'bi-trade': [
    {
      label: 'BI Claro punto de venta',
      to: '/inicio/bi-trade/claro',
      keywords: ['tablero', 'dashboard', 'claro', 'pdv'],
    },
    {
      label: 'Ventas',
      to: '/inicio/bi-trade/claro/ventas',
      keywords: ['registrar venta', 'unidades', 'facturación'],
      permiso: 'bi-trade:data:manage',
    },
    {
      label: 'Puntos de venta',
      to: '/inicio/bi-trade/claro/puntos-venta',
      keywords: ['pdv', 'regional', 'materiales'],
      permiso: 'bi-trade:data:manage',
    },
    {
      label: 'Productos',
      to: '/inicio/bi-trade/claro/productos',
      keywords: ['catálogo', 'sku', 'marca', 'precio'],
      permiso: 'bi-trade:data:manage',
    },
  ],
  admin: [
    {
      label: 'Usuarios',
      to: '/inicio/admin',
      keywords: ['personas', 'cuentas', 'accesos', 'crear usuario'],
    },
  ],
};
