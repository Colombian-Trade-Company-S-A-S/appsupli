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

export const BASE = '/inicio/performance/objetivos';

interface Seccion {
  to: string;
  label: string;
  icon: LucideIcon;
  exacto?: boolean;
  /** Las vistas que llegan con la medición de octubre (Fase 2). */
  faseDos?: boolean;
}

const SECCIONES: Seccion[] = [
  { to: '', label: 'Inicio', icon: GaugeIcon, exacto: true },
  { to: 'mis-objetivos', label: 'Mis objetivos', icon: ListChecksIcon },
  { to: 'equipo', label: 'Objetivos del equipo', icon: UsersIcon },
  { to: 'dashboard', label: 'Dashboard', icon: BarChart3Icon, faseDos: true },
  { to: 'top', label: 'Top Performance', icon: TrophyIcon, faseDos: true },
];

/**
 * Marco del sub-módulo: la barra de vistas de Objetivos y KPIs.
 *
 * Las dos últimas se muestran apagadas a propósito. La especificación las deja
 * para la Fase 2 —cuando se carguen resultados y evidencias—, y esconderlas
 * haría parecer que no están planeadas.
 */
export default function PerformanceLayout() {
  const { pathname } = useLocation();

  const activa = (seccion: Seccion) => {
    const ruta = seccion.to ? `${BASE}/${seccion.to}` : BASE;
    return seccion.exacto ? pathname === ruta : pathname.startsWith(ruta);
  };

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <nav className="border-b border-border pb-2">
        <ul className="flex flex-wrap items-center gap-1">
          {SECCIONES.map((seccion) => {
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
