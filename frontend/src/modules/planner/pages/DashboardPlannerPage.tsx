import { useState } from 'react';
import { BarChart3Icon, ChevronRightIcon, XIcon } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldLabel,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui';
import { EstadoTabla, Kpi } from '@/shared/components/layout';
import { EsqueletoPagina } from '@/shared/components/feedback';
import { cn } from '@/shared/lib/utils';
import {
  formatoIndice,
  formatoPct,
  nombreMes,
  type FilaDashboard,
  type FiltrosDashboard,
} from '../api';
import { useCumplimientoPersona, useDashboardPlanner, useOpcionesPlanner } from '../hooks';
import { DetalleCumplimiento } from '../components/DetalleCumplimiento';
import { LeyendaSemaforoPlanner, SelectorSemana, SemaforoTag } from '../components/Piezas';

/**
 * El índice Planner por organización, dirección, área y persona.
 *
 * People, CEO y Dirección empiezan en la organización y bajan con un clic.
 * Un líder ve directamente a sus personas a cargo. En el nivel de persona, el
 * clic abre su detalle semana a semana.
 */
export default function DashboardPlannerPage() {
  const { data: opciones } = useOpcionesPlanner();
  const [filtros, setFiltros] = useState<FiltrosDashboard>({ periodo: 'semana' });
  const [personaSel, setPersonaSel] = useState<number | null>(null);
  const [semanaPersona, setSemanaPersona] = useState<string>();
  const { data, isLoading, isFetching } = useDashboardPlanner(filtros);
  const persona = useCumplimientoPersona(personaSel, semanaPersona ?? filtros.semana);

  if (!opciones) return <EsqueletoPagina forma="tablero" label="Abriendo el dashboard…" />;

  const semana = filtros.semana ?? opciones.semanaActual.codigo;
  const mes = filtros.mes ?? opciones.meses[0]?.codigo ?? '';
  const mesesOpciones = opciones.meses.map((m) => ({
    value: m.codigo,
    label: nombreMes(m.anio, m.mes),
  }));
  const compania = data?.alcance === 'compania';

  const bajar = (fila: FilaDashboard) => {
    if (fila.tipo === 'persona') {
      setPersonaSel(fila.id ?? null);
      setSemanaPersona(undefined);
      return;
    }
    setPersonaSel(null);
    setFiltros((f) =>
      fila.tipo === 'direccion'
        ? { ...f, nivel: 'direccion', direccion: fila.nombre, area: undefined }
        : { ...f, nivel: 'area', area: fila.nombre },
    );
  };

  const irA = (nivel: 'org' | 'direccion') => {
    setPersonaSel(null);
    setFiltros((f) =>
      nivel === 'org'
        ? { periodo: f.periodo, semana: f.semana, mes: f.mes, nivel: 'org' }
        : { ...f, nivel: 'direccion', area: undefined },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Periodo</span>
          <div className="inline-flex rounded-lg border border-border p-0.5">
            {(['semana', 'mes'] as const).map((p) => (
              <Button
                key={p}
                size="sm"
                variant={filtros.periodo === p ? 'secondary' : 'ghost'}
                aria-pressed={filtros.periodo === p}
                onClick={() => setFiltros((f) => ({ ...f, periodo: p }))}
              >
                {p === 'semana' ? 'Semana' : 'Mes'}
              </Button>
            ))}
          </div>
        </div>
        {filtros.periodo === 'semana' ? (
          <SelectorSemana
            id="dash-semana"
            semanas={opciones.semanas}
            value={semana}
            onChange={(codigo) => setFiltros((f) => ({ ...f, semana: codigo }))}
          />
        ) : (
          <Field className="w-full min-w-0 sm:w-56">
            <FieldLabel htmlFor="dash-mes">Mes</FieldLabel>
            <Select
              items={mesesOpciones}
              value={mes}
              onValueChange={(v) => setFiltros((f) => ({ ...f, mes: (v as string) ?? '' }))}
            >
              <SelectTrigger id="dash-mes">
                <SelectValue placeholder="Elige el mes" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {mesesOpciones.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi
          label="Índice Planner"
          cargando={isLoading}
          value={formatoIndice(data?.kpis.indice)}
          hint="Según periodo y alcance"
          extra={<SemaforoTag semaforo={data?.kpis.semaforo} />}
        />
        <Kpi
          label="% Weekly"
          cargando={isLoading}
          value={formatoPct(data?.kpis.pctWeekly)}
          hint="Completadas ÷ línea base"
        />
        <Kpi
          label="% Daily"
          cargando={isLoading}
          value={formatoPct(data?.kpis.pctDaily)}
          hint="Ítems marcados ÷ total"
        />
        <Kpi
          label="Hitos por validar"
          cargando={isLoading}
          value={data?.kpis.hitosPorValidar ?? 0}
          hint="Pendientes del líder"
        />
        <Kpi
          label="Alertas abiertas"
          cargando={isLoading}
          value={data?.kpis.alertas ?? 0}
          hint="Sin Daily o Hito sin validar"
        />
      </div>

      <Card className="py-0">
        <CardHeader className="pt-6">
          <CardTitle>
            {compania ? (
              <nav aria-label="Nivel" className="flex flex-wrap items-center gap-1 text-base">
                <button
                  type="button"
                  onClick={() => irA('org')}
                  className={cn('hover:underline', data?.nivel === 'org' && 'font-semibold')}
                >
                  Organización
                </button>
                {data?.direccion && data.nivel !== 'org' && (
                  <>
                    <ChevronRightIcon className="size-4 text-muted-foreground" />
                    <button
                      type="button"
                      onClick={() => irA('direccion')}
                      className={cn(
                        'hover:underline',
                        data.nivel === 'direccion' && 'font-semibold',
                      )}
                    >
                      {data.direccion}
                    </button>
                  </>
                )}
                {data?.area && data.nivel === 'area' && (
                  <>
                    <ChevronRightIcon className="size-4 text-muted-foreground" />
                    <span className="font-semibold">{data.area}</span>
                  </>
                )}
              </nav>
            ) : (
              'Mi equipo'
            )}
          </CardTitle>
          <CardDescription>
            {data?.etiqueta}
            {' · '}
            {data?.nivel === 'persona' || data?.nivel === 'area'
              ? 'haz clic en una persona para ver su detalle.'
              : 'haz clic en una fila para bajar de nivel.'}
          </CardDescription>
          {isFetching && !isLoading && (
            <CardAction>
              <Badge variant="outline">Actualizando…</Badge>
            </CardAction>
          )}
        </CardHeader>
        <EstadoTabla
          cargando={isLoading}
          vacio={(data?.filas.length ?? 0) === 0}
          icono={<BarChart3Icon />}
          titulo="Todavía no hay ejecución que mostrar"
          descripcion="Cuando haya planes relacionados y una lectura de Planner en este periodo, aparecen acá."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Líder</TableHead>
                <TableHead className="text-right">Personas</TableHead>
                <TableHead className="text-right">% Weekly</TableHead>
                <TableHead className="text-right">% Daily</TableHead>
                <TableHead className="text-right">Hito cumplido</TableHead>
                <TableHead className="text-right">Índice</TableHead>
                <TableHead>Semáforo</TableHead>
                <TableHead>Alertas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.filas.map((fila) => (
                <TableRow
                  key={`${fila.tipo}-${fila.id ?? fila.nombre}`}
                  className={cn(
                    'cursor-pointer',
                    fila.tipo === 'persona' && fila.id === personaSel && 'bg-muted/60',
                  )}
                  onClick={() => bajar(fila)}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && bajar(fila)}
                >
                  <TableCell className="font-medium">
                    {fila.nombre}
                    {fila.cargo && (
                      <span className="block text-xs font-normal text-muted-foreground">
                        {fila.cargo}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{fila.lider}</TableCell>
                  <TableCell className="text-right tabular-nums">{fila.personas}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatoPct(fila.pctWeekly)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatoPct(fila.pctDaily)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatoPct(fila.hitoCumplido)}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatoIndice(fila.indice)}
                  </TableCell>
                  <TableCell>
                    <SemaforoTag semaforo={fila.semaforo} />
                  </TableCell>
                  <TableCell>
                    {fila.alertas > 0 ? (
                      <Badge
                        variant="outline"
                        className="border-red-500/40 text-red-700 dark:text-red-300"
                      >
                        {fila.alertas} por revisar
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </EstadoTabla>
        <div className="px-6 pb-6">
          <LeyendaSemaforoPlanner parametros={data?.parametros ?? opciones.parametros} />
        </div>
      </Card>

      {personaSel !== null && (
        <section className="flex flex-col gap-4 rounded-xl border border-border p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs tracking-wide text-muted-foreground uppercase">
                Detalle de persona
              </p>
              <h2 className="text-lg font-semibold">
                {persona.data?.persona.nombre ?? '…'}
                {persona.data && (
                  <span className="font-normal text-muted-foreground">
                    {' '}
                    · {persona.data.persona.area || 'Sin área'} · líder{' '}
                    {persona.data.persona.lider || '—'}
                  </span>
                )}
              </h2>
            </div>
            <Button variant="outline" size="sm" onClick={() => setPersonaSel(null)}>
              <XIcon /> Cerrar detalle
            </Button>
          </div>
          <DetalleCumplimiento
            datos={persona.data}
            parametros={opciones.parametros}
            onSemana={setSemanaPersona}
            cargando={persona.isLoading}
          />
        </section>
      )}
    </div>
  );
}
