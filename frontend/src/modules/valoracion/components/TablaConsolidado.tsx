import { Link } from 'react-router-dom';
import { UsersIcon } from 'lucide-react';
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui';
import type { FilaConsolidada } from '../api';

import { EstadoTabla } from './Piezas';
import { BarraNivel, NivelBadge } from './Semaforo';

/**
 * Columnas que se esconden en pantallas angostas.
 *
 * Once columnas no caben en un portátil y la tabla obligaba a arrastrar de
 * lado. Lo esencial (persona, consolidado y semáforo) se ve siempre; el resto
 * va apareciendo con el ancho, y lo que se oculta se repite bajo el nombre.
 */
const MEDIA = 'hidden md:table-cell';
const ANCHA = 'hidden xl:table-cell';
const MUY_ANCHA = 'hidden 2xl:table-cell';

/**
 * Una fila por persona: el consolidado de todas sus calificaciones.
 *
 * Nunca una fila por evaluador ni por ciclo — ese fue el punto de todo el
 * motor de cálculo, y la tabla tiene que respetarlo.
 */
export function TablaConsolidado({
  filas,
  cargando,
  puedeVerFicha = false,
}: {
  filas: FilaConsolidada[];
  cargando: boolean;
  puedeVerFicha?: boolean;
}) {
  return (
    <EstadoTabla
      cargando={cargando}
      vacio={filas.length === 0}
      icono={<UsersIcon />}
      titulo="Sin resultados consolidados"
      descripcion="Ajusta los filtros o consolida un ciclo con evaluaciones completadas."
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Persona</TableHead>
            <TableHead className={MEDIA}>Área</TableHead>
            <TableHead className={ANCHA}>Cargo</TableHead>
            <TableHead className={ANCHA}>Jefe directo</TableHead>
            <TableHead className={MEDIA}>Calif.</TableHead>
            <TableHead className={MUY_ANCHA}>Jefe</TableHead>
            <TableHead className={MUY_ANCHA}>Equipo</TableHead>
            <TableHead className={MUY_ANCHA}>Auto</TableHead>
            <TableHead className="min-w-36">Consolidado</TableHead>
            <TableHead>Semáforo</TableHead>
            {puedeVerFicha && <TableHead className="text-right">Ficha</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.map((fila) => (
            <TableRow key={fila.personId}>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-medium">{fila.person}</span>
                  <span className="text-xs text-muted-foreground">
                    {fila.cycles} ciclo{fila.cycles === 1 ? '' : 's'} · {fila.kindLabel}
                  </span>
                  {/* Lo que se oculta arriba no se pierde: se repite aquí. */}
                  <span className="text-xs text-muted-foreground xl:hidden">
                    <span className="md:hidden">{fila.area} · </span>
                    {fila.position}
                  </span>
                </div>
              </TableCell>
              <TableCell className={`text-muted-foreground ${MEDIA}`}>{fila.area}</TableCell>
              <TableCell className={`text-muted-foreground ${ANCHA}`}>{fila.position}</TableCell>
              <TableCell className={`text-muted-foreground ${ANCHA}`}>{fila.manager}</TableCell>
              <TableCell className={`tabular-nums ${MEDIA}`}>{fila.evaluations}</TableCell>
              <TableCell className={`tabular-nums text-muted-foreground ${MUY_ANCHA}`}>
                {fila.managerAverage != null ? `${fila.managerAverage}%` : '—'}
              </TableCell>
              <TableCell className={`tabular-nums text-muted-foreground ${MUY_ANCHA}`}>
                {fila.teamAverage != null ? `${fila.teamAverage}%` : '—'}
              </TableCell>
              <TableCell className={`tabular-nums text-muted-foreground ${MUY_ANCHA}`}>
                {fila.selfAverage != null ? `${fila.selfAverage}%` : '—'}
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium tabular-nums">{fila.percentage}%</span>
                  <BarraNivel porcentaje={fila.percentage} nivel={fila.level} />
                </div>
              </TableCell>
              <TableCell>
                <NivelBadge nivel={fila.level} corto />
              </TableCell>
              {puedeVerFicha && (
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    render={<Link to={`/inicio/valoracion/dashboard/persona/${fila.personId}`} />}
                  >
                    Ver
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </EstadoTabla>
  );
}
