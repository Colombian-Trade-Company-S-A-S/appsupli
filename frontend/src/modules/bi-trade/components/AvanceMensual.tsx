import { useMemo, useState, type ReactNode } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronsUpDownIcon,
  SearchIcon,
  TrendingUpIcon,
} from 'lucide-react';
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Input,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  ToggleGroup,
  ToggleGroupItem,
  type ChartConfig,
} from '@/shared/components/ui';
import { formatoMoneda, formatoMonedaCorta, formatoNumero } from '@/shared/lib/formato';
import { cn } from '@/shared/lib/utils';
import type { AvanceMensual, DiaAvance, FilaAvance, HojaAvance } from '../api';
import { BadgeCumplimiento, BarraCumplimiento } from './Cumplimiento';
import { BotonExportar, type ColumnaCopia } from './BotonExportar';
import { ACCION_TARJETA } from './estilos';

/**
 * Ventas y meta van en la misma escala (pesos), así que comparten un eje. El
 * cumplimiento está en porcentaje y va en su propio panel debajo: dos escalas
 * distintas en un mismo eje inventarían una correlación que no está en los
 * datos.
 */
const configuracionDinero = {
  ventas: { label: 'Ventas', color: 'var(--chart-1)' },
  meta: { label: 'Meta', color: 'var(--chart-3)' },
} satisfies ChartConfig;

const configuracionCumplimiento = {
  cumplimiento: { label: 'Cumplimiento', color: 'var(--chart-2)' },
} satisfies ChartConfig;

/** Qué se mira: el día suelto o cómo va el mes sumado. */
type Vista = 'diario' | 'acumulado';

/** Un punto del gráfico, con la fila original a mano para el tooltip. */
interface Punto {
  dia: number;
  ventas: number;
  meta: number;
  cumplimiento: number;
  origen: DiaAvance;
}

/** `AAAA-MM-DD` de hoy en hora local. `toISOString` daría el día en UTC. */
const hoyISO = () => {
  const hoy = new Date();
  const desfase = hoy.getTimezoneOffset() * 60000;
  return new Date(hoy.getTime() - desfase).toISOString().slice(0, 10);
};

const porcentaje = (parte: number, total: number) =>
  total ? Math.round((parte * 1000) / total) / 10 : 0;

/**
 * Cómo va el mes contra el calendario.
 *
 * Un 40% de cumplimiento no dice nada por sí solo: en el día 3 es excelente y
 * en el día 24 es un problema. Esto compara el avance con la parte del mes que
 * ya pasó, que es la única forma de saber si se va a alcanzar la meta.
 */
export function calcularRitmo(datos?: AvanceMensual) {
  if (!datos) return null;
  const hoy = hoyISO();
  const habiles = datos.serie.filter((dia) => dia.habil);
  const corridos = habiles.filter((dia) => dia.fecha <= hoy).length;
  const esperado = porcentaje(corridos, habiles.length);
  return {
    habilesCorridos: corridos,
    habilesTotales: habiles.length,
    /** Qué % del mes debería estar vendido a estas alturas. */
    esperado,
    /** Puntos por encima (o por debajo) de lo esperado. */
    diferencia: Math.round((datos.totales.cumplimiento - esperado) * 10) / 10,
    alDia: datos.totales.cumplimiento >= esperado,
  };
}

/**
 * Insignia de ritmo: al día, adelantado o atrasado, con cuántos puntos.
 *
 * El atraso va en la insignia neutra del sistema, no en ámbar: la paleta de la
 * app es monocroma y el signo ya dice de qué lado está. El verde se reserva
 * para el único caso que es una buena noticia inequívoca, ir adelantado.
 */
export function BadgeRitmo({ ritmo }: { ritmo: ReturnType<typeof calcularRitmo> }) {
  if (!ritmo || ritmo.habilesCorridos === 0) return null;
  const puntos = Math.abs(ritmo.diferencia);
  if (puntos < 1) return <Badge variant="secondary">Al día</Badge>;
  return (
    <Badge variant={ritmo.alDia ? 'success' : 'outline'}>
      {ritmo.alDia ? '+' : '−'}
      {puntos} pts
    </Badge>
  );
}

