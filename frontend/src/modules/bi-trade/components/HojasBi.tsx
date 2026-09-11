import { NavLink } from 'react-router-dom';
import { CalendarCheckIcon, TicketIcon, TrendingUpIcon } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useFuente, type HojaTablero } from '../fuente';

/**
 * Cada hoja posible del tablero.
 *
 * `corta` es la etiqueta de celular: las largas no caben en 360 px sin
 * desplazar la barra, y una pestaña que no se ve es una pestaña que no existe.
 */
const HOJAS: Record<
  HojaTablero,
  { tramo: string; etiqueta: string; corta: string; icono: typeof TrendingUpIcon }
> = {
  mes: { tramo: '', etiqueta: 'Avance del mes', corta: 'Mes', icono: TrendingUpIcon },
  dia: { tramo: '/dia', etiqueta: 'Cumplimiento diario', corta: 'Día', icono: CalendarCheckIcon },
  tickets: {
    tramo: '/tickets',
    etiqueta: 'Concurso de tickets',
    corta: 'Tickets',
    icono: TicketIcon,
  },
};

/**
 * Pestañas del tablero, al estilo de las hojas de un informe.
 *
 * Son enlaces y no un `Tabs`: cada hoja es una ruta propia, así que se puede
 * compartir por URL, recargar y volver con el botón de atrás.
 *
 * Qué hojas hay y de qué ruta cuelgan lo dice la fuente de datos: Claro tiene
 * tres, Homecenter y Falabella dos, y en el enlace público cuelgan de
 * `/tablero/<token>`.
 */
export function HojasBi() {
  const { base, hojas } = useFuente();

  return (
    <nav className="flex gap-1 overflow-x-auto border-b" aria-label="Hojas del tablero">
      {hojas.map((clave) => {
        const { tramo, etiqueta, corta, icono: Icono } = HOJAS[clave];
        return (
          <NavLink
            key={clave}
            to={`${base}${tramo}`}
            end
            className={({ isActive }) =>
              cn(
                // `-mb-px` monta el borde de la activa sobre el de la barra.
                '-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                isActive
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
              )
            }
          >
            <Icono className="size-4" />
            <span className="sm:hidden">{corta}</span>
            <span className="hidden sm:inline">{etiqueta}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
