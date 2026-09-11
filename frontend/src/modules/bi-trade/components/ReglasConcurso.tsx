import type { ReactNode } from 'react';
import {
  ClipboardCheckIcon,
  RocketIcon,
  SparklesIcon,
  TicketIcon,
  TrophyIcon,
  UsersIcon,
} from 'lucide-react';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Separator,
} from '@/shared/components/ui';
import { formatoFecha, formatoNumero } from '@/shared/lib/formato';
import type { Campana } from '../api';

/**
 * Las reglas del concurso, como las lee quien vende.
 *
 * Se pintan desde la campaña y no como texto fijo: si alguien cambia una
 * escala en la configuración, esto lo refleja. Es la misma información del
 * afiche, con los números que de verdad está aplicando el cálculo.
 */
export function ReglasConcurso({ campana }: { campana: Campana }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>¿Cómo participar?</CardTitle>
        <CardDescription>
          Vigencia del {formatoFecha(campana.desde)} al {formatoFecha(campana.hasta)} ·{' '}
          {campana.dias} días
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Paso numero={1} icono={<ClipboardCheckIcon />} titulo="Vende">
            Cumple tu meta diaria según la escala y gana tickets.
          </Paso>
          <Paso numero={2} icono={<TicketIcon />} titulo="Acumula">
            Junta tus tickets: mínimo {campana.ticketsMinimos} para estar participando.
          </Paso>
          <Paso numero={3} icono={<UsersIcon />} titulo="Participa">
            Entra al sorteo el punto de venta que cumpla las dos condiciones.
          </Paso>
        </div>

        <Separator />

        <div className="grid gap-6 lg:grid-cols-2">
          <Bloque icono={<TicketIcon />} titulo="Escalas diarias">
            {campana.escalas.length === 0 ? (
              <Vacio>Sin escalas configuradas: nadie gana tickets.</Vacio>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {[...campana.escalas]
                  .sort((a, b) => a.ventas - b.ventas)
                  .map((escala) => (
                    <li
                      key={escala.ventas}
                      className="flex items-baseline justify-between gap-3 text-sm"
                    >
                      <span className="text-muted-foreground">
                        {formatoNumero(escala.ventas)} ventas diarias
                      </span>
                      <Badge variant="secondary">
                        {escala.tickets} ticket{escala.tickets === 1 ? '' : 's'}
                      </Badge>
                    </li>
                  ))}
              </ul>
            )}
            <Nota>Se aplica la escala más alta que alcancen las ventas del día.</Nota>
          </Bloque>

          <Bloque icono={<RocketIcon />} titulo="Acelerador (ventas totales)">
            {campana.aceleradores.length === 0 ? (
              <Vacio>Sin acelerador configurado.</Vacio>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {[...campana.aceleradores]
                  .sort((a, b) => a.ventasTotales - b.ventasTotales)
                  .map((acelerador) => (
                    <li
                      key={acelerador.ventasTotales}
                      className="flex items-baseline justify-between gap-3 text-sm"
                    >
                      <span className="text-muted-foreground">
                        Si llegas a {formatoNumero(acelerador.ventasTotales)} ventas
                      </span>
                      <Badge variant="secondary">
                        +{acelerador.ticketsPorDia} por día cumplido
                      </Badge>
                    </li>
                  ))}
              </ul>
            )}
            <Nota>Se suma al final, por cada día que ya había ganado tickets.</Nota>
          </Bloque>

          <Bloque icono={<SparklesIcon />} titulo="¡Acumula más tickets!">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm">
                  Si al menos <strong>{campana.focoMinimo}</strong> de tus ventas del día son
                  producto foco (Bluelight y/o Privacy)
                </span>
                <Badge variant="secondary" className="w-fit">
                  Doble ticket
                </Badge>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm">
                  Adicional: si logras <strong>{campana.bonoVentas}</strong> ventas en el día
                  incluyendo <strong>{campana.bonoCargadores}</strong> cargadores
                </span>
                <Badge variant="secondary" className="w-fit">
                  +{campana.bonoTickets} tickets
                </Badge>
              </div>
            </div>
            <Nota>
              {campana.productosFoco.length} producto(s) marcados como foco y{' '}
              {campana.productosCargador.length} como cargador.
            </Nota>
          </Bloque>

          <Bloque icono={<TrophyIcon />} titulo="Condición para participar">
            <div className="flex flex-col gap-1.5 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-muted-foreground">Ventas totales mínimas</span>
                <span className="font-semibold tabular-nums">
                  {formatoNumero(campana.ventasMinimas)}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-muted-foreground">Tickets mínimos</span>
                <span className="font-semibold tabular-nums">
                  {formatoNumero(campana.ticketsMinimos)}
                </span>
              </div>
            </div>
            <Nota>Hay que cumplir las dos, no una.</Nota>
          </Bloque>
        </div>
      </CardContent>
    </Card>
  );
}

function Paso({
  numero,
  icono,
  titulo,
  children,
}: {
  numero: number;
  icono: ReactNode;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-4">
        {icono}
      </span>
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">
          {numero}. {titulo}
        </span>
        <span className="text-xs text-muted-foreground">{children}</span>
      </div>
    </div>
  );
}

function Bloque({
  icono,
  titulo,
  children,
}: {
  icono: ReactNode;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <p className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase [&_svg]:size-4">
        {icono}
        {titulo}
      </p>
      {children}
    </div>
  );
}

const Nota = ({ children }: { children: ReactNode }) => (
  <p className="text-xs text-muted-foreground">{children}</p>
);

const Vacio = ({ children }: { children: ReactNode }) => (
  <p className="text-sm text-muted-foreground">{children}</p>
);
