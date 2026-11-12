/**
 * Las piezas del detalle de un punto de venta y de una regional.
 *
 * Los dos son el tablero recortado (a un punto o a una regional) con lo mismo
 * encima: las cuatro cifras, el camino a la meta, el corte por marca y por
 * producto, lo que hay que reforzar, el inventario y las ventas. Cambia de qué
 * se habla —un punto, cuyo asesor descansa el domingo, o una regional, que
 * vende todos los días— y lo que cada página pone de contexto.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangleIcon,
  BoxesIcon,
  CalendarClockIcon,
  FlagIcon,
  GaugeIcon,
  PackageIcon,
  ReceiptTextIcon,
  SearchIcon,
  TagIcon,
  TrendingUpIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui';
import { Kpi } from '@/shared/components/layout';
import {
  formatoFecha,
  formatoMoneda,
  formatoMonedaCorta,
  formatoNumero,
} from '@/shared/lib/formato';
import { cn } from '@/shared/lib/utils';
import type { DetalleAvance, FilaAvance } from '../api';
import { BadgeCumplimiento, BarraCumplimiento } from './Cumplimiento';
import { BadgeRitmo, calcularRitmo } from './AvanceMensual';

/** Cuántas filas se ven antes de «ver todas» en las listas largas. */
const TOPE = 12;

/** Lo que se repite en las cifras: si ya cumplió, si el mes terminó y el esfuerzo. */
export function estadoDelMes(data: DetalleAvance) {
  const { ritmo, totales } = data;
  return {
    cumplida: ritmo.falta === 0 && totales.metaDinero > 0,
    terminado: ritmo.habilesRestantes === 0,
    // Cuántas veces su promedio tiene que vender por día para llegar.
    esfuerzo:
      ritmo.promedioDiario > 0
        ? Math.round((ritmo.necesarioDiario / ritmo.promedioDiario) * 10) / 10
        : null,
  };
}

const nombreDias = (data: DetalleAvance) => (data.ritmo.todosLosDias ? 'día' : 'día hábil');

/** Las cuatro cifras del mes: dónde va, cuánto vendió, a qué ritmo y qué le toca. */
export function CifrasDelMes({ data }: { data: DetalleAvance }) {
  const { totales, ritmo } = data;
  const { cumplida, terminado } = estadoDelMes(data);
  const dia = nombreDias(data);
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi
        label="Cumplimiento de la meta"
        value={`${totales.cumplimiento}%`}
        extra={<BadgeRitmo ritmo={calcularRitmo(data)} />}
        hint={
          ritmo.habilesCorridos > 0
            ? `Debería ir en ${ritmo.esperado}% a esta altura del mes`
            : 'El mes todavía no arranca'
        }
      >
        <BarraCumplimiento porcentaje={totales.cumplimiento} />
      </Kpi>
      <Kpi
        label="Vendido en el mes"
        value={formatoMonedaCorta(totales.ventasDinero)}
        hint={`${formatoNumero(totales.ventasCantidad)} de ${formatoNumero(totales.metaCantidad)} unidades de meta`}
      />
      <Kpi
        label="Promedio diario"
        value={formatoMonedaCorta(ritmo.promedioDiario)}
        hint={`${formatoNumero(ritmo.promedioDiarioUnidades)} unidades por ${dia} · ${ritmo.habilesCorridos} día(s) corrido(s)`}
      />
      <Kpi
        label="Debe vender por día"
        value={
          cumplida ? 'Meta cumplida' : terminado ? '—' : formatoMonedaCorta(ritmo.necesarioDiario)
        }
        extra={<FlagIcon className="size-4 text-muted-foreground" />}
        hint={
          cumplida
            ? 'Ya llegó a la meta del mes'
            : terminado
              ? 'El mes ya terminó'
              : `${formatoNumero(ritmo.necesarioDiarioUnidades)} unidades por día en ${ritmo.habilesRestantes} ${dia}(s) que quedan`
        }
      />
    </div>
  );
}

/** Una cifra chica con su ícono, para las tarjetas de contexto. */
export function Dato({
  icono: Icono,
  rotulo,
  valor,
  detalle,
}: {
  icono: LucideIcon;
  rotulo: string;
  valor: ReactNode;
  detalle?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icono className="size-4" />
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="text-xs text-muted-foreground">{rotulo}</span>
        <span className="font-heading text-base font-semibold tabular-nums">{valor}</span>
        {detalle && <span className="text-xs text-muted-foreground">{detalle}</span>}
      </div>
    </div>
  );
}

