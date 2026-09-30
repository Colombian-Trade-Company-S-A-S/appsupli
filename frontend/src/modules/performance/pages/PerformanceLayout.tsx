import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  BarChart3Icon,
  GaugeIcon,
  ListChecksIcon,
  LockIcon,
  TrophyIcon,
  UsersIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/shared/components/ui';
import { cn } from '@/shared/lib/utils';
import { useOpcionesPerformance } from '../hooks';

export const BASE = '/inicio/performance/objetivos';

interface Seccion {
  to: string;
  label: string;
  icon: LucideIcon;
  exacto?: boolean;
  /** Las vistas que llegan con la medición de octubre (Fase 2). */
  faseDos?: boolean;
  /** Solo para quien tiene equipo a cargo, o para People. */
  soloLider?: boolean;
}

const SECCIONES: Seccion[] = [
  { to: '', label: 'Inicio', icon: GaugeIcon, exacto: true },
  { to: 'mis-objetivos', label: 'Mis objetivos', icon: ListChecksIcon },
  { to: 'equipo', label: 'Objetivos del equipo', icon: UsersIcon, soloLider: true },
  { to: 'dashboard', label: 'Semáforo del equipo', icon: BarChart3Icon },
  { to: 'top', label: 'Top Performance', icon: TrophyIcon },
];

/**
 * Marco del sub-módulo: la barra de vistas de Objetivos y KPIs.
 *
 * `faseDos` deja una vista apagada con su insignia, en vez de esconderla: así
 * se ve que está planeada. Hoy no hay ninguna, porque el semáforo y el Top ya
 * se alimentan de los resultados que se cargan mes a mes.
 */
export default function PerformanceLayout() {
  const { pathname } = useLocation();
  const { data: opciones } = useOpcionesPerformance();
  // Al colaborador no se le ofrece «Objetivos del equipo»: los objetivos los
  // define su jefe, así que esa vista no tendría a quién mostrarle.
  const esLider =
    !!opciones?.capacidades.esLider || !!opciones?.capacidades.puedeDefinirACualquiera;
  const visibles = SECCIONES.filter((seccion) => !seccion.soloLider || esLider);

  const activa = (seccion: Seccion) => {
    const ruta = seccion.to ? `${BASE}/${seccion.to}` : BASE;
    return seccion.exacto ? pathname === ruta : pathname.startsWith(ruta);
  };

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <nav className="border-b border-border pb-2">
        <ul className="flex flex-wrap items-center gap-1">
          {visibles.map((seccion) => {
            const Icono = seccion.icon;
            if (seccion.faseDos) {
              return (
                <li key={seccion.to}>
                  <span
                    aria-disabled
                    title="Se habilita en octubre, cuando inicia la medición."
                    className="inline-flex cursor-not-allowed items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground/60"
                  >
                    <Icono className="size-4 shrink-0" />
                    {seccion.label}
                    <Badge variant="outline" className="gap-1 text-[10px]">
                      <LockIcon className="size-2.5" />
                      Fase 2
                    </Badge>
                  </span>
                </li>
              );
            }
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
