import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeftIcon,
  DownloadIcon,
  SettingsIcon,
  TicketIcon,
  TrophyIcon,
  XIcon,
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Input,
  Skeleton,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/shared/components/ui';
import { Encabezado, Kpi } from '@/shared/components/layout';
import { formatoNumero } from '@/shared/lib/formato';
import { biTradeApi, type FilaTicket } from '../api';
import { useCampanas, useConcurso, useDescarga, useOpciones, usePuntosVenta } from '../hooks';
import { CampoSelect } from '../components/CampoSelect';
import { HojasBi } from '../components/HojasBi';
import { ReglasConcurso } from '../components/ReglasConcurso';
import { CampanaDialog } from '../components/CampanaDialog';
import { ACCION_TARJETA } from '../components/estilos';
import { useFuente } from '../fuente';

const BASE = '/inicio/bi-trade/claro';

/** Qué puntos de venta se listan. */
type Vista = 'todos' | 'participan' | 'cerca';

/** Concurso de tickets: quién acumula, quién participa y cuánto falta. */
export default function TicketsPage() {
  const { soloLectura } = useFuente();
  const [campana, setCampana] = useState<string>('');
  const [filtros, setFiltros] = useState<{
    regional?: string;
    marca?: string;
    id_punto_venta?: string;
  }>({});
  const [vista, setVista] = useState<Vista>('todos');
  const [buscar, setBuscar] = useState('');
  const [configurar, setConfigurar] = useState(false);

  const consulta = { ...filtros, ...(campana ? { campana: Number(campana) } : {}) };
  const { data, isLoading, isFetching } = useConcurso(consulta);
  const { data: campanas = [] } = useCampanas();
  const { data: opciones } = useOpciones();
  const { data: puntos = [] } = usePuntosVenta();

  const exportar = useDescarga(
    () => biTradeApi.ticketsExportar(consulta),
    'Concurso descargado en Excel',
  );

  const activa = data?.campana ?? null;
  const totales = data?.totales ?? {};

  const filas = useMemo(() => {
    const texto = buscar.trim().toLowerCase();
    return (data?.filas ?? []).filter((fila) => {
      if (texto && !fila.label.toLowerCase().includes(texto)) return false;
      if (vista === 'participan') return fila.participa;
      // «Cerca» son los que ya tienen tickets pero les faltan ventas.
      if (vista === 'cerca') return !fila.participa && fila.tickets > 0;
      return true;
    });
  }, [data, buscar, vista]);

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="Concurso de tickets"
        descripcion={
          activa ? activa.nombre : 'Premia cumplir la meta diaria con tickets para el sorteo.'
        }
      >
        {!soloLectura && (
          <>
            <Button variant="outline" render={<Link to={BASE} />}>
              <ArrowLeftIcon data-icon="inline-start" />
              Avance del mes
            </Button>
            <Button variant="outline" onClick={() => setConfigurar(true)}>
              <SettingsIcon data-icon="inline-start" />
              {activa ? 'Editar reglas' : 'Crear campaña'}
            </Button>
            {activa && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="outline"
                      disabled={exportar.isPending}
                      onClick={() => exportar.mutate(undefined)}
                    >
                      {exportar.isPending ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <DownloadIcon data-icon="inline-start" />
                      )}
                      Descargar
                    </Button>
                  }
                />
                <TooltipContent>
                  Un Excel con el acumulado por punto y el detalle día por día
                </TooltipContent>
              </Tooltip>
            )}
          </>
        )}
      </Encabezado>

      <HojasBi />

      {!activa && !isLoading ? (
        <Empty className="py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TicketIcon />
            </EmptyMedia>
            <EmptyTitle>Todavía no hay campaña</EmptyTitle>
            <EmptyDescription>
              {soloLectura
                ? 'Todavía no hay un concurso activo para mostrar.'
                : (data?.message ??
                  'Crea una campaña con sus escalas y umbrales para empezar a medir el concurso.')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <Card className="py-4">
            <CardContent className="flex flex-wrap items-end gap-3">
              <CampoSelect
                id="filtro-campana"
                label="Campaña"
                placeholder="La activa más reciente"
                value={campana}
                onChange={setCampana}
                opciones={campanas.map((c) => ({
                  value: String(c.idCampana),
                  label: `${c.nombre}${c.activa ? '' : ' (cerrada)'}`,
                }))}
              />
              <CampoSelect
                id="filtro-regional"
                label="Regional"
                placeholder="Todas las regionales"
                value={filtros.regional ?? ''}
                onChange={(v) => setFiltros({ ...filtros, regional: v })}
                opciones={(opciones?.regionales ?? []).map((r) => ({
                  value: r.value,
                  label: r.label,
                }))}
              />
              <CampoSelect
                id="filtro-pdv"
                label="Punto de venta"
                placeholder="Todos los puntos"
                value={filtros.id_punto_venta ?? ''}
                onChange={(v) => setFiltros({ ...filtros, id_punto_venta: v })}
                opciones={puntos.map((p) => ({ value: p.idPuntoVenta, label: p.nombrePdv }))}
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
                disabled={!filtros.regional && !filtros.marca && !filtros.id_punto_venta}
                onClick={() => setFiltros({})}
              >
                <XIcon data-icon="inline-start" />
                Limpiar
              </Button>
              <div className="ml-auto flex items-center gap-2">
                {isFetching && <Spinner className="text-muted-foreground" />}
                {activa && (
                  <Badge variant={data?.vigente ? 'success' : 'outline'}>
                    {data?.vigente ? 'Vigente' : 'Fuera de vigencia'}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label="Participan"
              cargando={isLoading}
              value={formatoNumero(totales.participantes ?? 0)}
              extra={<TrophyIcon className="size-4 text-muted-foreground" />}
              hint={`de ${formatoNumero(totales.puntosVenta ?? 0)} puntos con venta`}
            />
            <Kpi
              label="Tickets en juego"
              cargando={isLoading}
              value={formatoNumero(totales.ticketsParticipantes ?? 0)}
              hint={`${formatoNumero(totales.tickets ?? 0)} acumulados en total`}
            />
            <Kpi
              label="Unidades vendidas"
              cargando={isLoading}
              value={formatoNumero(totales.unidades ?? 0)}
              hint="En toda la vigencia de la campaña"
            />
            <Kpi
              label="Días cumplidos"
              cargando={isLoading}
              value={formatoNumero(totales.diasCumplidos ?? 0)}
              hint="Sumando todos los puntos de venta"
            />
          </div>

          {activa && <ReglasConcurso campana={activa} />}

          <Card className="gap-0 pb-0">
            <CardHeader>
              <CardTitle>Tickets por punto de venta</CardTitle>
              <CardDescription>
                Ordenado por tickets. Participa quien cumple las dos condiciones a la vez.
              </CardDescription>
              <CardAction className={ACCION_TARJETA}>
                <ToggleGroup
                  value={[vista]}
                  onValueChange={(v) => setVista((v[0] as Vista) ?? 'todos')}
                  variant="outline"
                  size="sm"
                >
                  <ToggleGroupItem value="todos">Todos</ToggleGroupItem>
                  <ToggleGroupItem value="participan">Participan</ToggleGroupItem>
                  <ToggleGroupItem value="cerca">Les falta</ToggleGroupItem>
                </ToggleGroup>
                <Input
                  className="h-8 w-44"
                  placeholder="Filtrar punto de venta…"
                  value={buscar}
                  onChange={(e) => setBuscar(e.target.value)}
                />
              </CardAction>
            </CardHeader>

            <CardContent className="px-0">
              {isLoading ? (
                <div className="flex flex-col gap-3 px-6 py-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 w-full" />
                  ))}
                </div>
              ) : filas.length === 0 ? (
                <p className="px-6 py-6 text-sm text-muted-foreground">
                  {vista === 'participan'
                    ? 'Ningún punto de venta cumple todavía las dos condiciones.'
                    : 'No hay puntos de venta para este corte.'}
                </p>
              ) : (
                <TablaTickets filas={filas} />
              )}
            </CardContent>
          </Card>
        </>
      )}

      {!soloLectura && (
        <CampanaDialog
          abierto={configurar}
          onOpenChange={setConfigurar}
          campana={activa}
          onGuardada={(id) => setCampana(String(id))}
        />
      )}
    </div>
  );
}

