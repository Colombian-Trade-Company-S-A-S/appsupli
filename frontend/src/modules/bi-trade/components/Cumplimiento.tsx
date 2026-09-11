import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/shared/components/ui';
import { Field, FieldLabel, Input } from '@/shared/components/ui';
import { Kpi } from '@/shared/components/layout';
import { formatoMoneda, formatoMonedaCorta, formatoNumero } from '@/shared/lib/formato';
import { cn } from '@/shared/lib/utils';
import type { Cumplimiento, FilaCumplimiento } from '../api';

/** Qué medida se está mirando en el ranking. */
type Medida = 'dinero' | 'cantidad' | 'puntos';

/**
 * Barra de cumplimiento contra la meta.
 *
 * El relleno se corta en 100% —la barra mide avance hacia el objetivo, no una
 * magnitud abierta— y el número real va al lado, así un 130% se sigue leyendo
 * aunque la barra esté llena. La marca del 100% queda dibujada para que se vea
 * cuánto falta.
 */
export function BarraCumplimiento({
  porcentaje,
  className,
}: {
  porcentaje: number;
  className?: string;
}) {
  const relleno = Math.max(0, Math.min(100, porcentaje));
  const cumplida = porcentaje >= 100;

  return (
    <div
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-muted', className)}
      role="img"
      aria-label={`${porcentaje}% de la meta`}
    >
      <div
        className={cn(
          'h-full rounded-full transition-all',
          cumplida ? 'bg-success' : 'bg-[var(--chart-1)]',
        )}
        style={{ width: `${relleno}%` }}
      />
    </div>
  );
}

/** Etiqueta del %: verde si cumplió, ámbar si va cerca, neutra si va lejos. */
export function BadgeCumplimiento({ porcentaje }: { porcentaje: number }) {
  const variante = porcentaje >= 100 ? 'success' : porcentaje >= 80 ? 'warning' : 'outline';
  return <Badge variant={variante}>{porcentaje}%</Badge>;
}

const MEDIDAS: Array<{ value: Medida; label: string }> = [
  { value: 'dinero', label: 'Dinero' },
  { value: 'cantidad', label: 'Unidades' },
  { value: 'puntos', label: 'Puntos' },
];

const real = (fila: FilaCumplimiento, medida: Medida) =>
  medida === 'dinero'
    ? fila.realDinero
    : medida === 'cantidad'
      ? fila.realCantidad
      : fila.realPuntos;

const meta = (fila: FilaCumplimiento, medida: Medida) =>
  medida === 'dinero'
    ? fila.metaDinero
    : medida === 'cantidad'
      ? fila.metaCantidad
      : fila.metaPuntos;

const pct = (fila: FilaCumplimiento, medida: Medida) =>
  medida === 'dinero'
    ? fila.cumplimientoDinero
    : medida === 'cantidad'
      ? fila.cumplimientoCantidad
      : fila.cumplimientoPuntos;

const formatear = (valor: number, medida: Medida) =>
  medida === 'dinero' ? formatoMonedaCorta(valor) : formatoNumero(valor);

