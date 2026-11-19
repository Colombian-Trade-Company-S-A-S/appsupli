import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3Icon, SearchIcon, SearchXIcon, XIcon } from 'lucide-react';
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
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui';
import { Kpi } from '@/shared/components/layout';
import { EsqueletoPagina } from '@/shared/components/feedback';
import { cn } from '@/shared/lib/utils';
import {
  formatoIndice,
  formatoPct,
  nombreMes,
  type FilaDashboard,
  type ParametrosPlanner,
  type SemaforoPlanner,
} from '../api';
import {
  useCumplimientoPersona,
  useDashboardPlanner,
  useOpcionesPlanner,
  usePrecargarPersona,
} from '../hooks';
import { DetalleCumplimiento } from '../components/DetalleCumplimiento';
import { LeyendaSemaforoPlanner, SelectorSemana, SemaforoTag } from '../components/Piezas';

type Color = SemaforoPlanner | 'sin-dato';

const COLORES: Array<[Color, string]> = [
  ['verde', 'Verde'],
  ['ambar', 'Ámbar'],
  ['rojo', 'Rojo'],
  ['sin-dato', 'Sin dato'],
];
const PUNTO: Record<Color, string> = {
  verde: 'bg-emerald-500',
  ambar: 'bg-amber-500',
  rojo: 'bg-red-500',
  'sin-dato': 'bg-muted-foreground/40',
};
const TODAS = '__todas';

const promedio = (valores: Array<number | null | undefined>) => {
  const conDato = valores.filter((v): v is number => v !== null && v !== undefined);
  return conDato.length ? conDato.reduce((a, b) => a + b, 0) / conDato.length : null;
};

const semaforoDe = (valor: number | null, p: ParametrosPlanner): SemaforoPlanner | null =>
  valor === null
    ? null
    : valor >= p.verdeDesde
      ? 'verde'
      : valor >= p.ambarDesde
        ? 'ambar'
        : 'rojo';

const colorDe = (fila: FilaDashboard): Color => fila.semaforo ?? 'sin-dato';

/** Sin tildes ni mayúsculas, para que «julian» encuentre a «Julián». */
const plano = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/**
 * El cumplimiento Planner de cada persona, en una sola lista (decisiones 4, 8 y 9).
 *
 * Cada quien ve lo que tiene debajo: People y el CEO toda la compañía, el
 * director toda su dirección y el líder todo su equipo. La lista es el
 * ranking, de mayor a menor índice. Los filtros (nombre, área, dirección y
 * semáforo) se aplican al instante y quedan en la dirección de la página; el
 * detalle de una persona se abre al lado, sin perder la lista.
 */