/**
 * Cuánto falta, a qué ritmo va y cuánto le toca. `contexto` son las cifras
 * propias de cada página (su puesto, su regional, sus puntos…).
 */
export function CaminoALaMeta({
  data,
  descripcion,
  contexto,
}: {
  data: DetalleAvance;
  descripcion: string;
  contexto?: ReactNode;
}) {
  const { totales, ritmo } = data;
  const { cumplida, terminado, esfuerzo } = estadoDelMes(data);
  const dia = nombreDias(data);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUpIcon className="size-4 text-primary" />
          Camino a la meta
        </CardTitle>
        <CardDescription>{descripcion}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span>
              <span className="font-semibold tabular-nums">
                {formatoMoneda(totales.ventasDinero)}
              </span>{' '}
              <span className="text-muted-foreground">de {formatoMoneda(totales.metaDinero)}</span>
            </span>
            <span className="text-muted-foreground">
              {cumplida
                ? 'Meta cumplida'
                : `Faltan ${formatoMoneda(ritmo.falta)} · ${formatoNumero(ritmo.faltaUnidades)} unidades`}
            </span>
          </div>
          <div className="relative">
            <BarraCumplimiento porcentaje={totales.cumplimiento} className="h-3" />
            {/* Dónde debería ir: la marca del ritmo esperado sobre la barra. */}
            {ritmo.habilesCorridos > 0 && ritmo.esperado < 100 && (
              <span
                aria-hidden
                className="absolute -top-1 h-5 w-0.5 rounded bg-foreground/60"
                style={{ left: `${ritmo.esperado}%` }}
              />
            )}
          </div>
          {ritmo.habilesCorridos > 0 && (
            <p className="text-xs text-muted-foreground">
              La línea marca dónde debería ir hoy: {ritmo.esperado}% del mes.
            </p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Dato
            icono={CalendarClockIcon}
            rotulo={ritmo.todosLosDias ? 'Días del mes' : 'Días hábiles'}
            valor={`${ritmo.habilesRestantes} por delante`}
            detalle={`${ritmo.habilesCorridos} corridos de ${ritmo.habilesTotales} en el mes`}
          />
          <Dato
            icono={GaugeIcon}
            rotulo="Si sigue a su promedio"
            valor={`Cierra en ${ritmo.cumplimientoProyectado}%`}
            detalle={`${formatoMoneda(ritmo.proyectado)} al terminar el mes`}
          />
          <Dato
            icono={FlagIcon}
            rotulo="Esfuerzo para cumplir"
            valor={
              cumplida
                ? 'Ya cumplió'
                : terminado
                  ? 'Mes cerrado'
                  : esfuerzo
                    ? `${esfuerzo}× su promedio`
                    : formatoMonedaCorta(ritmo.necesarioDiario)
            }
            detalle={
              cumplida || terminado
                ? undefined
                : `${formatoMoneda(ritmo.necesarioDiario)} por ${dia}`
            }
          />
          {contexto}
        </div>
      </CardContent>
    </Card>
  );
}

/** Encabezado de tarjeta con ícono, título, descripción y una acción opcional. */
function Cabecera({
  icono: Icono,
  titulo,
  descripcion,
  accion,
}: {
  icono: LucideIcon;
  titulo: string;
  descripcion: string;
  accion?: ReactNode;
}) {
  return (
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Icono className="size-4 text-primary" />
        {titulo}
      </CardTitle>
      <CardDescription>{descripcion}</CardDescription>
      {accion && <CardAction>{accion}</CardAction>}
    </CardHeader>
  );
}

function Vacio({ children }: { children: ReactNode }) {
  return <p className="px-6 py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

function VerTodas({
  total,
  verTodas,
  onCambiar,
}: {
  total: number;
  verTodas: boolean;
  onCambiar: (valor: boolean) => void;
}) {
  if (total <= TOPE) return <div className="h-2" />;
  return (
    <div className="flex justify-center border-t py-2">
      <Button variant="ghost" size="sm" onClick={() => onCambiar(!verTodas)}>
        {verTodas ? `Ver solo ${TOPE}` : `Ver las ${formatoNumero(total)}`}
      </Button>
    </div>
  );
}

export function PorMarca({ filas }: { filas: FilaAvance[] }) {
  const ordenadas = [...filas].sort((a, b) => b.metaMensual - a.metaMensual);
  return (
    <Card className="h-full">
      <Cabecera
        icono={TagIcon}
        titulo="Cumplimiento por marca"
        descripcion="Lo vendido de cada marca contra su meta del mes."
      />
      <CardContent>
        {ordenadas.length === 0 ? (
          <Vacio>Sin metas ni ventas este mes.</Vacio>
        ) : (
          <ul className="flex flex-col gap-4">
            {ordenadas.map((fila) => (
              <li key={fila.key} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate font-medium">{fila.label}</span>
                  <BadgeCumplimiento porcentaje={fila.cumplimiento} />
                </div>
                <BarraCumplimiento porcentaje={fila.cumplimiento} />
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatoMonedaCorta(fila.importe)} de {formatoMonedaCorta(fila.metaMensual)} ·{' '}
                  {formatoNumero(fila.cantidad)} und
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function AReforzar({ data }: { data: DetalleAvance }) {
  const filas = data.aReforzar;
  return (
    <Card className="h-full">
      <Cabecera
        icono={AlertTriangleIcon}
        titulo="Productos a reforzar"
        descripcion={`Tienen meta y van por debajo del ${data.ritmo.esperado}% que deberían llevar hoy.`}
      />
      <CardContent>
        {filas.length === 0 ? (
          <Vacio>
            {data.ritmo.habilesCorridos === 0
              ? 'El mes todavía no arranca.'
              : 'Todos los productos con meta van al día.'}
          </Vacio>
        ) : (
          <ul className="flex max-h-96 flex-col divide-y overflow-y-auto">
            {filas.map((fila) => (
              <li key={fila.key} className="flex flex-col gap-1 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{fila.label}</span>
                    <span className="text-xs text-muted-foreground">{fila.marca || '—'}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {fila.sinStock && <Badge variant="destructive">Sin stock</Badge>}
                    <BadgeCumplimiento porcentaje={fila.cumplimiento} />
                  </span>
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatoNumero(fila.cantidad)} de {formatoNumero(fila.metaCantidad)} und · faltan{' '}
                  {formatoNumero(fila.faltanUnidades)}
                  {data.ritmo.habilesRestantes > 0 &&
                    ` · ${formatoNumero(fila.unidadesPorDia)} por día`}
                  {!fila.sinStock && ` · ${formatoNumero(fila.inventario)} en stock`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function PorProducto({ data }: { data: DetalleAvance }) {
  const [verTodas, setVerTodas] = useState(false);
  const filas = [...data.porProducto].sort(
    (a, b) => b.metaMensual - a.metaMensual || b.importe - a.importe,
  );
  const visibles = verTodas ? filas : filas.slice(0, TOPE);
  return (
    <Card className="gap-0 pb-0">
      <Cabecera
        icono={PackageIcon}
        titulo="Cumplimiento por producto"
        descripcion="Unidades vendidas contra la meta de cada producto, con su stock."
      />
      <CardContent className="px-0 pt-4">
        {filas.length === 0 ? (
          <Vacio>Sin metas ni ventas este mes.</Vacio>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Vendidas</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Meta</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Importe</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Stock</TableHead>
                  <TableHead className="text-right">Cumplimiento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((fila) => (
                  <TableRow key={fila.key}>
                    <TableCell className="max-w-48 sm:max-w-none">
                      <span className="block truncate font-medium">{fila.label}</span>
                      <span className="text-xs text-muted-foreground">{fila.marca || '—'}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatoNumero(fila.cantidad)}
                      <span className="text-muted-foreground sm:hidden">
                        /{formatoNumero(fila.metaCantidad)}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">
                      {formatoNumero(fila.metaCantidad)}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">
                      {formatoMoneda(fila.importe)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'hidden text-right tabular-nums md:table-cell',
                        fila.inventario === 0 && fila.metaCantidad > 0 && 'text-destructive',
                      )}
                    >
                      {formatoNumero(fila.inventario)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <BarraCumplimiento
                          porcentaje={fila.cumplimiento}
                          className="hidden w-16 lg:block"
                        />
                        <BadgeCumplimiento porcentaje={fila.cumplimiento} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <VerTodas total={filas.length} verTodas={verTodas} onCambiar={setVerTodas} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function Inventario({ data }: { data: DetalleAvance }) {
  const [verTodas, setVerTodas] = useState(false);
  // Lo que tiene en stock y lo que tiene meta pero se quedó sin stock.
  const filas = data.porProducto
    .filter((fila) => fila.inventario > 0 || fila.metaCantidad > 0)
    .sort((a, b) => b.inventarioValor - a.inventarioValor);
  const sinStock = filas.filter((fila) => fila.inventario === 0).length;
  const visibles = verTodas ? filas : filas.slice(0, TOPE);
  return (
    <Card className="gap-0 pb-0">
      <Cabecera
        icono={BoxesIcon}
        titulo="Inventario"
        descripcion={`${formatoNumero(data.totales.inventarioUnidades)} unidades en stock, valorizadas a precio Coltrade de hoy${
          sinStock ? ` · ${sinStock} producto(s) con meta sin stock` : ''
        }.`}
      />
      <CardContent className="px-0 pt-4">
        {filas.length === 0 ? (
          <Vacio>Sin inventario cargado.</Vacio>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Valor</TableHead>
                  <TableHead className="text-right">Alcanzable</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((fila) => (
                  <TableRow key={fila.key}>
                    <TableCell className="max-w-48 sm:max-w-none">
                      <span className="block truncate font-medium">{fila.label}</span>
                      <span className="text-xs text-muted-foreground">{fila.marca || '—'}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fila.inventario === 0 ? (
                        <Badge variant="destructive">Sin stock</Badge>
                      ) : (
                        formatoNumero(fila.inventario)
                      )}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">
                      {formatoMoneda(fila.inventarioValor)}
                    </TableCell>
                    <TableCell className="text-right">
                      {fila.metaMensual > 0 ? (
                        <BadgeCumplimiento porcentaje={fila.cumplimientoAlcanzable} />
                      ) : (
                        <span className="text-xs text-muted-foreground">Sin meta</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <VerTodas total={filas.length} verTodas={verTodas} onCambiar={setVerTodas} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Las ventas del mes. Con `enlacePunto`, cada venta dice de qué punto es y
 * lleva a su detalle (es lo que usa la regional).
 */
export function Ventas({
  data,
  enlacePunto,
}: {
  data: DetalleAvance;
  enlacePunto?: (idPunto: string) => string;
}) {
  const [buscar, setBuscar] = useState('');
  const [verTodas, setVerTodas] = useState(false);
  const texto = buscar.trim().toLowerCase();
  const filas = texto
    ? data.ventas.filter((venta) =>
        `${venta.producto} ${venta.marca} ${venta.idProducto} ${venta.punto}`
          .toLowerCase()
          .includes(texto),
      )
    : data.ventas;
  const visibles = verTodas ? filas : filas.slice(0, TOPE);
  return (
    <Card className="gap-0 pb-0">
      <Cabecera
        icono={ReceiptTextIcon}
        titulo="Ventas del mes"
        descripcion={`${formatoNumero(data.ventas.length)} registro(s), de la más reciente a la más vieja.`}
        accion={
          data.ventas.length > TOPE && (
            <div className="relative w-full sm:w-56">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-8 pl-9"
                placeholder={enlacePunto ? 'Buscar producto o punto…' : 'Buscar producto o marca…'}
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
              />
            </div>
          )
        }
      />
      <CardContent className="px-0 pt-4">
        {filas.length === 0 ? (
          <Vacio>
            {buscar ? `Ninguna venta coincide con «${buscar}».` : 'Sin ventas este mes.'}
          </Vacio>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Producto</TableHead>
                  {enlacePunto && (
                    <TableHead className="hidden md:table-cell">Punto de venta</TableHead>
                  )}
                  <TableHead className="text-right">Und</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Importe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((venta, indice) => (
                  <TableRow
                    key={`${venta.fecha}-${venta.idProducto}-${venta.idPuntoVenta}-${indice}`}
                  >
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatoFecha(venta.fecha)}
                    </TableCell>
                    <TableCell className="max-w-44 sm:max-w-none">
                      <span className="block truncate font-medium">{venta.producto}</span>
                      <span className="text-xs text-muted-foreground">
                        {venta.marca || '—'}
                        {/* En celular el punto va debajo del producto. */}
                        {enlacePunto && <span className="md:hidden"> · {venta.punto}</span>}
                      </span>
                    </TableCell>
                    {enlacePunto && (
                      <TableCell className="hidden md:table-cell">
                        <Link
                          to={enlacePunto(venta.idPuntoVenta)}
                          className="underline-offset-4 hover:text-primary hover:underline"
                        >
                          {venta.punto}
                        </Link>
                      </TableCell>
                    )}
                    <TableCell className="text-right tabular-nums">
                      {formatoNumero(venta.cantidad)}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">
                      {formatoMoneda(venta.importe)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <VerTodas total={filas.length} verTodas={verTodas} onCambiar={setVerTodas} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
