import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts';
import {
  ArrowLeftIcon,
  ClipboardListIcon,
  DownloadIcon,
  TargetIcon,
  UploadIcon,
} from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Field,
  FieldLabel,
  Input,
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
import { formatoMonedaCorta, formatoNumero } from '@/shared/lib/formato';
import { useAuth } from '@/core/auth';
import { partnersTableroApi, type FiltrosPartners, type ResultadoMetas } from '../api';
import { CampoSelect } from '../components/CampoSelect';
import { BadgeCumplimiento, BarraCumplimiento } from '../components/Cumplimiento';
import {
  useBiTradeMutation,
  useDescarga,
  useOpcionesPartners,
  usePeriodosPartners,
  useTableroPartners,
} from '../hooks';

/** Unidades y meta van en la misma escala; el % vive en las tarjetas de arriba. */
const configuracionMarca = {
  unidades: { label: 'Registradas', color: 'var(--chart-1)' },
  meta: { label: 'Meta', color: 'var(--chart-3)' },
} satisfies ChartConfig;

const configuracionDia = {
  unidades: { label: 'Registradas', color: 'var(--chart-1)' },
} satisfies ChartConfig;

const PERMISO = 'bi-trade:data:manage';

// El mes de arranque del tablero. Fuera del render: si se calculara adentro,
// sería un objeto nuevo en cada pasada y los `useMemo` se recalcularían siempre.
const ANIO_ACTUAL = new Date().getFullYear();
const MES_ACTUAL = new Date().getMonth() + 1;

/**
 * El tablero del plan Partners.
 *
 * Es el mismo informe que Trade veía en Power BI, pero armado sobre lo que la
 * gente registra en el formulario: unidades contra la meta del mes, por marca,
 * regional, punto de venta y promotor. Las metas se suben con el Excel mensual.
 */