export default function DashboardPlannerPage() {
  const { data: opciones } = useOpcionesPlanner();
  const [params, setParams] = useSearchParams();
  const periodo = params.get('periodo') === 'mes' ? 'mes' : 'semana';
  const semanaParam = params.get('semana') ?? undefined;
  const mesParam = params.get('mes') ?? undefined;
  const busqueda = params.get('q') ?? '';
  const area = params.get('area') ?? '';
  const direccion = params.get('dir') ?? '';
  const color = (params.get('color') ?? '') as Color | '';
  const personaSel = Number(params.get('persona')) || null;

  const { data, isLoading, isFetching } = useDashboardPlanner({
    periodo,
    semana: semanaParam,
    mes: mesParam,
    nivel: 'persona',
  });
  const [semanaPersona, setSemanaPersona] = useState<string>();
  // La semana con la que abre el detalle: la del dashboard si se mira por semana.
  const semanaDetalle = periodo === 'semana' ? semanaParam : undefined;
  const persona = useCumplimientoPersona(personaSel, semanaPersona ?? semanaDetalle);
  const precargar = usePrecargarPersona();

  if (!opciones) return <EsqueletoPagina forma="tablero" label="Abriendo el dashboard…" />;

  /** Cambia filtros en la dirección de la página; vacío los quita. */
  const cambiar = (cambios: Record<string, string | null>) =>
    setParams(
      (actuales) => {
        const nuevos = new URLSearchParams(actuales);
        for (const [clave, valor] of Object.entries(cambios)) {
          if (valor) nuevos.set(clave, valor);
          else nuevos.delete(clave);
        }
        return nuevos;
      },
      { replace: true },
    );
  const abrir = (id: number) => {
    setSemanaPersona(undefined);
    cambiar({ persona: String(id) });
  };
  const limpiar = () => cambiar({ q: null, area: null, dir: null, color: null });

  const parametros = data?.parametros ?? opciones.parametros;
  const semana = semanaParam ?? opciones.semanaActual.codigo;
  const mes = mesParam ?? opciones.meses[0]?.codigo ?? '';
  const mesesOpciones = opciones.meses.map((m) => ({
    value: m.codigo,
    label: nombreMes(m.anio, m.mes),
  }));

  // Los filtros, en cascada: dirección → área y nombre → semáforo.
  const todas = data?.filas ?? [];
  const direcciones = [
    ...new Map(todas.map((f) => [f.direccionClave ?? '', f.direccion ?? ''])).entries(),
  ]
    .map(([valor, label]) => ({ value: valor, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const enDireccion = todas.filter((f) => !direccion || f.direccionClave === direccion);
  const areas = [...new Set(enDireccion.map((f) => f.area ?? ''))]
    .sort((a, b) => a.localeCompare(b))
    .map((nombre) => {
      const miembros = enDireccion.filter((f) => f.area === nombre);
      const indice = promedio(miembros.map((f) => f.indice));
      return {
        nombre,
        personas: miembros.length,
        indice,
        semaforo: semaforoDe(indice, parametros),
      };
    });
  const texto = plano(busqueda.trim());
  const antesDelColor = enDireccion.filter(
    (f) =>
      (!area || f.area === area) &&
      (!texto || plano(`${f.nombre} ${f.cargo ?? ''}`).includes(texto)),
  );
  const conteo = Object.fromEntries(
    COLORES.map(([c]) => [c, antesDelColor.filter((f) => colorDe(f) === c).length]),
  ) as Record<Color, number>;
  const visibles = antesDelColor.filter((f) => !color || colorDe(f) === color);
  const hayFiltros = Boolean(busqueda || area || direccion || color);

  const indice = promedio(visibles.map((f) => f.indice));
  const filaSel = todas.find((f) => f.id === personaSel);

  return (
    <div className="flex flex-col gap-6">
      {/* Los filtros: todos a la vista, en una sola zona. */}
      <section className="flex flex-col gap-3" aria-label="Filtros">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Periodo</span>
            <div className="inline-flex rounded-lg border border-border p-0.5">
              {(['semana', 'mes'] as const).map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={periodo === p ? 'secondary' : 'ghost'}
                  aria-pressed={periodo === p}
                  onClick={() => cambiar({ periodo: p === 'mes' ? 'mes' : null })}
                >
                  {p === 'semana' ? 'Semana' : 'Mes'}
                </Button>
              ))}
            </div>
          </div>
          {periodo === 'semana' ? (
            <SelectorSemana
              id="dash-semana"
              semanas={opciones.semanas}
              value={semana}
              onChange={(codigo) => cambiar({ semana: codigo })}
            />
          ) : (
            <Field className="w-full min-w-0 sm:w-56">
              <FieldLabel htmlFor="dash-mes">Mes</FieldLabel>
              <Select
                items={mesesOpciones}
                value={mes}
                onValueChange={(v) => cambiar({ mes: (v as string) || null })}
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
          <Field className="min-w-0 flex-1 sm:min-w-64">
            <FieldLabel htmlFor="dash-buscar">Persona</FieldLabel>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="dash-buscar"
                value={busqueda}
                onChange={(e) => cambiar({ q: e.target.value })}
                placeholder="Busca por nombre o cargo"
                className="pl-8"
              />
            </div>
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {direcciones.length > 1 && (
            <FiltroLista
              etiqueta="Dirección"
              todas="Todas las direcciones"
              opciones={direcciones}
              valor={direccion}
              onCambio={(v) => cambiar({ dir: v, area: null })}
            />
          )}
          {areas.length > 1 && (
            <FiltroLista
              etiqueta="Área"
              todas="Todas las áreas"
              opciones={areas.map((a) => ({ value: a.nombre, label: a.nombre }))}
              valor={area}
              onCambio={(v) => cambiar({ area: v })}
            />
          )}
          <div className="flex flex-wrap gap-1" role="group" aria-label="Semáforo">
            {COLORES.map(([c, label]) => (
              <Button
                key={c}
                size="sm"
                variant={color === c ? 'secondary' : 'outline'}
                aria-pressed={color === c}
                onClick={() => cambiar({ color: color === c ? null : c })}
              >
                <i className={cn('size-2 rounded-full', PUNTO[c])} aria-hidden />
                {label}
                <span className="text-muted-foreground tabular-nums">{conteo[c]}</span>
              </Button>
            ))}
          </div>
          {hayFiltros && (
            <Button size="sm" variant="ghost" onClick={limpiar}>
              <XIcon /> Limpiar filtros
            </Button>
          )}
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi
          label="Índice Planner"
          cargando={isLoading}
          value={formatoIndice(indice)}
          hint={`Promedio de ${visibles.length} persona(s) en la vista`}
          extra={<SemaforoTag semaforo={semaforoDe(indice, parametros)} />}
        />
        <Kpi
          label="% Weekly"
          cargando={isLoading}
          value={formatoPct(promedio(visibles.map((f) => f.pctWeekly)))}
          hint="Completadas ÷ medidas"
        />
        <Kpi
          label="% Daily"
          cargando={isLoading}
          value={formatoPct(promedio(visibles.map((f) => f.pctDaily)))}
          hint="Ítems marcados ÷ total"
        />
        <Kpi
          label="Hito registrado"
          cargando={isLoading}
          value={formatoPct(promedio(visibles.map((f) => f.hitoRegistrado)))}
          hint="Tarea HITO con ítems"
        />
        <Kpi
          label="Alertas"
          cargando={isLoading}
          value={visibles.reduce((n, f) => n + f.alertas, 0)}
          hint="Sin Hito o sin Weekly/Daily"
        />
      </div>

      {areas.length > 1 && (
        <section className="flex flex-col gap-2" aria-label="Resumen por área">
          <h2 className="text-sm font-medium">
            Por área{' '}
            <span className="font-normal text-muted-foreground">· toca una para filtrar</span>
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {areas.map((a) => (
              <button
                key={a.nombre}
                type="button"
                aria-pressed={area === a.nombre}
                onClick={() => cambiar({ area: area === a.nombre ? null : a.nombre })}
                className={cn(
                  'flex min-w-0 flex-col gap-1 rounded-lg border border-border p-3 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  area === a.nombre && 'border-primary bg-primary/5',
                  area && area !== a.nombre && 'opacity-60',
                )}
              >
                <span className="truncate text-xs text-muted-foreground" title={a.nombre}>
                  {a.nombre}
                </span>
                <span className="flex items-center gap-2">
                  <i
                    className={cn('size-2 shrink-0 rounded-full', PUNTO[a.semaforo ?? 'sin-dato'])}
                    aria-hidden
                  />
                  <b className="font-heading text-lg tabular-nums">{formatoIndice(a.indice)}</b>
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {a.personas} persona{a.personas === 1 ? '' : 's'}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <Card className="gap-0 py-0">
        <CardHeader className="pt-6 pb-4">
          <CardTitle>{data?.alcance === 'compania' ? 'Toda la compañía' : 'Mi equipo'}</CardTitle>
          <CardDescription>
            {data?.etiqueta} · {visibles.length} de {todas.length} personas, de mayor a menor
            índice. Toca una para ver su detalle.
          </CardDescription>
          {isFetching && !isLoading && (
            <CardAction>
              <Badge variant="outline">Actualizando…</Badge>
            </CardAction>
          )}
        </CardHeader>

        {isLoading ? (
          <div className="flex flex-col gap-3 p-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 w-full animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : todas.length === 0 ? (
          <Vacio
            icono={<BarChart3Icon />}
            titulo="Todavía no hay ejecución que mostrar"
            descripcion="Cuando haya planes y una lectura de Planner en este periodo, aparecen acá."
          />
        ) : visibles.length === 0 ? (
          <Vacio
            icono={<SearchXIcon />}
            titulo="Nadie con esos filtros"
            descripcion="Prueba con otro nombre u otra área."
            accion={
              <Button size="sm" variant="outline" onClick={limpiar}>
                <XIcon /> Limpiar filtros
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 text-right">#</TableHead>
                <TableHead>Persona</TableHead>
                <TableHead className="hidden md:table-cell">Área</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Weekly</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Daily</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Hito</TableHead>
                <TableHead className="text-right">Índice</TableHead>
                <TableHead className="hidden lg:table-cell">Alertas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibles.map((fila, posicion) => (
                <TableRow
                  key={fila.clave}
                  className={cn('cursor-pointer', fila.id === personaSel && 'bg-muted/60')}
                  onClick={() => fila.id && abrir(fila.id)}
                  onPointerEnter={() => fila.id && precargar(fila.id, semanaDetalle)}
                  onFocus={() => fila.id && precargar(fila.id, semanaDetalle)}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && fila.id && abrir(fila.id)}
                >
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {fila.indice === null ? '—' : posicion + 1}
                  </TableCell>
                  <TableCell className="max-w-56 font-medium whitespace-normal sm:max-w-none">
                    {fila.nombre}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {fila.cargo}
                      <span className="md:hidden">
                        {fila.cargo && fila.area ? ' · ' : ''}
                        {fila.area}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {fila.area}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {formatoPct(fila.pctWeekly)}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {formatoPct(fila.pctDaily)}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums lg:table-cell">
                    {formatoPct(fila.hitoRegistrado)}
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center justify-end gap-2">
                      <b className="tabular-nums">{formatoIndice(fila.indice)}</b>
                      <SemaforoTag semaforo={fila.semaforo} />
                    </span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
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
        )}
        <div className="px-6 py-4">
          <LeyendaSemaforoPlanner parametros={parametros} />
        </div>
      </Card>

      {/* El detalle de la persona, al lado: la lista y los filtros siguen ahí. */}
      <Sheet
        open={personaSel !== null}
        onOpenChange={(abierto) => !abierto && cambiar({ persona: null })}
      >
        <SheetContent className="w-full gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-4xl">
          <SheetHeader className="border-b px-4 py-4 pr-12 sm:px-6">
            <SheetTitle className="text-lg">
              {persona.data?.persona.nombre ?? filaSel?.nombre ?? 'Detalle'}
            </SheetTitle>
            <SheetDescription>
              {[
                persona.data?.persona.cargo ?? filaSel?.cargo,
                persona.data?.persona.area ?? filaSel?.area,
                persona.data?.persona.lider ? `líder ${persona.data.persona.lider}` : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </SheetDescription>
          </SheetHeader>
          <div className="p-4 sm:p-6">
            <DetalleCumplimiento
              datos={persona.data}
              parametros={opciones.parametros}
              onSemana={setSemanaPersona}
              cargando={persona.isLoading}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** Un desplegable de filtro con la opción «todas». */
function FiltroLista({
  etiqueta,
  todas,
  opciones,
  valor,
  onCambio,
}: {
  etiqueta: string;
  todas: string;
  opciones: Array<{ value: string; label: string }>;
  valor: string;
  onCambio: (valor: string | null) => void;
}) {
  const items = [{ value: TODAS, label: todas }, ...opciones];
  return (
    <Select
      items={items}
      value={valor || TODAS}
      onValueChange={(v) => onCambio(v && v !== TODAS ? (v as string) : null)}
    >
      <SelectTrigger aria-label={etiqueta} size="sm" className="w-full sm:w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {items.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function Vacio({
  icono,
  titulo,
  descripcion,
  accion,
}: {
  icono: ReactNode;
  titulo: string;
  descripcion: string;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span className="text-muted-foreground [&_svg]:size-8">{icono}</span>
      <b className="text-sm font-medium">{titulo}</b>
      <p className="text-sm text-muted-foreground">{descripcion}</p>
      {accion}
    </div>
  );
}