const COLUMNAS_COPIA_SERIE: Array<ColumnaCopia<Punto>> = [
  { encabezado: 'Día', valor: (p) => p.dia },
  { encabezado: 'Fecha', valor: (p) => p.origen.fecha },
  { encabezado: 'Hábil', valor: (p) => (p.origen.habil ? 'Sí' : 'No') },
  { encabezado: 'Meta', valor: (p) => p.meta },
  { encabezado: 'Ventas', valor: (p) => p.ventas },
  { encabezado: 'Unidades', valor: (p) => p.origen.cantidad },
  { encabezado: 'Cumplimiento %', valor: (p) => p.cumplimiento },
];

/** Gráfico del mes: la venta de cada día contra la cuota diaria. */
export function GraficoAvance({
  datos,
  cargando = false,
  onExportar,
}: {
  datos?: AvanceMensual;
  cargando?: boolean;
  onExportar: (hoja: HojaAvance) => Promise<unknown>;
}) {
  const [vista, setVista] = useState<Vista>('diario');
  const acumulado = vista === 'acumulado';

  const puntos = useMemo<Punto[]>(
    () =>
      (datos?.serie ?? []).map((dia) => ({
        dia: dia.dia,
        ventas: acumulado ? dia.ventasAcumuladas : dia.ventas,
        meta: acumulado ? dia.metaAcumulada : dia.metaDiaria,
        cumplimiento: acumulado
          ? porcentaje(dia.ventasAcumuladas, dia.metaAcumulada)
          : dia.cumplimiento,
        origen: dia,
      })),
    [datos, acumulado],
  );

  const diaria = datos?.totales.metaDiaria ?? 0;
  const sinNada = !cargando && diaria === 0 && (datos?.totales.ventasDinero ?? 0) === 0;

  // La marca de «hoy» solo tiene sentido en el mes en curso.
  const hoy = hoyISO();
  const diaDeHoy = datos?.serie.find((dia) => dia.fecha === hoy)?.dia;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{acumulado ? 'Cómo va el mes' : 'Ventas del día contra la meta'}</CardTitle>
        <CardDescription>
          {diaria > 0 ? (
            <>
              La meta del mes ({formatoMoneda(datos?.totales.metaDinero ?? 0)}) repartida entre{' '}
              {datos?.periodo.diasHabiles} días hábiles: {formatoMoneda(diaria)} por día. No cuentan
              domingos ni festivos, el sábado sí.
            </>
          ) : (
            'Sin metas cargadas para este mes, así que no hay cuota diaria que medir.'
          )}
        </CardDescription>
        <CardAction className={ACCION_TARJETA}>
          <ToggleGroup
            value={[vista]}
            onValueChange={(valor) => setVista((valor[0] as Vista) ?? 'diario')}
            variant="outline"
            size="sm"
          >
            <ToggleGroupItem value="diario">Diario</ToggleGroupItem>
            <ToggleGroupItem value="acumulado">Acumulado</ToggleGroupItem>
          </ToggleGroup>
          <BotonExportar
            etiqueta="el día por día"
            descargar={() => onExportar('serie')}
            columnas={COLUMNAS_COPIA_SERIE}
            filas={puntos}
          />
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        {cargando ? (
          <>
            <Skeleton className="h-72 w-full" />
            <Skeleton className="h-40 w-full" />
          </>
        ) : sinNada ? (
          <Empty className="py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <TrendingUpIcon />
              </EmptyMedia>
              <EmptyTitle>Este mes está en blanco</EmptyTitle>
              <EmptyDescription>
                No hay metas ni ventas cargadas. Prueba otro mes con las flechas del filtro, o carga
                los datos desde Metas y Ventas.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <ChartContainer config={configuracionDinero} className="aspect-auto h-72 w-full">
              <ComposedChart data={puntos} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
                <defs>
                  <linearGradient id="degradado-ventas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-ventas)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="var(--color-ventas)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="dia"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  interval="preserveStartEnd"
                  minTickGap={12}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  width={58}
                  tickFormatter={(valor: number) => formatoMonedaCorta(valor)}
                />
                <ChartTooltip cursor content={<TooltipDia acumulado={acumulado} />} />
                <ChartLegend content={<ChartLegendContent />} />
                <MarcaDeHoy dia={diaDeHoy} />
                <Area
                  dataKey="ventas"
                  type="monotone"
                  stroke="var(--color-ventas)"
                  strokeWidth={2}
                  fill="url(#degradado-ventas)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }}
                />
                {/* Discontinua a propósito: es un objetivo, no una medición. */}
                <Line
                  dataKey="meta"
                  type="linear"
                  stroke="var(--color-meta)"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                  activeDot={false}
                />
              </ComposedChart>
            </ChartContainer>

            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Cumplimiento {acumulado ? 'acumulado' : 'del día'}
              </p>
              <ChartContainer
                config={configuracionCumplimiento}
                className="aspect-auto h-40 w-full"
              >
                <LineChart data={puntos} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis
                    dataKey="dia"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    interval="preserveStartEnd"
                    minTickGap={12}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    width={58}
                    tickFormatter={(valor: number) => `${valor}%`}
                  />
                  {/* El 100% es la línea de meta cumplida. */}
                  <ReferenceLine
                    y={100}
                    stroke="var(--success)"
                    strokeWidth={1.5}
                    label={{
                      value: 'Meta',
                      position: 'insideTopRight',
                      fill: 'var(--muted-foreground)',
                      fontSize: 11,
                    }}
                  />
                  <ChartTooltip
                    cursor
                    content={<TooltipDia acumulado={acumulado} soloCumplimiento />}
                  />
                  <MarcaDeHoy dia={diaDeHoy} />
                  <Line
                    dataKey="cumplimiento"
                    type="monotone"
                    stroke="var(--color-cumplimiento)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }}
                  />
                </LineChart>
              </ChartContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Línea vertical en el día de hoy.
 *
 * Es lo que convierte el gráfico en algo accionable: sin ella no se distingue
 * un día flojo de un día que todavía no ha llegado.
 */
function MarcaDeHoy({ dia }: { dia?: number }) {
  if (!dia) return null;
  return (
    <ReferenceLine
      x={dia}
      stroke="var(--muted-foreground)"
      strokeDasharray="2 3"
      label={{
        value: 'Hoy',
        position: 'insideTopLeft',
        fill: 'var(--muted-foreground)',
        fontSize: 11,
      }}
    />
  );
}

/**
 * Tooltip del día: pesos, porcentaje y si el día era hábil.
 *
 * Recharts no da el tipo del payload cuando se le pasa un contenido propio,
 * así que se lee del primer elemento, que trae la fila completa.
 */
function TooltipDia({
  active,
  payload,
  acumulado = false,
  soloCumplimiento = false,
}: {
  active?: boolean;
  payload?: Array<{ payload: Punto }>;
  acumulado?: boolean;
  soloCumplimiento?: boolean;
}) {
  const punto = payload?.[0]?.payload;
  if (!active || !punto) return null;
  const { origen } = punto;

  return (
    <div className="grid min-w-56 gap-1.5 rounded-lg border bg-background px-3 py-2 text-xs shadow-xl">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium">Día {punto.dia}</span>
        {!origen.habil && <span className="text-muted-foreground">Domingo o festivo</span>}
      </div>
      {!soloCumplimiento && (
        <>
          <Renglon
            color="var(--color-ventas)"
            etiqueta={acumulado ? 'Vendido en el mes' : 'Ventas'}
          >
            {formatoMoneda(punto.ventas)}
          </Renglon>
          <Renglon
            color="var(--color-meta)"
            etiqueta={acumulado ? 'Meta a la fecha' : 'Meta diaria'}
          >
            {formatoMoneda(punto.meta)}
          </Renglon>
          <Renglon etiqueta="Unidades del día">{formatoNumero(origen.cantidad)}</Renglon>
        </>
      )}
      <Renglon etiqueta={acumulado ? 'Cumplimiento acumulado' : 'Cumplimiento del día'}>
        {punto.cumplimiento}%
      </Renglon>
      {!acumulado && (
        <Renglon etiqueta="Acumulado del mes">
          {formatoMonedaCorta(origen.ventasAcumuladas)} de{' '}
          {formatoMonedaCorta(origen.metaAcumulada)}
        </Renglon>
      )}
    </div>
  );
}

function Renglon({
  color,
  etiqueta,
  children,
}: {
  color?: string;
  etiqueta: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {color && (
          <span
            className="size-2 shrink-0 rounded-[2px]"
            style={{ backgroundColor: color }}
            aria-hidden
          />
        )}
        {etiqueta}
      </span>
      <span className="font-medium tabular-nums">{children}</span>
    </div>
  );
}

/** Las columnas de las tablas de avance que se pueden ordenar. */
type CampoOrden = 'label' | 'metaMensual' | 'importe' | 'cantidad' | 'inventario' | 'cumplimiento';

const COLUMNAS_COPIA_AVANCE: Array<ColumnaCopia<FilaAvance>> = [
  { encabezado: 'Nombre', valor: (f) => f.label },
  { encabezado: 'Inventario', valor: (f) => f.inventario },
  { encabezado: 'Meta mensual', valor: (f) => f.metaMensual },
  { encabezado: 'Importe', valor: (f) => f.importe },
  { encabezado: 'Cantidad', valor: (f) => f.cantidad },
  { encabezado: 'Cumplimiento %', valor: (f) => f.cumplimiento },
];

/** Cuántas filas se ven antes de pedir «ver todas». */
const TOPE_FILAS = 10;

/**
 * Tabla de avance por una dimensión.
 *
 * `columnaInventario` la enciende solo donde el stock significa algo: por
 * punto de venta sí, por regional es una suma que nadie usa para decidir.
 */
export function TablaAvance({
  titulo,
  descripcion,
  encabezado,
  filas,
  hoja,
  onExportar,
  cargando = false,
  columnaInventario = false,
}: {
  titulo: string;
  descripcion: string;
  encabezado: string;
  filas: FilaAvance[];
  hoja: HojaAvance;
  onExportar: (hoja: HojaAvance) => Promise<unknown>;
  cargando?: boolean;
  columnaInventario?: boolean;
}) {
  const [orden, setOrden] = useState<{ campo: CampoOrden; desc: boolean }>({
    campo: 'cumplimiento',
    desc: true,
  });
  const [buscar, setBuscar] = useState('');
  const [verTodas, setVerTodas] = useState(false);

  const visibles = useMemo(() => {
    const texto = buscar.trim().toLowerCase();
    const filtradas = texto
      ? filas.filter((fila) => fila.label.toLowerCase().includes(texto))
      : filas;
    return [...filtradas].sort((a, b) => {
      const izq = a[orden.campo];
      const der = b[orden.campo];
      const comparacion =
        typeof izq === 'string' && typeof der === 'string'
          ? izq.localeCompare(der, 'es')
          : Number(izq) - Number(der);
      return orden.desc ? -comparacion : comparacion;
    });
  }, [filas, buscar, orden]);

  // El total va sobre lo filtrado, no sobre lo que se alcanza a ver: recortar
  // la lista es una comodidad visual, no un filtro de datos.
  const total = visibles.reduce(
    (suma, fila) => ({
      metaMensual: suma.metaMensual + fila.metaMensual,
      importe: suma.importe + fila.importe,
      cantidad: suma.cantidad + fila.cantidad,
      inventario: suma.inventario + fila.inventario,
    }),
    { metaMensual: 0, importe: 0, cantidad: 0, inventario: 0 },
  );
  const cumplimientoTotal = porcentaje(total.importe, total.metaMensual);

  const recortadas = verTodas ? visibles : visibles.slice(0, TOPE_FILAS);
  const mejor = orden.campo === 'cumplimiento' && orden.desc ? visibles[0]?.key : undefined;

  const ordenarPor = (campo: CampoOrden) =>
    setOrden((previo) =>
      previo.campo === campo ? { campo, desc: !previo.desc } : { campo, desc: true },
    );

  const Encabezado = ({
    campo,
    children,
    className,
  }: {
    campo: CampoOrden;
    children: ReactNode;
    className?: string;
  }) => {
    const activo = orden.campo === campo;
    const Icono = !activo ? ChevronsUpDownIcon : orden.desc ? ArrowDownIcon : ArrowUpIcon;
    return (
      <TableHead className={className}>
        <Button
          variant="ghost"
          size="sm"
          className={cn('-mx-2 font-medium', !activo && 'text-muted-foreground')}
          onClick={() => ordenarPor(campo)}
        >
          {children}
          <Icono data-icon="inline-end" />
        </Button>
      </TableHead>
    );
  };

  return (
    <Card className="gap-0 pb-0">
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
        <CardDescription>{descripcion}</CardDescription>
        <CardAction className={ACCION_TARJETA}>
          {filas.length > TOPE_FILAS && (
            <div className="relative w-full sm:w-48">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-8 pl-9"
                placeholder={`Filtrar ${encabezado.toLowerCase()}…`}
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
              />
            </div>
          )}
          <BotonExportar
            etiqueta={titulo.toLowerCase()}
            descargar={() => onExportar(hoja)}
            columnas={COLUMNAS_COPIA_AVANCE}
            filas={visibles}
          />
        </CardAction>
      </CardHeader>

      <CardContent className="px-0">
        {cargando ? (
          <div className="flex flex-col gap-3 px-6 py-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : visibles.length === 0 ? (
          <p className="px-6 py-6 text-sm text-muted-foreground">
            {buscar
              ? `Ningún ${encabezado.toLowerCase()} coincide con «${buscar}».`
              : 'Sin metas ni ventas en este mes.'}
          </p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <Encabezado campo="label">{encabezado}</Encabezado>
                  {columnaInventario && (
                    <Encabezado campo="inventario" className="hidden text-right md:table-cell">
                      Inventario
                    </Encabezado>
                  )}
                  <Encabezado campo="metaMensual" className="text-right">
                    Meta mensual
                  </Encabezado>
                  <Encabezado campo="importe" className="text-right">
                    Importe
                  </Encabezado>
                  <Encabezado campo="cantidad" className="hidden text-right md:table-cell">
                    Cantidad
                  </Encabezado>
                  <Encabezado campo="cumplimiento" className="text-right">
                    Cumplimiento
                  </Encabezado>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recortadas.map((fila) => (
                  <TableRow key={fila.key}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        {fila.label}
                        {fila.key === mejor && fila.cumplimiento > 0 && (
                          <Badge variant="success">Mejor</Badge>
                        )}
                      </span>
                    </TableCell>
                    {columnaInventario && (
                      <TableCell className="hidden text-right tabular-nums md:table-cell">
                        {formatoNumero(fila.inventario)}
                      </TableCell>
                    )}
                    <TableCell className="text-right tabular-nums">
                      {formatoMoneda(fila.metaMensual)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatoMoneda(fila.importe)}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">
                      {formatoNumero(fila.cantidad)}
                    </TableCell>
                    <TableCell>
                      {/* La barra deja comparar de un barrido sin leer cada número. */}
                      <div className="flex items-center justify-end gap-2">
                        <BarraCumplimiento
                          porcentaje={fila.cumplimiento}
                          className="hidden w-16 sm:block"
                        />
                        <BadgeCumplimiento porcentaje={fila.cumplimiento} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell>Total{buscar && ' de lo filtrado'}</TableCell>
                  {columnaInventario && (
                    <TableCell className="hidden text-right tabular-nums md:table-cell">
                      {formatoNumero(total.inventario)}
                    </TableCell>
                  )}
                  <TableCell className="text-right tabular-nums">
                    {formatoMoneda(total.metaMensual)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatoMoneda(total.importe)}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">
                    {formatoNumero(total.cantidad)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{cumplimientoTotal}%</TableCell>
                </TableRow>
              </TableFooter>
            </Table>

            {visibles.length > TOPE_FILAS && (
              <div className="flex justify-center border-t py-2">
                <Button variant="ghost" size="sm" onClick={() => setVerTodas(!verTodas)}>
                  {verTodas
                    ? `Ver solo los primeros ${TOPE_FILAS}`
                    : `Ver los ${formatoNumero(visibles.length)}`}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
