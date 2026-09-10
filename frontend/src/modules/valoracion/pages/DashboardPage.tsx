import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import {
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
import type { Agrupacion, FilaConsolidada, Segmentacion } from '../api';
import { useDashboard } from '../hooks';
import { FiltrosSegmentacion } from '../components/Filtros';
import { Encabezado, Kpi, Tendencia } from '../components/Piezas';
import { BarraNivel, NivelBadge } from '../components/Semaforo';

const configuracionGrafico = {
  average: { label: 'Promedio', color: 'var(--chart-1)' },
} satisfies ChartConfig;

/** Foto de la compañía: siempre sobre el consolidado, nunca sobre calificaciones sueltas. */
export default function DashboardPage() {
  const [filtros, setFiltros] = useState<Segmentacion>({});
  const { data, isLoading } = useDashboard(filtros);

  const evolucion = (data?.evolution ?? []).map((punto) => ({
    ciclo: punto.cycle,
    average: punto.average,
    count: punto.count,
  }));

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="Dashboard organizacional"
        descripcion="Cada persona cuenta una vez: los números se calculan sobre su consolidado."
      />

      <FiltrosSegmentacion filtros={filtros} onChange={setFiltros} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Promedio compañía" value={`${data?.companyAverage ?? 0}%`}>
          {data && (
            <>
              <BarraNivel
                porcentaje={data.companyAverage}
                nivel={data.companyLevel}
                className="mt-1"
              />
              <NivelBadge nivel={data.companyLevel} className="mt-1" />
            </>
          )}
        </Kpi>
        <Kpi
          label="Personas evaluadas"
          value={data?.totals.people ?? 0}
          hint={`${data?.totals.ratings ?? 0} calificaciones en ${data?.totals.cycles ?? 0} ciclo(s)`}
        />
        <Kpi
          label="Promedio de líderes"
          value={`${data?.leadersAverage ?? 0}%`}
          hint={`${data?.leadersCount ?? 0} líder(es)`}
        />
        <Kpi
          label="Evolución"
          value={data?.evolution.length ? `${data.evolution.at(-1)?.average}%` : '—'}
          hint={<Tendencia valor={data?.trend ?? 0} />}
        />
      </div>

      {evolucion.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Promedio de la compañía por ciclo</CardTitle>
            <CardDescription>
              Cada punto es el promedio de los resultados consolidados de ese ciclo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={configuracionGrafico} className="h-64 w-full">
              <LineChart data={evolucion} margin={{ left: 4, right: 24, top: 8, bottom: 4 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="ciclo"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  className="text-xs"
                />
                <YAxis
                  domain={[0, 100]}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  width={36}
                  unit="%"
                  className="text-xs"
                />
                <ChartTooltip cursor content={<ChartTooltipContent />} />
                <Line
                  dataKey="average"
                  type="monotone"
                  stroke="var(--color-average)"
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
        <Card>
          <CardHeader>
            <CardTitle>Distribución del semáforo</CardTitle>
            <CardDescription>
              Cuántas personas están en cada nivel, sobre su consolidado.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {(data?.distribution ?? []).map((tramo) => (
              <div key={tramo.level} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <NivelBadge nivel={tramo.level} />
                  <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                    {tramo.count} · {tramo.percentage}%
                  </span>
                </div>
                <BarraNivel porcentaje={tramo.percentage} nivel={tramo.level} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Resultado por competencia</CardTitle>
            <CardDescription>Dónde está fuerte y dónde floja la organización.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {(data?.competencies ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Sin resultados consolidados todavía.</p>
            )}
            {(data?.competencies ?? []).map((competencia) => (
              <div key={competencia.label} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium">{competencia.label}</span>
                  <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                    {competencia.average} / 5 · {competencia.percentage}%
                  </span>
                </div>
                <BarraNivel porcentaje={competencia.percentage} nivel={competencia.level} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Promedio por segmento</CardTitle>
          <CardDescription>El mismo consolidado, agrupado por dimensión.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="area">
            <TabsList>
              <TabsTrigger value="area">Área</TabsTrigger>
              <TabsTrigger value="equipo">Equipo</TabsTrigger>
              <TabsTrigger value="rol">Rol</TabsTrigger>
              <TabsTrigger value="cargo">Cargo</TabsTrigger>
            </TabsList>
            <TabsContent value="area">
              <ListaAgrupacion filas={data?.byArea ?? []} />
            </TabsContent>
            <TabsContent value="equipo">
              <ListaAgrupacion filas={data?.byTeam ?? []} />
            </TabsContent>
            <TabsContent value="rol">
              <ListaAgrupacion filas={data?.byKind ?? []} />
            </TabsContent>
            <TabsContent value="cargo">
              <ListaAgrupacion filas={data?.byPosition ?? []} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <ListaPersonas
          titulo="Top performers"
          descripcion="Las ocho personas con el consolidado más alto."
          filas={data?.topPerformers ?? []}
        />
        <ListaPersonas
          titulo="Mayores brechas"
          descripcion="Dónde hay que poner el foco de acompañamiento."
          filas={data?.lowestPerformers ?? []}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Fortalezas recurrentes</CardTitle>
            <CardDescription>Ítems que aparecen como fortaleza en más personas.</CardDescription>
          </CardHeader>
          <CardContent>
            <ListaConteo items={data?.topStrengths ?? []} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Brechas recurrentes</CardTitle>
            <CardDescription>Los ítems que más se repiten como brecha.</CardDescription>
          </CardHeader>
          <CardContent>
            <ListaConteo items={data?.topGaps ?? []} />
          </CardContent>
        </Card>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Calculando…</p>}
    </div>
  );
}

function ListaAgrupacion({ filas }: { filas: Agrupacion[] }) {
  if (filas.length === 0) {
    return <p className="py-6 text-sm text-muted-foreground">Sin datos para esta dimensión.</p>;
  }
  return (
    <div className="flex flex-col gap-3 pt-4">
      {filas.map((fila) => (
        <div key={`${fila.key}`} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium">{fila.label}</span>
            <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
              {fila.average}% · {fila.count} persona{fila.count === 1 ? '' : 's'}
            </span>
          </div>
          <BarraNivel porcentaje={fila.average} nivel={fila.level} />
        </div>
      ))}
    </div>
  );
}

function ListaPersonas({
  titulo,
  descripcion,
  filas,
}: {
  titulo: string;
  descripcion: string;
  filas: FilaConsolidada[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
        <CardDescription>{descripcion}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {filas.length === 0 && (
          <p className="text-sm text-muted-foreground">Sin resultados consolidados.</p>
        )}
        {filas.map((fila) => (
          <Link
            key={fila.personId}
            to={`/inicio/valoracion/dashboard/persona/${fila.personId}`}
            className="flex flex-col gap-1.5 rounded-lg p-2 transition-colors hover:bg-muted"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium">{fila.person}</span>
              <span className="shrink-0 text-sm tabular-nums">{fila.percentage}%</span>
            </div>
            <BarraNivel porcentaje={fila.percentage} nivel={fila.level} />
            <span className="text-xs text-muted-foreground">
              {fila.area} · {fila.position} · {fila.evaluations} calificación(es)
            </span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function ListaConteo({ items }: { items: Array<{ statement: string; count: number }> }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Sin datos aún.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.statement} className="flex items-start justify-between gap-3 text-sm">
          <span>{item.statement}</span>
          <span className="shrink-0 tabular-nums text-muted-foreground">{item.count}</span>
        </li>
      ))}
    </ul>
  );
}
