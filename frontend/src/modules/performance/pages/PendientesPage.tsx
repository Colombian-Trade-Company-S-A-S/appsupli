import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ClipboardCheckIcon, ListTodoIcon, SearchIcon, TargetIcon, UploadIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  Badge,
  Card,
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
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/shared/components/ui';
import { Encabezado, EstadoTabla, Kpi } from '@/shared/components/layout';
import { EsqueletoPagina } from '@/shared/components/feedback';
import { etiquetaMes, periodoPorDefecto, type FilaPendiente } from '../api';
import { useOpcionesPerformance, usePendientes } from '../hooks';
import { Selector } from '../components/Piezas';

type Lista = 'porAsignar' | 'porCargar' | 'porAprobar';

const LISTAS: Record<
  Lista,
  { titulo: string; corto: string; quien: string; vacio: string; icono: LucideIcon }
> = {
  porAsignar: {
    titulo: 'Pendientes por asignar o corregir objetivos y KPIs',
    corto: 'Por asignar',
    quien: 'Jefe que los asigna',
    vacio: 'Todas las personas tienen sus objetivos completos (100%) y ninguno rechazado.',
    icono: TargetIcon,
  },
  porCargar: {
    titulo: 'Pendientes por cargar cumplimiento y evidencias',
    corto: 'Por cargar',
    quien: 'Quien carga',
    vacio: 'Nadie tiene cumplimientos ni evidencias por cargar.',
    icono: UploadIcon,
  },
  porAprobar: {
    titulo: 'Pendientes por aprobación del jefe inmediato',
    corto: 'Por aprobar',
    quien: 'Quien aprueba',
    vacio: 'No hay resultados esperando aprobación.',
    icono: ClipboardCheckIcon,
  },
};

/**
 * Quién tiene algo pendiente en el mes, en tres listas: objetivos por asignar,
 * cumplimientos y evidencias por cargar, y resultados por aprobar.
 *
 * Cada fila dice quién tiene que actuar, que no siempre es la persona: los
 * objetivos los asigna el jefe y el resultado lo aprueba el jefe (o el Trade
 * Marketing Manager, con asesores y promotores).
 */
export default function PendientesPage() {
  const { data: opciones } = useOpcionesPerformance();
  // `?periodo=2026-12-01` abre ese mes: el aviso de objetivos rechazados lleva acá.
  const [params] = useSearchParams();
  const [periodo, setPeriodo] = useState(params.get('periodo') ?? '');
  const [lista, setLista] = useState<Lista>('porAsignar');
  const [busqueda, setBusqueda] = useState('');

  const periodos = opciones?.periodos ?? [];
  const elegido = periodo || periodoPorDefecto(periodos);
  const { data, isLoading } = usePendientes(elegido ? elegido.slice(0, 7) : '');

  const filas = useMemo(() => {
    const todas = data?.[lista] ?? [];
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return todas;
    return todas.filter((fila) =>
      [fila.nombre, fila.cargo, fila.area, fila.responsable].some((campo) =>
        campo.toLowerCase().includes(texto),
      ),
    );
  }, [data, lista, busqueda]);

  if (!opciones) return <EsqueletoPagina forma="tablero" label="Buscando pendientes…" />;

  const config = LISTAS[lista];
  const Icono = config.icono;
  const sinMedicion = data && !data.medicionIniciada && lista !== 'porAsignar';

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="Pendientes del mes"
        descripcion={
          data?.alcance === 'compania'
            ? 'Toda la compañía: quién tiene objetivos por asignar, cumplimientos por cargar o resultados por aprobar.'
            : 'Tu equipo: quién tiene objetivos por asignar, cumplimientos por cargar o resultados por aprobar.'
        }
      />

      <Selector
        id="pendientes-periodo"
        label="Mes"
        placeholder="Elige un mes"
        className="max-w-xs"
        value={elegido}
        onChange={setPeriodo}
        opciones={periodos.map((p) => ({
          value: p.periodo,
          label: `${etiquetaMes(p.periodo)} · ${p.estadoLabel}`,
        }))}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {(Object.keys(LISTAS) as Lista[]).map((clave) => (
          <button
            key={clave}
            type="button"
            className="text-left"
            onClick={() => setLista(clave)}
            aria-pressed={lista === clave}
          >
            <Kpi
              label={LISTAS[clave].corto}
              value={data ? data[clave].length : '—'}
              hint={`de ${data?.personas ?? '—'} personas`}
              cargando={isLoading}
              className={lista === clave ? 'ring-2 ring-primary' : undefined}
            />
          </button>
        ))}
      </div>

      <Card className="gap-0 py-0">
        <CardHeader className="gap-3 border-b py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <CardTitle className="flex items-center gap-2">
                <Icono className="size-4" />
                {config.titulo}
              </CardTitle>
              <CardDescription>
                {data ? `${data.periodoLabel} · ${filas.length} persona(s)` : 'Cargando…'}
              </CardDescription>
            </div>
            <Tabs value={lista} onValueChange={(v) => setLista(v as Lista)}>
              <TabsList>
                {(Object.keys(LISTAS) as Lista[]).map((clave) => (
                  <TabsTrigger key={clave} value={clave}>
                    {LISTAS[clave].corto}
                    {data && (
                      <Badge variant="secondary" className="ml-1">
                        {data[clave].length}
                      </Badge>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
          <div className="relative max-w-sm">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar persona, cargo, área o responsable"
              className="pl-8"
            />
          </div>
        </CardHeader>

        <EstadoTabla
          cargando={isLoading}
          vacio={filas.length === 0}
          icono={<ListTodoIcon />}
          titulo={sinMedicion ? 'El mes todavía no termina' : 'Sin pendientes'}
          descripcion={
            sinMedicion
              ? 'Los cumplimientos se cargan y se aprueban cuando el mes termina: desde el 1 del mes siguiente.'
              : busqueda
                ? 'Nadie coincide con la búsqueda.'
                : config.vacio
          }
        >
          <TablaPendientes filas={filas} quien={config.quien} />
        </EstadoTabla>
      </Card>
    </div>
  );
}

function TablaPendientes({ filas, quien }: { filas: FilaPendiente[]; quien: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Persona</TableHead>
          <TableHead className="hidden md:table-cell">Área</TableHead>
          <TableHead>Pendiente</TableHead>
          <TableHead>{quien}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filas.map((fila) => (
          <TableRow key={fila.colaborador}>
            <TableCell>
              <div className="flex flex-col">
                <span className="font-medium">{fila.nombre}</span>
                <span className="text-xs text-muted-foreground">{fila.cargo}</span>
              </div>
            </TableCell>
            <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
              {fila.area || '—'}
            </TableCell>
            <TableCell className="text-sm whitespace-normal">{fila.detalle}</TableCell>
            <TableCell className="text-sm">
              {fila.responsable === fila.nombre ? (
                <span className="text-muted-foreground">La misma persona</span>
              ) : (
                fila.responsable
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
