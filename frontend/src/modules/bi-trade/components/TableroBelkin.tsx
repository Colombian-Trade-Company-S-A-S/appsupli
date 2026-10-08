import { useMemo, useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { MegaphoneIcon, SheetIcon } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type ChartConfig,
} from '@/shared/components/ui';
import { Encabezado, Kpi } from '@/shared/components/layout';
import { formatoFechaHora, formatoMoneda, formatoNumero } from '@/shared/lib/formato';
import type { FiltrosBelkin, FuenteTableroBelkin, PromotorBelkin } from '../api';
import { useDescarga, useTableroBelkin } from '../hooks';
import { PLANES } from '../planes';
import { CampoSelect } from './CampoSelect';
import { ACCION_TARJETA } from './estilos';

/** Lo que no se puede bajar: el enlace público no trae `exportarPuntos`. */
const sinExportar: (filtros: FiltrosBelkin) => Promise<unknown> = () =>
  Promise.reject(new Error('Este tablero es de solo lectura.'));

/**
 * Las dos series van en la misma escala porque las dos son unidades. Los
 * colores pasan el validador de la guía de gráficos en claro y en oscuro: el
 * par `--chart-1` / `--chart-2` quedaba muy cerca en modo claro.
 */
const configuracionDia = {
  recomendaciones: { label: 'Recomendaciones', color: 'var(--chart-1)' },
  ventas: { label: 'Ventas Claro', theme: { light: '#0096af', dark: '#21a3bc' } },
} satisfies ChartConfig;

const configuracionCategoria = {
  recomendaciones: { label: 'Recomendaciones', color: 'var(--chart-1)' },
} satisfies ChartConfig;