export default function PlanPartnersPage() {
  const { user } = useAuth();
  const puedeAdministrar = !!user?.isAdmin || !!user?.permissions.includes(PERMISO);
  const [filtros, setFiltros] = useState<FiltrosPartners>({
    anio: ANIO_ACTUAL,
    mes: MES_ACTUAL,
  });

  const { data: opciones } = useOpcionesPartners();
  const { data: periodos = [] } = usePeriodosPartners();
  const { data: tablero, isLoading } = useTableroPartners(filtros);

  const totales = tablero?.totales;

  // Los meses con metas cargadas, más el año completo y el mes en curso.
  const periodosDisponibles = useMemo(() => {
    const actual = `${ANIO_ACTUAL}-${MES_ACTUAL}`;
    const opcionesPeriodo = periodos.map((p) => ({
      value: `${p.anio}-${p.mes}`,
      label: p.label,
    }));
    if (!opcionesPeriodo.some((o) => o.value === actual)) {
      opcionesPeriodo.unshift({ value: actual, label: 'Mes en curso' });
    }
    return [...opcionesPeriodo, { value: `${filtros.anio}-0`, label: `Todo ${filtros.anio}` }];
  }, [periodos, filtros.anio]);

  const puntos = useMemo(
    () =>
      (opciones?.puntosVenta ?? [])
        .filter((p) => !filtros.regional || String(p.idRegional) === filtros.regional)
        .map((p) => ({ value: p.value, label: p.label })),
    [opciones, filtros.regional],
  );

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="Plan Partners"
        descripcion={`Lo registrado en el formulario contra la meta del mes · ${
          tablero?.filtros.periodo ?? ''
        }`}
      >
        <Button variant="outline" render={<Link to="/inicio/bi-trade" />}>
          <ArrowLeftIcon data-icon="inline-start" />
          BI Trade
        </Button>
        <Button render={<Link to="/inicio/bi-trade/plan-partners/formulario" />}>
          <ClipboardListIcon data-icon="inline-start" />
          Formulario
        </Button>
        {puedeAdministrar && <SubirMetas />}
      </Encabezado>

      <Card className="py-4">
        <CardContent className="flex flex-wrap items-end gap-3">
          <CampoSelect
            id="tp-periodo"
            label="Periodo"
            placeholder="Mes"
            value={`${filtros.anio}-${filtros.mes}`}
            onChange={(valor) => {
              const [anio, mes] = valor.split('-').map(Number);
              setFiltros({ ...filtros, anio, mes });
            }}
            opciones={periodosDisponibles}
            incluirTodas={false}
          />
          <CampoSelect
            id="tp-regional"
            label="Regional"
            placeholder="Todas"
            value={filtros.regional ?? ''}
            onChange={(regional) => setFiltros({ ...filtros, regional, punto: '' })}
            opciones={(opciones?.regionales ?? []).map((r) => ({
              value: String(r.value),
              label: r.label,
            }))}
          />
          <CampoSelect
            id="tp-punto"
            label="Punto de venta"
            placeholder="Todos"
            value={filtros.punto ?? ''}
            onChange={(punto) => setFiltros({ ...filtros, punto })}
            opciones={puntos}
          />
          <CampoSelect
            id="tp-marca"
            label="Marca"
            placeholder="Todas"
            value={filtros.marca ?? ''}
            onChange={(marca) => setFiltros({ ...filtros, marca })}
            opciones={opciones?.marcas ?? []}
          />
          <Field className="min-w-44 flex-1">
            <FieldLabel htmlFor="tp-promotor">Promotor</FieldLabel>
            <Input
              id="tp-promotor"
              inputMode="numeric"
              placeholder="Documento"
              value={filtros.promotor ?? ''}
              onChange={(e) => setFiltros({ ...filtros, promotor: e.target.value })}
            />
          </Field>
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
          label="Cumplimiento"
          value={`${totales?.cumplimiento ?? 0}%`}
          hint={`${formatoNumero(totales?.unidades ?? 0)} de ${formatoNumero(totales?.meta ?? 0)} unidades`}
        >
          <BarraCumplimiento porcentaje={totales?.cumplimiento ?? 0} />
        </Kpi>
        <Kpi
          label="Unidades registradas"
          value={formatoNumero(totales?.unidades ?? 0)}
          hint={`${formatoMonedaCorta(totales?.valor ?? 0)} en producto`}
        />
        <Kpi
          label="Falta para la meta"
          value={formatoNumero(totales?.faltante ?? 0)}
          hint={
            (totales?.sobrecumplimiento ?? 0) > 0
              ? `${formatoNumero(totales?.sobrecumplimiento ?? 0)} por encima de la meta`
              : `Meta del periodo: ${formatoNumero(totales?.meta ?? 0)}`
          }
        />
        <Kpi
          label="Promotores activos"
          value={formatoNumero(totales?.promotores ?? 0)}
          hint={`${formatoNumero(totales?.puntos ?? 0)} punto(s) de venta con registros`}
        />
      </div>

      {!isLoading && (totales?.unidades ?? 0) === 0 && (totales?.meta ?? 0) === 0 && (
        <Card>
          <CardContent>
            <Empty className="py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <TargetIcon />
                </EmptyMedia>
                <EmptyTitle>Sin datos para este periodo</EmptyTitle>
                <EmptyDescription>
                  Sube las metas del mes y registra recomendaciones en el formulario para ver el
                  tablero.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cumplimiento por marca</CardTitle>
            <CardDescription>Lo registrado contra la meta de cada marca.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={configuracionMarca} className="h-72 w-full">
              <ComposedChart data={tablero?.porMarca ?? []} margin={{ left: 4, right: 4 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="marca" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} width={44} fontSize={11} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="unidades" fill="var(--color-unidades)" radius={4} />
                <Line
                  dataKey="meta"
                  stroke="var(--color-meta)"
                  strokeWidth={2}
                  dot={false}
                  type="monotone"
                />
              </ComposedChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Registros por día</CardTitle>
            <CardDescription>Cómo se repartió el mes, día a día.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={configuracionDia} className="h-72 w-full">
              <AreaChart data={tablero?.porDia ?? []} margin={{ left: 4, right: 4 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="fecha"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  tickFormatter={(valor: string) => valor.slice(8)}
                />
                <YAxis tickLine={false} axisLine={false} width={36} fontSize={11} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  dataKey="unidades"
                  stroke="var(--color-unidades)"
                  fill="var(--color-unidades)"
                  fillOpacity={0.2}
                  type="monotone"
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TablaCorte
          titulo="Por regional"
          descripcion="El cumplimiento de cada zona."
          encabezado="Regional"
          filas={(tablero?.porRegional ?? []).map((fila) => ({
            key: fila.regional,
            etiqueta: fila.regional,
            ...fila,
          }))}
        />
        <TablaCorte
          titulo="Top puntos de venta"
          descripcion="Los diez CAV con más registros en el periodo."
          encabezado="Punto de venta"
          filas={(tablero?.porPunto ?? []).slice(0, 10).map((fila) => ({
            key: fila.codigo,
            etiqueta: `${fila.punto} · ${fila.codigo}`,
            ...fila,
          }))}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ranking de promotores</CardTitle>
          <CardDescription>
            Quién más registró en el periodo. Las metas no se reparten por persona, así que aquí no
            hay cumplimiento.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">#</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead className="text-right">Unidades</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Puntos</TableHead>
                <TableHead className="hidden pr-6 text-right sm:table-cell">Marcas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(tablero?.porPromotor ?? []).map((fila, indice) => (
                <TableRow key={fila.documento}>
                  <TableCell className="pl-6 text-muted-foreground">{indice + 1}</TableCell>
                  <TableCell className="tabular-nums">{fila.documento}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatoNumero(fila.unidades)}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {fila.puntos}
                  </TableCell>
                  <TableCell className="hidden pr-6 text-right tabular-nums sm:table-cell">
                    {fila.marcas}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Detalle por punto de venta y marca</CardTitle>
          <CardDescription>
            La misma tabla del informe: cada CAV con su marca, lo registrado y lo que falta.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <div className="max-h-[32rem] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Punto de venta</TableHead>
                  <TableHead>Marca</TableHead>
                  <TableHead className="text-right">Unidades</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Meta</TableHead>
                  <TableHead className="text-right">Cumple</TableHead>
                  <TableHead className="hidden pr-6 text-right sm:table-cell">Falta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(tablero?.detalle ?? []).map((fila) => (
                  <TableRow key={`${fila.codigo}-${fila.marca}`}>
                    <TableCell className="pl-6">
                      {fila.punto}
                      <span className="text-muted-foreground"> · {fila.codigo}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{fila.marca}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatoNumero(fila.unidades)}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">
                      {formatoNumero(fila.meta)}
                    </TableCell>
                    <TableCell className="text-right">
                      <BadgeCumplimiento porcentaje={fila.cumplimiento} />
                    </TableCell>
                    <TableCell className="hidden pr-6 text-right tabular-nums sm:table-cell">
                      {formatoNumero(fila.faltante)}
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

/** Una tabla de cortes del tablero: etiqueta, unidades, meta y cumplimiento. */
function TablaCorte({
  titulo,
  descripcion,
  encabezado,
  filas,
}: {
  titulo: string;
  descripcion: string;
  encabezado: string;
  filas: Array<{
    key: string;
    etiqueta: string;
    unidades: number;
    meta: number;
    cumplimiento: number;
  }>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
        <CardDescription>{descripcion}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {filas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin datos para este corte.</p>
        ) : (
          filas.map((fila) => (
            <div key={fila.key} className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium">{fila.etiqueta}</span>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {formatoNumero(fila.unidades)} de {formatoNumero(fila.meta)}
                  </span>
                  <BadgeCumplimiento porcentaje={fila.cumplimiento} />
                </div>
              </div>
              <BarraCumplimiento porcentaje={fila.cumplimiento} />
              <span className="sr-only">{encabezado}</span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Carga del Excel mensual de metas.
 *
 * Es el archivo que Trade ya arma: se sube tal cual. Lo que el archivo traiga y
 * no esté en el catálogo del formulario se omite y se lista, para decidir si
 * hay que agregarlo.
 */
function SubirMetas() {
  const [abierto, setAbierto] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [resultado, setResultado] = useState<ResultadoMetas | null>(null);

  const subir = useBiTradeMutation(
    (elegido: File) => partnersTableroApi.metas.importar(elegido),
    (datos) => datos.message,
  );
  const plantilla = useDescarga(
    () => partnersTableroApi.metas.descargarPlantilla(),
    'Plantilla descargada',
  );

  return (
    <>
      <Button variant="outline" onClick={() => setAbierto(true)}>
        <TargetIcon data-icon="inline-start" />
        Subir metas
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Metas del mes</DialogTitle>
            <DialogDescription>
              Sube el Excel de metas tal como lo armas: MES, AÑO, CENTRO DE COSTOS, META, MARCA y
              PUNTO DE VENTA. Si ese mes ya estaba cargado, las filas lo actualizan.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="metas-archivo">Archivo .xlsx</FieldLabel>
              <Input
                id="metas-archivo"
                type="file"
                accept=".xlsx"
                onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              />
            </Field>

            {resultado && (
              <Alert>
                <AlertTitle>{resultado.message}</AlertTitle>
                <AlertDescription>
                  <div className="flex flex-col gap-1 text-sm">
                    {resultado.periodos.length > 0 && (
                      <span>
                        Meses cargados: {resultado.periodos.map((p) => p.label).join(', ')}
                      </span>
                    )}
                    {resultado.puntosDesconocidos.length > 0 && (
                      <span>
                        Puntos que no están en el formulario:{' '}
                        {resultado.puntosDesconocidos.join(', ')}
                      </span>
                    )}
                    {resultado.marcasDesconocidas.length > 0 && (
                      <span>
                        Marcas que no están en el formulario:{' '}
                        {resultado.marcasDesconocidas.join(', ')}
                      </span>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              disabled={plantilla.isPending}
              onClick={() => plantilla.mutate(undefined)}
            >
              <DownloadIcon data-icon="inline-start" />
              Plantilla
            </Button>
            <Button
              disabled={!archivo || subir.isPending}
              onClick={() =>
                archivo &&
                subir.mutate(archivo, {
                  onSuccess: (datos) => setResultado(datos),
                })
              }
            >
              {subir.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <UploadIcon data-icon="inline-start" />
              )}
              Subir metas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
