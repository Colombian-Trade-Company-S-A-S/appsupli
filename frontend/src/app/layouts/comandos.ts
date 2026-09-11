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
      label: 'Informe de Ventas HC',
      to: '/inicio/bi-trade/ventas-hc',
      keywords: ['hc', 'ventas hc', 'informe', 'homecenter'],
    },
    {
      label: 'Cumplimiento diario HC',
      to: '/inicio/bi-trade/ventas-hc/dia',
      keywords: ['hc', 'homecenter', 'día', 'diario', 'cuota'],
    },
    {
      label: 'Ventas HC',
      to: '/inicio/bi-trade/ventas-hc/ventas',
      keywords: ['hc', 'homecenter', 'registrar venta'],
      permiso: 'bi-trade:data:manage',
    },
    {
      label: 'Puntos de venta HC',
      to: '/inicio/bi-trade/ventas-hc/puntos-venta',
      keywords: ['hc', 'homecenter', 'tiendas', 'regional'],
      permiso: 'bi-trade:data:manage',
    },
    {
      label: 'Productos HC',
      to: '/inicio/bi-trade/ventas-hc/productos',
      keywords: ['hc', 'homecenter', 'catálogo', 'precio'],
      permiso: 'bi-trade:data:manage',
    },
    {
      label: 'Inventario HC',
      to: '/inicio/bi-trade/ventas-hc/inventario',
      keywords: ['hc', 'homecenter', 'stock', 'existencias'],
      permiso: 'bi-trade:data:manage',
    },
    {
      label: 'Metas HC',
      to: '/inicio/bi-trade/ventas-hc/metas',
      keywords: ['hc', 'homecenter', 'objetivo', 'cumplimiento'],
      permiso: 'bi-trade:data:manage',
    },
    {
      label: 'Informe de Ventas Falabella',
      to: '/inicio/bi-trade/ventas-falabella',
      keywords: ['falabella', 'ventas falabella', 'informe'],
    },
    {
      label: 'Cumplimiento diario Falabella',
      to: '/inicio/bi-trade/ventas-falabella/dia',
      keywords: ['falabella', 'día', 'diario', 'cuota'],
    },
    {
      label: 'Ventas Falabella',
      to: '/inicio/bi-trade/ventas-falabella/ventas',
      keywords: ['falabella', 'registrar venta'],
      permiso: 'bi-trade:data:manage',
    },
    {
      label: 'Puntos de venta Falabella',
      to: '/inicio/bi-trade/ventas-falabella/puntos-venta',
      keywords: ['falabella', 'tiendas', 'regional'],
      permiso: 'bi-trade:data:manage',
    },
    {
      label: 'Productos Falabella',
      to: '/inicio/bi-trade/ventas-falabella/productos',
      keywords: ['falabella', 'catálogo', 'precio'],
      permiso: 'bi-trade:data:manage',
    },
    {
      label: 'Inventario Falabella',
      to: '/inicio/bi-trade/ventas-falabella/inventario',
      keywords: ['falabella', 'stock', 'existencias'],
      permiso: 'bi-trade:data:manage',
    },
    {
      label: 'Metas Falabella',
      to: '/inicio/bi-trade/ventas-falabella/metas',
      keywords: ['falabella', 'objetivo', 'cumplimiento'],
      permiso: 'bi-trade:data:manage',
    },
    {
      label: 'Informe Tmk Ecommerce Claro',
      to: '/inicio/bi-trade/ventas-tmk',
      keywords: ['tmk', 'ecommerce', 'telemercadeo', 'claro', 'informe'],
    },
    {
      label: 'Cumplimiento diario Tmk',
      to: '/inicio/bi-trade/ventas-tmk/dia',
      keywords: ['tmk', 'día', 'diario', 'cuota'],
    },
    {
      label: 'Ventas Tmk',
      to: '/inicio/bi-trade/ventas-tmk/ventas',
      keywords: ['tmk', 'registrar venta'],
      permiso: 'bi-trade:data:manage',
    },
    {
      label: 'Puntos de venta Tmk',
      to: '/inicio/bi-trade/ventas-tmk/puntos-venta',
      keywords: ['tmk', 'tiendas', 'regional'],
      permiso: 'bi-trade:data:manage',
    },
    {
      label: 'Productos Tmk',
      to: '/inicio/bi-trade/ventas-tmk/productos',
      keywords: ['tmk', 'catálogo', 'precio'],
      permiso: 'bi-trade:data:manage',
    },
    {
      label: 'Inventario Tmk',
      to: '/inicio/bi-trade/ventas-tmk/inventario',
      keywords: ['tmk', 'stock', 'existencias'],
      permiso: 'bi-trade:data:manage',
    },
    {
      label: 'Metas Tmk',
      to: '/inicio/bi-trade/ventas-tmk/metas',
      keywords: ['tmk', 'objetivo', 'cumplimiento'],
      permiso: 'bi-trade:data:manage',
    },
    {
      label: 'Plan Recomiéndame Belkin',
      to: '/inicio/bi-trade/plan-recomiendame-belkin',
      keywords: ['belkin', 'recomiendame', 'referidos', 'plan'],
    },
    {
      label: 'Plan Partners',
      to: '/inicio/bi-trade/plan-partners',
      keywords: ['partners', 'aliados', 'plan'],
    },
    {
      label: 'Cumplimiento diario',
      to: '/inicio/bi-trade/claro/dia',
      keywords: ['día', 'diario', 'cuota', 'cumplimiento del día', 'ayer'],
    },
    {
      label: 'Concurso de tickets',
      to: '/inicio/bi-trade/claro/tickets',
      keywords: ['tickets', 'concurso', 'sorteo', 'campaña', 'escalas', 'acelerador'],
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
    {
      label: 'Inventario',
      to: '/inicio/bi-trade/claro/inventario',
      keywords: ['stock', 'existencias', 'agotado'],
      permiso: 'bi-trade:data:manage',
    },
    {
      label: 'Metas',
      to: '/inicio/bi-trade/claro/metas',
      keywords: ['objetivo', 'cumplimiento', 'presupuesto'],
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
