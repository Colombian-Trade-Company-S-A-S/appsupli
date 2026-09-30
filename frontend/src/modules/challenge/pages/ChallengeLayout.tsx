import { Link, Outlet, useLocation } from 'react-router-dom';
import { ListChecksIcon, TrophyIcon, UserIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export const BASE = '/inicio/challenge';

interface Seccion {
  to: string;
  label: string;
  icon: LucideIcon;
  exacto?: boolean;
}

const SECCIONES: Seccion[] = [
  { to: '', label: 'Retos', icon: ListChecksIcon, exacto: true },
  { to: 'mis-retos', label: 'Mi participación', icon: UserIcon },
  { to: 'top', label: 'Top Challenge', icon: TrophyIcon },
];

/** Marco del módulo: la barra de vistas de Supli Challenge. */
export default function ChallengeLayout() {
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
            const esActiva = activa(seccion);
            return (
              <li key={seccion.to || 'retos'}>
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
