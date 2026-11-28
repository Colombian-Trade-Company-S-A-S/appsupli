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
  permiso?: Requisito;
}

/**
 * Un código, o una lista de los que se piden todos. Dentro de la lista, un
 * grupo `[a, b]` se cumple con cualquiera de los dos.
 */
export type Requisito = string | Array<string | string[]>;

/** Si los permisos (`tiene`) alcanzan para el requisito. Sin requisito, sí. */
export function cumpleRequisito(
  requisito: Requisito | undefined,
  tiene: (codigo: string) => boolean,
): boolean {
  if (!requisito) return true;
  const todos = typeof requisito === 'string' ? [requisito] : requisito;
  return todos.every((parte) => (typeof parte === 'string' ? tiene(parte) : parte.some(tiene)));
}

// BI Trade: cada atajo pide su informe; los de las tablas, además, editar ese
// módulo en ese informe. El «Administrador de BI Trade» los tiene todos.
const ADMIN_BI = 'bi-trade:data:manage';
const informe = (nombre: string): Requisito => [[`bi-trade:informe:${nombre}`, ADMIN_BI]];
const editarEn = (nombre: string, modulo: string): Requisito => [
  [`bi-trade:informe:${nombre}`, ADMIN_BI],
  [`bi-trade:${nombre}:${modulo}:editar`, ADMIN_BI],
];

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
      label: 'Dashboard de Supli performance',
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
      permiso: informe('claro'),
    },
    {
      label: 'Informe de Ventas HC',
      to: '/inicio/bi-trade/ventas-hc',
      keywords: ['hc', 'ventas hc', 'informe', 'homecenter'],
      permiso: informe('hc'),
    },
    {
      label: 'Cumplimiento diario HC',
      to: '/inicio/bi-trade/ventas-hc/dia',
      keywords: ['hc', 'homecenter', 'día', 'diario', 'cuota'],
      permiso: informe('hc'),
    },
    {
      label: 'Ventas HC',
      to: '/inicio/bi-trade/ventas-hc/ventas',
      keywords: ['hc', 'homecenter', 'registrar venta'],
      permiso: editarEn('hc', 'ventas'),
    },
    {
      label: 'Puntos de venta HC',
      to: '/inicio/bi-trade/ventas-hc/puntos-venta',
      keywords: ['hc', 'homecenter', 'tiendas', 'regional'],
      permiso: editarEn('hc', 'puntos-venta'),
    },
    {
      label: 'Productos HC',
      to: '/inicio/bi-trade/ventas-hc/productos',
      keywords: ['hc', 'homecenter', 'catálogo', 'precio'],
      permiso: editarEn('hc', 'productos'),
    },
    {
      label: 'Inventario HC',
      to: '/inicio/bi-trade/ventas-hc/inventario',
      keywords: ['hc', 'homecenter', 'stock', 'existencias'],
      permiso: editarEn('hc', 'inventario'),
    },
    {
      label: 'Metas HC',
      to: '/inicio/bi-trade/ventas-hc/metas',
      keywords: ['hc', 'homecenter', 'objetivo', 'cumplimiento'],
      permiso: editarEn('hc', 'metas'),
    },
    {
      label: 'Informe de Ventas Falabella',
      to: '/inicio/bi-trade/ventas-falabella',
      keywords: ['falabella', 'ventas falabella', 'informe'],
      permiso: informe('falabella'),
    },
    {
      label: 'Cumplimiento diario Falabella',
      to: '/inicio/bi-trade/ventas-falabella/dia',
      keywords: ['falabella', 'día', 'diario', 'cuota'],
      permiso: informe('falabella'),
    },
    {
      label: 'Ventas Falabella',
      to: '/inicio/bi-trade/ventas-falabella/ventas',
      keywords: ['falabella', 'registrar venta'],
      permiso: editarEn('falabella', 'ventas'),
    },
    {
      label: 'Puntos de venta Falabella',
      to: '/inicio/bi-trade/ventas-falabella/puntos-venta',
      keywords: ['falabella', 'tiendas', 'regional'],
      permiso: editarEn('falabella', 'puntos-venta'),
    },
    {
      label: 'Productos Falabella',
      to: '/inicio/bi-trade/ventas-falabella/productos',
      keywords: ['falabella', 'catálogo', 'precio'],
      permiso: editarEn('falabella', 'productos'),
    },
    {
      label: 'Inventario Falabella',
      to: '/inicio/bi-trade/ventas-falabella/inventario',
      keywords: ['falabella', 'stock', 'existencias'],
      permiso: editarEn('falabella', 'inventario'),
    },
    {
      label: 'Metas Falabella',
      to: '/inicio/bi-trade/ventas-falabella/metas',
      keywords: ['falabella', 'objetivo', 'cumplimiento'],
      permiso: editarEn('falabella', 'metas'),
    },
    {
      label: 'Informe Tmk Ecommerce Claro',
      to: '/inicio/bi-trade/ventas-tmk',
      keywords: ['tmk', 'ecommerce', 'telemercadeo', 'claro', 'informe'],
      permiso: informe('tmk'),
    },
    {
      label: 'Cumplimiento diario Tmk',
      to: '/inicio/bi-trade/ventas-tmk/dia',
      keywords: ['tmk', 'día', 'diario', 'cuota'],
      permiso: informe('tmk'),
    },
    {
      label: 'Ventas Tmk',
      to: '/inicio/bi-trade/ventas-tmk/ventas',
      keywords: ['tmk', 'registrar venta'],
      permiso: editarEn('tmk', 'ventas'),
    },
    {
      label: 'Puntos de venta Tmk',
      to: '/inicio/bi-trade/ventas-tmk/puntos-venta',
      keywords: ['tmk', 'tiendas', 'regional'],
      permiso: editarEn('tmk', 'puntos-venta'),
    },
    {
      label: 'Productos Tmk',
      to: '/inicio/bi-trade/ventas-tmk/productos',
      keywords: ['tmk', 'catálogo', 'precio'],
      permiso: editarEn('tmk', 'productos'),
    },
    {
      label: 'Inventario Tmk',
      to: '/inicio/bi-trade/ventas-tmk/inventario',
      keywords: ['tmk', 'stock', 'existencias'],
      permiso: editarEn('tmk', 'inventario'),
    },
    {
      label: 'Metas Tmk',
      to: '/inicio/bi-trade/ventas-tmk/metas',
      keywords: ['tmk', 'objetivo', 'cumplimiento'],
      permiso: editarEn('tmk', 'metas'),
    },
    {
      label: 'Plan Recomiéndame Belkin',
      to: '/inicio/bi-trade/plan-recomiendame-belkin',
      keywords: ['belkin', 'recomiendame', 'referidos', 'plan'],
      permiso: informe('belkin'),
    },
    {
      label: 'Plan Partners',
      to: '/inicio/bi-trade/plan-partners',
      keywords: ['partners', 'aliados', 'plan'],
      permiso: informe('partners'),
    },
    {
      label: 'Cumplimiento diario',
      to: '/inicio/bi-trade/claro/dia',
      keywords: ['día', 'diario', 'cuota', 'cumplimiento del día', 'ayer'],
      permiso: informe('claro'),
    },
    {
      label: 'Concurso de tickets',
      to: '/inicio/bi-trade/claro/tickets',
      keywords: ['tickets', 'concurso', 'sorteo', 'campaña', 'escalas', 'acelerador'],
      permiso: informe('claro'),
    },
    {
      label: 'Ventas',
      to: '/inicio/bi-trade/claro/ventas',
      keywords: ['registrar venta', 'unidades', 'facturación'],
      permiso: editarEn('claro', 'ventas'),
    },
    {
      label: 'Puntos de venta',
      to: '/inicio/bi-trade/claro/puntos-venta',
      keywords: ['pdv', 'regional', 'materiales'],
      permiso: editarEn('claro', 'puntos-venta'),
    },
    {
      label: 'Productos',
      to: '/inicio/bi-trade/claro/productos',
      keywords: ['catálogo', 'sku', 'marca', 'precio'],
      permiso: editarEn('claro', 'productos'),
    },
    {
      label: 'Inventario',
      to: '/inicio/bi-trade/claro/inventario',
      keywords: ['stock', 'existencias', 'agotado'],
      permiso: editarEn('claro', 'inventario'),
    },
    {
      label: 'Metas',
      to: '/inicio/bi-trade/claro/metas',
      keywords: ['objetivo', 'cumplimiento', 'presupuesto'],
      permiso: editarEn('claro', 'metas'),
    },
  ],
  admin: [
    {
      label: 'Usuarios',
      to: '/inicio/admin',
      keywords: ['personas', 'cuentas', 'accesos', 'crear usuario'],
      // Ver el listado (o editarlo, que lo incluye).
      permiso: [['admin:users:view', 'admin:users:manage']],
    },
  ],
};