function TablaTickets({ filas }: { filas: FilaTicket[] }) {
  const total = filas.reduce(
    (suma, fila) => ({
      unidades: suma.unidades + fila.unidades,
      diasCumplidos: suma.diasCumplidos + fila.diasCumplidos,
      tickets: suma.tickets + fila.tickets,
    }),
    { unidades: 0, diasCumplidos: 0, tickets: 0 },
  );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="hidden w-8 text-right sm:table-cell">#</TableHead>
          <TableHead>Punto de venta</TableHead>
          <TableHead className="hidden xl:table-cell">Regional</TableHead>
          <TableHead className="text-right">Ventas</TableHead>
          <TableHead className="hidden text-right lg:table-cell">Foco</TableHead>
          <TableHead className="hidden text-right lg:table-cell">Cargadores</TableHead>
          <TableHead className="text-right">Días</TableHead>
          <TableHead className="text-right">Tickets</TableHead>
          <TableHead className="text-right">Estado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filas.map((fila, indice) => (
          <TableRow key={fila.key}>
            <TableCell className="hidden text-right text-xs text-muted-foreground tabular-nums sm:table-cell">
              {indice + 1}
            </TableCell>
            <TableCell className="font-medium">{fila.label}</TableCell>
            <TableCell className="hidden text-muted-foreground xl:table-cell">
              {fila.regional}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatoNumero(fila.unidades)}
            </TableCell>
            <TableCell className="hidden text-right tabular-nums lg:table-cell">
              {formatoNumero(fila.unidadesFoco)}
            </TableCell>
            <TableCell className="hidden text-right tabular-nums lg:table-cell">
              {formatoNumero(fila.unidadesCargador)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {fila.diasCumplidos}
              {fila.diasDuplicados > 0 && (
                <span className="text-xs text-muted-foreground"> ({fila.diasDuplicados}×2)</span>
              )}
            </TableCell>
            <TableCell className="text-right">
              {/* El desglose explica de dónde salió cada ticket, que es lo
                  primero que se pregunta quien revisa su propio número. */}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span className="cursor-help font-semibold tabular-nums underline decoration-dotted">
                      {formatoNumero(fila.tickets)}
                    </span>
                  }
                />
                <TooltipContent>
                  <span className="flex flex-col gap-0.5">
                    <span>Escala: {fila.ticketsEscala}</span>
                    <span>Bono: {fila.ticketsBono}</span>
                    <span>
                      Acelerador: {fila.ticketsAcelerador}
                      {fila.aceleradorAlcanzado > 0 &&
                        ` (pasó ${formatoNumero(fila.aceleradorAlcanzado)})`}
                    </span>
                  </span>
                </TooltipContent>
              </Tooltip>
            </TableCell>
            <TableCell className="text-right">
              {fila.participa ? (
                <Badge variant="success">Participa</Badge>
              ) : fila.faltanVentas > 0 ? (
                <Badge variant="outline">−{formatoNumero(fila.faltanVentas)} ventas</Badge>
              ) : (
                <Badge variant="outline">Faltan tickets</Badge>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell className="hidden sm:table-cell" />
          <TableCell>Total</TableCell>
          <TableCell className="hidden xl:table-cell" />
          <TableCell className="text-right tabular-nums">{formatoNumero(total.unidades)}</TableCell>
          <TableCell className="hidden lg:table-cell" />
          <TableCell className="hidden lg:table-cell" />
          <TableCell className="text-right tabular-nums">{total.diasCumplidos}</TableCell>
          <TableCell className="text-right font-semibold tabular-nums">
            {formatoNumero(total.tickets)}
          </TableCell>
          <TableCell />
        </TableRow>
      </TableFooter>
    </Table>
  );
}
