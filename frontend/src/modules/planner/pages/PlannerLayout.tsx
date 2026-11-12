import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import {
  BarChart3Icon,
  BookOpenIcon,
  FlagIcon,
  PlugIcon,
  SlidersHorizontalIcon,
  UserCheckIcon,
  type LucideIcon,
} from 'lucide-react';
import { Encabezado } from '@/shared/components/layout';
import { cn } from '@/shared/lib/utils';
import type { CapacidadesPlanner } from '../api';
import { useOpcionesPlanner } from '../hooks';

export const BASE = '/inicio/performance/planner';

interface Seccion {
  to: string;
  label: string;
  icon: LucideIcon;
  exacto?: boolean;
  visible?: (c: CapacidadesPlanner) => boolean;
}

const SECCIONES: Seccion[] = [
  { to: '', label: 'Cómo funciona', icon: BookOpenIcon, exacto: true },
  { to: 'mi-cumplimiento', label: 'Mi cumplimiento', icon: UserCheckIcon },
  {
    to: 'dashboard',
    label: 'Dashboard',
    icon: BarChart3Icon,
    visible: (c) => c.esLider || c.puedeVerTodo,
  },
  {
    to: 'hitos',
    label: 'Validar Hitos',
    icon: FlagIcon,
    visible: (c) => c.esLider || c.puedeGestionar || c.autovalidaHito,
  },
  { to: 'conexion', label: 'Conexión y calidad', icon: PlugIcon, visible: (c) => c.puedeGestionar },
  {
    to: 'parametros',
    label: 'Parámetros',
    icon: SlidersHorizontalIcon,
    visible: (c) => c.puedeGestionar,
  },
];

/**
 * Marco de Ejecución Planner: las pestañas del prototipo.
 *
 * El colaborador ve cómo funciona y su cumplimiento; el líder suma el
 * dashboard de su equipo y la validación de Hitos; People, además, la
 * conexión con Planner, la calidad del dato y los parámetros.
 */
export default function PlannerLayout() {
  const { pathname } = useLocation();
  const { data: opciones } = useOpcionesPlanner();
  const capacidades = opciones?.capacidades;
  const visibles = SECCIONES.filter((s) => !s.visible || (capacidades && s.visible(capacidades)));

  const activa = (s: Seccion) => {
    const ruta = s.to ? `${BASE}/${s.to}` : BASE;
    return s.exacto ? pathname === ruta : pathname.startsWith(ruta);
  };
  const restringida = SECCIONES.find((s) => s.visible && activa(s));
  if (restringida && capacidades && !restringida.visible?.(capacidades)) {
    return <Navigate to={BASE} replace />;
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Encabezado
        titulo="Ejecución Planner"
        descripcion="Mide cómo se ejecutan las tareas de Microsoft Planner: Weekly y Daily por persona, y Hitos validados por el líder. appSupli solo lee Planner; no crea ni edita tareas."
      />
      <nav className="-mt-2 border-b border-border pb-2">
        <ul className="flex flex-wrap items-center gap-1">
          {visibles.map((s) => {
            const Icono = s.icon;
            const esActiva = activa(s);
            return (
              <li key={s.to || 'inicio'}>
                <Link
                  to={s.to ? `${BASE}/${s.to}` : BASE}
                  aria-current={esActiva ? 'page' : undefined}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
                    esActiva
                      ? 'bg-muted font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  )}
                >
                  <Icono className="size-4 shrink-0" />
                  {s.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {restringida && !capacidades ? null : <Outlet />}
    </div>
  );
}
