import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { PackageIcon, ReceiptTextIcon, StoreIcon } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type ChartConfig,
} from '@/shared/components/ui';
import { BarraProporcion, Encabezado, Kpi } from '@/shared/components/layout';
import { formatoMes, formatoMoneda, formatoMonedaCorta, formatoNumero } from '@/shared/lib/formato';
import type { Corte } from '../api';
import { useDashboard, useOpciones } from '../hooks';
import { CampoSelect } from '../components/CampoSelect';

const BASE = '/inicio/bi-trade/claro';

// Una sola serie: el título la nombra, así que no hace falta leyenda.
const configuracionGrafico = {
  ingresos: { label: 'Ingresos', color: 'var(--chart-1)' },
} satisfies ChartConfig;

/** Tablero de BI Claro punto de venta. */
export default function ClaroDashboardPage() {
  const [filtros, setFiltros] = useState<{ regional?: string; marca?: string }>({});
  const { data, isLoading } = useDashboard(filtros);
  const { data: opciones } = useOpciones();

  const evolucion = (data?.evolucion ?? []).map((punto) => ({
    mes: formatoMes(punto.mes),
    ingresos: punto.ingresos,
    unidades: punto.unidades,
  }));

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="BI Claro punto de venta"
        descripcion="Ventas por punto de venta, marca y regional."
      >
        <Button variant="outline" render={<Link to={`${BASE}/ventas`} />}>
          <ReceiptTextIcon data-icon="inline-start" />
          Ventas
        </Button>
        <Button variant="outline" render={<Link to={`${BASE}/puntos-venta`} />}>
          <StoreIcon data-icon="inline-start" />
          Puntos de venta
        </Button>
        <Button variant="outline" render={<Link to={`${BASE}/productos`} />}>
          <PackageIcon data-icon="inline-start" />
          Productos
        </Button>
      </Encabezado>

      <Card className="py-4">
        <CardContent className="flex flex-wrap items-end gap-3">
          <CampoSelect
            id="filtro-regional"
            label="Regional"
            placeholder="Todas las regionales"
            value={filtros.regional ?? ''}
            onChange={(v) => setFiltros({ ...filtros, regional: v })}
            opciones={(opciones?.regionales ?? []).map((r) => ({ value: r.value, label: r.label }))}
          />
          <CampoSelect
            id="filtro-marca"
            label="Marca"
            placeholder="Todas las marcas"
            value={filtros.marca ?? ''}
            onChange={(v) => setFiltros({ ...filtros, marca: v })}
            opciones={(opciones?.marcas ?? []).map((m) => ({ value: m, label: m }))}
          />
          <Button
            variant="ghost"
            disabled={!filtros.regional && !filtros.marca}
            onClick={() => setFiltros({})}
          >
            Limpiar
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Ingresos"
          value={formatoMonedaCorta(data?.totales.ingresos ?? 0)}
          hint={formatoMoneda(data?.totales.ingresos ?? 0)}
        />
        <Kpi
          label="Unidades vendidas"
          value={formatoNumero(data?.totales.unidades ?? 0)}
          hint={`${formatoNumero(data?.totales.operaciones ?? 0)} operaciones`}
        />
        <Kpi
          label="Ticket promedio"
          value={formatoMonedaCorta(data?.totales.ticketPromedio ?? 0)}
          hint="Ingreso medio por venta"
        />
        <Kpi
          label="Cobertura"
          value={formatoNumero(data?.totales.puntosVenta ?? 0)}
          hint={`${formatoNumero(data?.totales.productos ?? 0)} productos en catálogo`}
        />
      </div>

      {evolucion.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Ingresos por mes</CardTitle>
            <CardDescription>Suma de unidades × precio Coltrade en cada mes.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={configuracionGrafico} className="h-64 w-full">
              <LineChart data={evolucion} margin={{ left: 4, right: 24, top: 8, bottom: 4 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="mes"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  className="text-xs"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  width={56}
                  className="text-xs"
                  tickFormatter={(valor: number) => formatoMonedaCorta(valor)}
                />
                <ChartTooltip
                  cursor
                  content={
                    <ChartTooltipContent formatter={(valor) => formatoMoneda(Number(valor))} />
                  }
                />
                <Line
                  dataKey="ingresos"
                  type="monotone"
                  stroke="var(--color-ingresos)"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <TarjetaCorte
          titulo="Ingresos por regional"
          descripcion="Cuánto aporta cada zona al total."
          filas={data?.porRegional ?? []}
        />
        <TarjetaCorte
          titulo="Ingresos por marca"
          descripcion="Qué marcas mueven el negocio."
          filas={data?.porMarca ?? []}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Rankings</CardTitle>
          <CardDescription>Los ocho primeros por ingresos.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="productos">
            <TabsList>
              <TabsTrigger value="productos">Productos</TabsTrigger>
              <TabsTrigger value="puntos">Puntos de venta</TabsTrigger>
              <TabsTrigger value="materiales">Materiales</TabsTrigger>
            </TabsList>
            <TabsContent value="productos">
              <ListaCorte filas={data?.topProductos ?? []} />
            </TabsContent>
            <TabsContent value="puntos">
              <ListaCorte filas={data?.topPuntosVenta ?? []} />
            </TabsContent>
            <TabsContent value="materiales">
              <ListaCorte filas={data?.materiales ?? []} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {isLoading && <p className="text-sm text-muted-foreground">Calculando…</p>}
    </div>
  );
}

function TarjetaCorte({
  titulo,
  descripcion,
  filas,
}: {
  titulo: string;
  descripcion: string;
  filas: Corte[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
        <CardDescription>{descripcion}</CardDescription>
      </CardHeader>
      <CardContent>
        <ListaCorte filas={filas} />
      </CardContent>
    </Card>
  );
}

function ListaCorte({ filas }: { filas: Corte[] }) {
  if (filas.length === 0) {
    return <p className="py-6 text-sm text-muted-foreground">Sin ventas para este corte.</p>;
  }
  return (
    <div className="flex flex-col gap-3 pt-4">
      {filas.map((fila) => (
        <div key={fila.key} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-sm font-medium">{fila.label}</span>
            <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
              {formatoMonedaCorta(fila.ingresos)} · {fila.participacion}%
            </span>
          </div>
          <BarraProporcion porcentaje={fila.participacion} />
          <span className="text-xs text-muted-foreground">
            {formatoNumero(fila.unidades)} unidades en {formatoNumero(fila.operaciones)} ventas
          </span>
        </div>
      ))}
    </div>
  );
}
