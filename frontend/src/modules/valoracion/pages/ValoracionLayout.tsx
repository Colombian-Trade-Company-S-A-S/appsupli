import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  BarChart3Icon,
  ClipboardListIcon,
  GaugeIcon,
  LayersIcon,
  ListChecksIcon,
  NetworkIcon,
  TargetIcon,
  UserRoundIcon,
  UsersIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { FullPageLoader } from '@/shared/components/feedback';
import { cn } from '@/shared/lib/utils';
import type { Capacidades } from '../api';
import { useResumen } from '../hooks';

interface Seccion {
  to: string;
  label: string;
  icon: LucideIcon;
  visible: (c: Capacidades) => boolean;
  /** Solo marca activo con coincidencia exacta (el índice del módulo). */
  exacto?: boolean;
}

export const SECCIONES: Seccion[] = [
  { to: '', label: 'Inicio', icon: GaugeIcon, visible: () => true, exacto: true },
  { to: 'mis-evaluaciones', label: 'Mis evaluaciones', icon: ListChecksIcon, visible: () => true },
  { to: 'mis-resultados', label: 'Mis resultados', icon: UserRoundIcon, visible: () => true },
  {
    to: 'equipo',
    label: 'Resultados del equipo',
    icon: UsersIcon,
    visible: (c) => c.isLeader || c.canViewAll || c.canViewDashboard,
  },
  {
    to: 'dashboard',
    label: 'Dashboard',
    icon: BarChart3Icon,
    visible: (c) => c.canViewDashboard,
  },
  {
    to: 'consolidado',
    label: 'Consolidado',
    icon: LayersIcon,
    visible: (c) => c.canViewDashboard,
  },
  { to: 'planes', label: 'Planes de acción', icon: TargetIcon, visible: () => true },
  {
    to: 'ciclos',
    label: 'Ciclos',
    icon: ClipboardListIcon,
    visible: (c) => c.canManageCycles,
  },
  {
    to: 'preguntas',
    label: 'Preguntas',
    icon: ListChecksIcon,
    visible: (c) => c.canConfigure || c.canManageCycles,
  },
  {
    to: 'competencias',
    label: 'Competencias',
    icon: LayersIcon,
    visible: (c) => c.canConfigure,
  },
  {
    to: 'jerarquia',
    label: 'Jerarquía',
    icon: NetworkIcon,
    visible: (c) => c.canManageHierarchy,
  },
];

const BASE = '/inicio/valoracion';

/** Marco del módulo: la barra de secciones que la persona tiene permitidas. */
export default function ValoracionLayout() {
  const { data: resumen, isLoading } = useResumen();
  const { pathname } = useLocation();

  if (isLoading || !resumen) return <FullPageLoader label="Abriendo valoración…" />;

  const secciones = SECCIONES.filter((s) => s.visible(resumen.capabilities));
  const activa = (seccion: Seccion) => {
    const ruta = seccion.to ? `${BASE}/${seccion.to}` : BASE;
    return seccion.exacto ? pathname === ruta : pathname.startsWith(ruta);
  };

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {/* Son once secciones: en vez de una tira que hay que arrastrar de lado,
          se envuelven en varias líneas y siempre caben. Por eso la sección
          activa se marca con fondo y no con un subrayado, que en la segunda
          fila quedaría suelto. */}
      <nav className="border-b border-border pb-2">
        <ul className="flex flex-wrap items-center gap-1">
          {secciones.map((seccion) => {
            const Icono = seccion.icon;
            const esActiva = activa(seccion);
            return (
              <li key={seccion.to || 'inicio'}>
                <Link
                  to={seccion.to ? `${BASE}/${seccion.to}` : BASE}
                  aria-current={esActiva ? 'page' : undefined}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
                    esActiva
                      ? 'bg-muted font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  )}
                >
                  <Icono className="size-4 shrink-0" />
                  {seccion.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <Outlet />
    </div>
  );
}