/** `2026-09-21` → `21 sep`, sin pasar por UTC: si no, en Colombia sería el 20. */
const diaCorto = (fecha: string) =>
  new Date(`${fecha}T00:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });

/**
 * El tablero del plan Recomiéndame Belkin.
 *
 * Es el informe que Trade armaba en Power BI —recomendaciones del mes contra
 * lo que vendió Claro, y el bono de cada promotor según la categoría de su
 * punto—, pero sobre lo que vive en la app: el formulario para los puntos de
 * Coltrade y el informe de ventas de Claro para los de fuera.
 *
 * Lo usan la app y el enlace público. Lo único que cambia es la `fuente`: de
 * dónde salen los datos y si se puede bajar el Excel. Las `acciones` del
 * encabezado —formulario, listas, compartir— las pone solo la app.
 */
export function TableroBelkin({
  fuente,
  acciones,
}: {
  fuente: FuenteTableroBelkin;
  acciones?: ReactNode;
}) {
  const [filtros, setFiltros] = useState<FiltrosBelkin>({});
  const { data: tablero, isLoading } = useTableroBelkin(fuente, filtros);
  // El archivo trae todos los puntos del filtro, también los que están en cero.
  const exportar = useDescarga(
    fuente.exportarPuntos ?? sinExportar,
    'Puntos de venta descargados en Excel',
  );

  const totales = tablero?.totales;
  const periodo = tablero ? `${tablero.filtros.anio}-${tablero.filtros.mes}` : '';

  const opcionesPunto = useMemo(
    () =>
      (tablero?.opciones.puntos ?? [])
        .filter((p) => !filtros.regional || p.regional === filtros.regional)
        .map(({ value, label }) => ({ value, label })),
    [tablero?.opciones.puntos, filtros.regional],
  );

  const sinDatos = !isLoading && !totales?.recomendaciones && !totales?.ventas;

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo={PLANES.belkin.titulo}
        descripcion={`Recomendaciones, ventas y bono del mes · ${tablero?.filtros.periodo ?? ''}`}
      >
        {acciones}
      </Encabezado>

      <Card className="py-4">
        <CardContent className="flex flex-wrap items-end gap-3">
          <CampoSelect
            id="tb-periodo"
            label="Periodo"
            placeholder="Mes"
            value={periodo}
            onChange={(valor) => {
              const [anio, mes] = valor.split('-').map(Number);
              setFiltros({ ...filtros, anio, mes });
            }}
            opciones={(tablero?.periodos ?? []).map((p) => ({
              value: `${p.anio}-${p.mes}`,
              label: p.label,
            }))}
            incluirTodas={false}
          />
          <CampoSelect
            id="tb-regional"
            label="Regional"
            placeholder="Todas"
            value={filtros.regional ?? ''}
            onChange={(regional) => setFiltros({ ...filtros, regional, punto: '' })}
            opciones={tablero?.opciones.regionales ?? []}
          />
          <CampoSelect
            id="tb-punto"
            label="Punto de venta"
            placeholder="Todos"
            value={filtros.punto ?? ''}
            onChange={(punto) => setFiltros({ ...filtros, punto })}
            opciones={opcionesPunto}
          />
          <Button
            variant="ghost"
            onClick={() => setFiltros({ anio: filtros.anio, mes: filtros.mes })}
          >
            Limpiar
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Recomendaciones"
          value={formatoNumero(totales?.recomendaciones ?? 0)}
          cargando={isLoading}
          hint={`${formatoNumero(totales?.formulario ?? 0)} del formulario · ${formatoNumero(
            totales?.informe ?? 0,
          )} del informe`}
        />
        <Kpi
          label="Bono del mes"
          value={formatoMoneda(totales?.bono ?? 0)}
          cargando={isLoading}
          hint={`${formatoNumero(totales?.promotoresConBono ?? 0)} de ${formatoNumero(
            totales?.promotores ?? 0,
          )} promotores ganan bono`}
        />
        <Kpi
          label="Ventas Belkin en Claro"
          value={formatoNumero(totales?.ventas ?? 0)}
          cargando={isLoading}
          hint={
            totales?.ventasHasta
              ? `Cargadas hasta el ${diaCorto(totales.ventasHasta)}`
              : 'Aún no hay ventas cargadas en el mes'
          }
        />
        <Kpi
          label="Puntos con registros"
          value={formatoNumero(totales?.puntos ?? 0)}
          cargando={isLoading}
          hint={`Último registro: ${formatoFechaHora(totales?.ultimoRegistro)}`}
        />
      </div>

      {sinDatos && (
        <Card>
          <CardContent>
            <Empty className="py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MegaphoneIcon />
                </EmptyMedia>
                <EmptyTitle>Sin datos para este periodo</EmptyTitle>
                <EmptyDescription>
                  Las recomendaciones llegan del formulario y, para los puntos fuera de Coltrade,
                  del informe de ventas que se importa en BI Claro.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recomendaciones y ventas por día</CardTitle>
          <CardDescription>
            Lo recomendado contra lo que Claro vendió de los productos del plan en los mismos
            puntos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={configuracionDia} className="h-72 w-full">
            <LineChart data={tablero?.porDia ?? []} margin={{ left: 4, right: 12, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="fecha"
                tickLine={false}
                axisLine={false}
                fontSize={11}
                minTickGap={8}
                tickFormatter={(valor: string) => String(Number(valor.slice(8)))}
              />
              <YAxis tickLine={false} axisLine={false} width={36} fontSize={11} />
              <ChartTooltip
                content={
                  <ChartTooltipContent labelFormatter={(valor) => diaCorto(String(valor))} />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Line
                dataKey="recomendaciones"
                stroke="var(--color-recomendaciones)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                type="monotone"
              />
              <Line
                dataKey="ventas"
                stroke="var(--color-ventas)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                type="monotone"
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bono por promotor</CardTitle>
          <CardDescription>
            Lo que registró cada promotor en su punto en el mes y el bono que le da, según la
            categoría del punto. Ordenado por bono.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <div className="max-h-[36rem] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">#</TableHead>
                  <TableHead>Promotor</TableHead>
                  <TableHead className="hidden text-center sm:table-cell">Categoría</TableHead>
                  <TableHead className="text-right">Recomendaciones</TableHead>
                  <TableHead className="text-right">Bono</TableHead>
                  <TableHead className="hidden pr-6 text-right md:table-cell">
                    Para el siguiente
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(tablero?.promotores ?? []).map((fila, indice) => (
                  <TableRow key={`${fila.codigo}-${fila.idAsesor ?? 'sin'}`}>
                    <TableCell className="pl-6 text-muted-foreground tabular-nums">
                      {indice + 1}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className={fila.asesor ? 'font-medium' : 'text-muted-foreground'}>
                          {fila.asesor || 'Sin asesor'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {fila.punto} · {fila.codigo}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-center tabular-nums sm:table-cell">
                      {fila.categoria ?? '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatoNumero(fila.recomendaciones)}
                      {fila.informe > 0 && (
                        <span className="block text-xs text-muted-foreground">
                          {fila.formulario > 0
                            ? `${formatoNumero(fila.informe)} del informe`
                            : 'del informe'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {fila.bono ? formatoMoneda(fila.bono) : '—'}
                    </TableCell>
                    <TableCell className="hidden pr-6 text-right md:table-cell">
                      <Siguiente fila={fila} tope={tablero?.topeBono ?? 0} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Qué se recomienda</CardTitle>
            <CardDescription>Recomendaciones del mes por categoría de producto.</CardDescription>
          </CardHeader>
          <CardContent>
            {(tablero?.porCategoria ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin recomendaciones en el periodo.</p>
            ) : (
              <ChartContainer
                config={configuracionCategoria}
                className="w-full"
                style={{ height: Math.max(120, (tablero?.porCategoria.length ?? 0) * 44) }}
              >
                <BarChart
                  data={tablero?.porCategoria ?? []}
                  layout="vertical"
                  margin={{ left: 4, right: 40 }}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="categoria"
                    tickLine={false}
                    axisLine={false}
                    width={96}
                    fontSize={12}
                  />
                  <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                  <Bar
                    dataKey="recomendaciones"
                    fill="var(--color-recomendaciones)"
                    radius={[0, 4, 4, 0]}
                    barSize={22}
                    label={{
                      position: 'right',
                      fontSize: 12,
                      className: 'fill-muted-foreground tabular-nums',
                    }}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cómo se gana el bono</CardTitle>
            <CardDescription>
              Las recomendaciones del mes se reparten en paquetes, del más alto al más bajo; lo que
              no completa un paquete no paga. Tope de {formatoMoneda(tablero?.topeBono ?? 0)} por
              promotor.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Paquete</TableHead>
                  {(tablero?.escalones ?? []).map((c) => (
                    <TableHead key={c.categoria} className="pr-6 text-right">
                      Categoría {c.categoria}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(tablero?.escalones[0]?.escalones ?? []).map((escalon, i) => (
                  <TableRow key={escalon.valor}>
                    <TableCell className="pl-6 font-medium tabular-nums">
                      {formatoMoneda(escalon.valor)}
                    </TableCell>
                    {(tablero?.escalones ?? []).map((c) => (
                      <TableCell key={c.categoria} className="pr-6 text-right tabular-nums">
                        {c.escalones[i].recomendaciones}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recomendado contra vendido, por punto</CardTitle>
          <CardDescription>
            En los puntos de Coltrade, las ventas son las que Claro reporta de los productos del
            plan. En los de fuera, lo vendido es lo mismo que cuenta para su bono.
          </CardDescription>
          {fuente.exportarPuntos && (
            <CardAction className={ACCION_TARJETA}>
              <Button
                variant="outline"
                size="sm"
                disabled={!tablero || exportar.isPending}
                onClick={() =>
                  tablero &&
                  exportar.mutate({
                    anio: tablero.filtros.anio,
                    mes: tablero.filtros.mes,
                    regional: filtros.regional,
                    punto: filtros.punto,
                  })
                }
              >
                {exportar.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <SheetIcon data-icon="inline-start" />
                )}
                Descargar Excel
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="px-0">
          <div className="max-h-[32rem] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Punto de venta</TableHead>
                  <TableHead className="hidden md:table-cell">Regional</TableHead>
                  <TableHead className="hidden text-center sm:table-cell">Categoría</TableHead>
                  <TableHead className="text-right">Recomendaciones</TableHead>
                  <TableHead className="text-right">Ventas Claro</TableHead>
                  <TableHead className="hidden pr-6 text-right sm:table-cell">Bono</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(tablero?.porPunto ?? []).map((fila) => (
                  <TableRow key={fila.codigo}>
                    <TableCell className="pl-6">
                      {fila.punto}
                      <span className="text-muted-foreground"> · {fila.codigo}</span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant={fila.fueraDeColtrade ? 'outline' : 'secondary'}>
                        {fila.regional}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden text-center tabular-nums sm:table-cell">
                      {fila.categoria ?? '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatoNumero(fila.recomendaciones)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatoNumero(fila.ventas)}
                    </TableCell>
                    <TableCell className="hidden pr-6 text-right tabular-nums sm:table-cell">
                      {fila.bono ? formatoMoneda(fila.bono) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** Cuánto le falta al promotor para que el bono suba, o por qué no sube más. */
function Siguiente({ fila, tope }: { fila: PromotorBelkin; tope: number }) {
  if (fila.siguiente) {
    return (
      <span className="text-sm tabular-nums">
        {formatoNumero(fila.siguiente.faltan)} más{' '}
        <span className="text-muted-foreground">→ {formatoMoneda(fila.siguiente.bono)}</span>
      </span>
    );
  }
  if (fila.categoria === null) {
    return <span className="text-sm text-muted-foreground">Punto sin categoría</span>;
  }
  return fila.bono >= tope ? <Badge variant="success">Tope</Badge> : null;
}