/** Sección completa de cumplimiento del tablero. */
export function SeccionCumplimiento({
  datos,
  medida,
  onMedidaChange,
  periodo,
  onPeriodoChange,
}: {
  datos?: Cumplimiento;
  medida: Medida;
  onMedidaChange: (medida: Medida) => void;
  periodo: { desde?: string; hasta?: string };
  onPeriodoChange: (periodo: { desde?: string; hasta?: string }) => void;
}) {
  const totales = datos?.totales;

  return (
    <div className="flex flex-col gap-4">
      <Card className="py-4">
        <CardContent className="flex flex-wrap items-end gap-3">
          {/* Recorta cada lado por su propia fecha: las ventas por cuándo
              ocurrieron y las metas por el periodo que representan. */}
          <Field className="min-w-40 flex-1">
            <FieldLabel htmlFor="cumpl-desde">Periodo desde</FieldLabel>
            <Input
              id="cumpl-desde"
              type="date"
              value={periodo.desde ?? ''}
              onChange={(e) => onPeriodoChange({ ...periodo, desde: e.target.value })}
            />
          </Field>
          <Field className="min-w-40 flex-1">
            <FieldLabel htmlFor="cumpl-hasta">Hasta</FieldLabel>
            <Input
              id="cumpl-hasta"
              type="date"
              value={periodo.hasta ?? ''}
              onChange={(e) => onPeriodoChange({ ...periodo, hasta: e.target.value })}
            />
          </Field>
          <Button
            variant="ghost"
            disabled={!periodo.desde && !periodo.hasta}
            onClick={() => onPeriodoChange({})}
          >
            Todo el histórico
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Cumplimiento en dinero"
          value={`${totales?.cumplimientoDinero ?? 0}%`}
          hint={`${formatoMonedaCorta(totales?.realDinero ?? 0)} de ${formatoMonedaCorta(
            totales?.metaDinero ?? 0,
          )}`}
        >
          <BarraCumplimiento porcentaje={totales?.cumplimientoDinero ?? 0} />
        </Kpi>
        <Kpi
          label="Cumplimiento en unidades"
          value={`${totales?.cumplimientoCantidad ?? 0}%`}
          hint={`${formatoNumero(totales?.realCantidad ?? 0)} de ${formatoNumero(
            totales?.metaCantidad ?? 0,
          )}`}
        >
          <BarraCumplimiento porcentaje={totales?.cumplimientoCantidad ?? 0} />
        </Kpi>
        <Kpi
          label="Cumplimiento en puntos"
          value={`${totales?.cumplimientoPuntos ?? 0}%`}
          hint={`${formatoNumero(totales?.realPuntos ?? 0)} de ${formatoNumero(
            totales?.metaPuntos ?? 0,
          )}`}
        >
          <BarraCumplimiento porcentaje={totales?.cumplimientoPuntos ?? 0} />
        </Kpi>
        <Kpi
          label="Inventario"
          value={formatoNumero(totales?.inventarioUnidades ?? 0)}
          hint={`Cobertura ${totales?.cobertura ?? 0}× sobre lo vendido · ${formatoNumero(
            totales?.inventarioRegistros ?? 0,
          )} registros`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cumplimiento contra la meta</CardTitle>
          <CardDescription>
            Cada barra llega hasta el 100%; el número muestra el valor real, incluso si se pasó.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Tabs value={medida} onValueChange={(v) => onMedidaChange((v as Medida) ?? 'dinero')}>
            <TabsList>
              {MEDIDAS.map((opcion) => (
                <TabsTrigger key={opcion.value} value={opcion.value}>
                  {opcion.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {MEDIDAS.map((opcion) => (
              <TabsContent key={opcion.value} value={opcion.value}>
                <Tabs defaultValue="puntos-venta">
                  <TabsList>
                    <TabsTrigger value="puntos-venta">Puntos de venta</TabsTrigger>
                    <TabsTrigger value="marca">Marcas</TabsTrigger>
                    <TabsTrigger value="producto">Productos</TabsTrigger>
                  </TabsList>
                  <TabsContent value="puntos-venta">
                    <ListaCumplimiento filas={datos?.porPuntoVenta ?? []} medida={opcion.value} />
                  </TabsContent>
                  <TabsContent value="marca">
                    <ListaCumplimiento filas={datos?.porMarca ?? []} medida={opcion.value} />
                  </TabsContent>
                  <TabsContent value="producto">
                    <ListaCumplimiento filas={datos?.porProducto ?? []} medida={opcion.value} />
                  </TabsContent>
                </Tabs>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function ListaCumplimiento({ filas, medida }: { filas: FilaCumplimiento[]; medida: Medida }) {
  if (filas.length === 0) {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        Sin metas ni ventas para este corte. Carga las metas para poder medir cumplimiento.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4 pt-4">
      {filas.map((fila) => (
        <div key={fila.key} className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="truncate text-sm font-medium">{fila.label}</span>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm tabular-nums text-muted-foreground">
                {formatear(real(fila, medida), medida)} de {formatear(meta(fila, medida), medida)}
              </span>
              <BadgeCumplimiento porcentaje={pct(fila, medida)} />
            </div>
          </div>
          <BarraCumplimiento porcentaje={pct(fila, medida)} />
          <span className="text-xs text-muted-foreground">
            {formatoNumero(fila.inventario)} unidades en inventario
            {medida === 'dinero' && ` · ${formatoMoneda(fila.realDinero)} vendidos`}
          </span>
        </div>
      ))}
    </div>
  );
}
