import {
  BarChart3Icon,
  FileSpreadsheetIcon,
  GaugeIcon,
  Link2Icon,
  PaletteIcon,
  SettingsIcon,
  ShieldCheckIcon,
  type LucideIcon,
} from 'lucide-react';

/**
 * Lo que la plataforma ofrece, contado para quien todavía no ha entrado. Lo
 * usan la portada y el panel del login, para que digan lo mismo.
 */
export interface ModuloPublico {
  icono: LucideIcon;
  titulo: string;
  /** Una línea, para listas cortas. */
  corto: string;
  descripcion: string;
  puntos: string[];
}

export const MODULOS: ModuloPublico[] = [
  {
    icono: GaugeIcon,
    titulo: 'Supli performance',
    corto: 'Evaluaciones, resultados y planes de acción',
    descripcion:
      'Los ciclos de evaluación de principio a fin: cada persona responde, ve sus resultados y los líderes siguen a su equipo.',
    puntos: ['Mis evaluaciones y resultados', 'Resultados del equipo', 'Planes de acción'],
  },
  {
    icono: BarChart3Icon,
    titulo: 'BI Trade Marketing',
    corto: 'Avance del mes y cumplimiento por canal',
    descripcion:
      'Las ventas contra la meta del mes en Claro, Homecenter, Falabella y Tmk, con el detalle por regional y punto de venta.',
    puntos: [
      'Avance del mes y cumplimiento diario',
      'Ventas, metas e inventario',
      'Tableros para compartir con contraseña',
    ],
  },
  {
    icono: SettingsIcon,
    titulo: 'Administración',
    corto: 'Usuarios, áreas, roles y permisos',
    descripcion:
      'Quién entra y a qué: las cuentas de la compañía, sus áreas y los permisos de cada aplicación.',
    puntos: ['Usuarios y áreas', 'Roles y permisos', 'Acceso por aplicación'],
  },
];

export interface Ventaja {
  icono: LucideIcon;
  titulo: string;
  descripcion: string;
}

export const VENTAJAS: Ventaja[] = [
  {
    icono: ShieldCheckIcon,
    titulo: 'Ves solo lo tuyo',
    descripcion: 'Cada persona entra a las aplicaciones de su rol. Lo demás ni aparece.',
  },
  {
    icono: FileSpreadsheetIcon,
    titulo: 'Carga desde Excel',
    descripcion: 'Plantillas para cargar datos por módulo y el informe del ERP de una sola pasada.',
  },
  {
    icono: Link2Icon,
    titulo: 'Comparte sin dar acceso',
    descripcion: 'Enlaces de solo lectura, con contraseña, para ver un tablero sin cuenta.',
  },
  {
    icono: PaletteIcon,
    titulo: 'A tu manera',
    descripcion: 'Tema claro u oscuro, color y bordes. Se guardan en tu cuenta.',
  },
];
