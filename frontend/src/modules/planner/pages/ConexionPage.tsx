import { useMemo, useState } from 'react';
import {
  DatabaseZapIcon,
  PlugZapIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldCheckIcon,
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
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui';
import { EstadoTabla, Kpi } from '@/shared/components/layout';
import { formatoFechaHora } from '@/shared/lib/formato';
import { cn } from '@/shared/lib/utils';
import type { PlanRelacion, Planes } from '../api';
import { useConexion, useEditarPlan, useInventario, usePlanes, useSincronizar } from '../hooks';
import { Nota } from '../components/Piezas';

type FiltroPlanes = 'medidos' | 'sin-persona' | 'todos';

/**
 * La conexión con Planner y la calidad del dato. Solo People.
 *
 * Desde acá se lee Planner a mano, se descubren los planes de la empresa, se
 * relaciona cada plan con su persona y se revisa lo que está fuera del
 * estándar antes de que afecte el cálculo.
 */
export default function ConexionPage() {
  const [probar, setProbar] = useState(false);
  const { data, isLoading } = useConexion(probar);
  const sincronizar = useSincronizar();
  const inventario = useInventario();
  const ultima = data?.ultimaLectura;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Lectura de Microsoft Planner</CardTitle>
          <CardDescription>
            Sincronización nocturna a las 02:00 COT, línea base el lunes a las 18:00 y cierre el
            domingo a las 23:59. Solo lectura: Tech mantiene los permisos de la aplicación en
            Microsoft Graph.
          </CardDescription>
          <CardAction className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setProbar(true)}
              disabled={probar && isLoading}
            >
              <PlugZapIcon /> Probar conexión
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => inventario.mutate()}
              disabled={inventario.isPending}
            >
              <DatabaseZapIcon /> {inventario.isPending ? 'Buscando planes…' : 'Descubrir planes'}
            </Button>
            <Button size="sm" onClick={() => sincronizar.mutate()} disabled={sincronizar.isPending}>
              <RefreshCwIcon className={cn(sincronizar.isPending && 'animate-spin')} />
              {sincronizar.isPending ? 'Leyendo Planner…' : 'Sincronizar ahora'}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {data?.estadoGraph && (
            <p
              className={cn(
                'rounded-lg border px-3 py-2 text-sm',
                data.estadoGraph.conectado
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200'
                  : 'border-red-500/40 bg-red-500/10 text-red-900 dark:text-red-200',
              )}
            >
              {data.estadoGraph.mensaje}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              label="Última lectura"
              cargando={isLoading}
              value={ultima ? formatoFechaHora(ultima.iniciadaAt) : 'Nunca'}
              hint={
                ultima
                  ? `${ultima.tipoLabel} · ${ultima.ejecutadaPor}`
                  : 'Todavía no se ha leído Planner'
              }
            />
            <Kpi
              label="Planes relacionados"
              cargando={isLoading}
              value={`${data?.personasConPlan ?? 0} de ${data?.personasMedidas ?? 0}`}
              hint="Personas con el sub-módulo que tienen plan"
            />
            <Kpi
              label="Incidencias de calidad"
              cargando={isLoading}
              value={data?.incidenciasAbiertas ?? 0}
              hint={`${data?.incidenciasCriticas ?? 0} críticas`}
            />
            <Kpi
              label="Errores de sincronización"
              cargando={isLoading}
              value={ultima?.errores.length ?? 0}
              hint={
                ultima
                  ? `${ultima.planesLeidos} planes leídos · ${ultima.estadoLabel}`
                  : 'Última corrida'
              }
            />
          </div>
          {ultima?.error && (
            <p className="text-sm text-red-700 dark:text-red-300">{ultima.error}</p>
          )}
        </CardContent>
      </Card>

      <Card className="py-0">
        <CardHeader className="pt-6">
          <CardTitle>Panel de calidad del dato</CardTitle>
          <CardDescription>
            Lo crítico deja a la persona fuera del cálculo; las alertas se leen igual, pero conviene
            corregirlas en Planner.
          </CardDescription>
        </CardHeader>
        <EstadoTabla
          cargando={isLoading}
          vacio={(data?.incidencias.length ?? 0) === 0}
          icono={<ShieldCheckIcon />}
          titulo="Sin incidencias abiertas"
          descripcion="Todos los planes leídos cumplen el estándar en la semana en curso."
          filas={4}
        >
          <ul className="flex flex-col px-6 pb-6">
            {data?.incidencias.map((i) => (
              <li
                key={i.id}
                className="flex items-start gap-3 border-b border-border py-3 last:border-0"
              >
                <Badge
                  variant="outline"
                  className={cn(
                    'shrink-0',
                    i.severidad === 'critica'
                      ? 'border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-200'
                      : 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200',
                  )}
                >
                  {i.tipoLabel}
                </Badge>
                <div className="flex min-w-0 flex-col">
                  <b className="text-sm font-medium">
                    {i.quien}
                    {i.semana && (
                      <span className="font-normal text-muted-foreground"> · {i.semana}</span>
                    )}
                  </b>
                  <small className="text-xs text-pretty text-muted-foreground">{i.detalle}</small>
                </div>
              </li>
            ))}
          </ul>
        </EstadoTabla>
      </Card>

      <RelacionPlanes />

      <Card className="py-0">
        <CardHeader className="pt-6">
          <CardTitle>Bitácora de lecturas</CardTitle>
          <CardDescription>
            Las últimas 15, incluidas las tareas programadas y los inventarios.
          </CardDescription>
        </CardHeader>
        <EstadoTabla
          cargando={isLoading}
          vacio={(data?.lecturas.length ?? 0) === 0}
          icono={<RefreshCwIcon />}
          titulo="Sin lecturas todavía"
          descripcion="Usa «Descubrir planes» y luego «Sincronizar ahora» para la primera lectura."
          filas={3}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Semana</TableHead>
                <TableHead>Quién</TableHead>
                <TableHead className="text-right">Planes</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.lecturas.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="tabular-nums">{formatoFechaHora(l.iniciadaAt)}</TableCell>
                  <TableCell>{l.tipoLabel}</TableCell>
                  <TableCell>{l.semana || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{l.ejecutadaPor}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.planesLeidos}</TableCell>
                  <TableCell>
                    <span
                      title={
                        l.error ||
                        l.errores.map((e) => `${e.plan ?? e.grupo}: ${e.error}`).join('\n')
                      }
                      className={cn(
                        'text-sm',
                        l.estado === 'ok' && 'text-emerald-700 dark:text-emerald-300',
                        l.estado === 'parcial' && 'text-amber-700 dark:text-amber-300',
                        l.estado === 'error' && 'text-red-700 dark:text-red-300',
                      )}
                    >
                      {l.estadoLabel}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </EstadoTabla>
      </Card>
    </div>
  );
}

/** La relación plan–persona: People elige a quién pertenece cada plan y si se mide. */
function RelacionPlanes() {
  const { data, isLoading } = usePlanes();
  const [filtro, setFiltro] = useState<FiltroPlanes>('medidos');
  const [busqueda, setBusqueda] = useState('');

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return (data?.planes ?? []).filter((p) => {
      if (filtro === 'medidos' && !(p.activo && p.colaboradorId)) return false;
      if (filtro === 'sin-persona' && (p.colaboradorId || !p.activo)) return false;
      if (!texto) return true;
      return [p.titulo, p.grupo, p.colaborador].some((v) => v.toLowerCase().includes(texto));
    });
  }, [data, filtro, busqueda]);

  return (
    <Card className="py-0">
      <CardHeader className="pt-6">
        <CardTitle>Relación plan – persona</CardTitle>
        <CardDescription>
          Cada plan se relaciona por su ID, no por su nombre. «Descubrir planes» propone la persona
          por el nombre del plan; acá se corrige.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {data && data.sinPlan.length > 0 && (
          <Nota>
            {data.sinPlan.length} persona(s) con el sub-módulo todavía sin plan:{' '}
            {data.sinPlan.map((p) => p.nombre).join(', ')}.
          </Nota>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-border p-0.5">
            {(
              [
                ['medidos', 'Relacionados'],
                ['sin-persona', 'Sin persona'],
                ['todos', 'Todos'],
              ] as const
            ).map(([valor, texto]) => (
              <Button
                key={valor}
                size="sm"
                variant={filtro === valor ? 'secondary' : 'ghost'}
                aria-pressed={filtro === valor}
                onClick={() => setFiltro(valor)}
              >
                {texto}
              </Button>
            ))}
          </div>
          <div className="relative w-full sm:w-64">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar plan, grupo o persona"
              className="pl-8"
              aria-label="Buscar plan"
            />
          </div>
        </div>
      </CardContent>
      <EstadoTabla
        cargando={isLoading}
        vacio={visibles.length === 0}
        icono={<DatabaseZapIcon />}
        titulo="No hay planes en esta vista"
        descripcion="Usa «Descubrir planes» para traer los planes de todos los grupos de Microsoft 365."
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Plan en Planner</TableHead>
              <TableHead>Grupo</TableHead>
              <TableHead>Persona</TableHead>
              <TableHead>Se mide</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibles.map((p) => (
              <FilaPlan key={p.id} plan={p} personas={data?.personas ?? []} />
            ))}
          </TableBody>
        </Table>
      </EstadoTabla>
    </Card>
  );
}

const ESTILO_ESTADO: Record<PlanRelacion['estado'], string> = {
  Relacionado: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
  'Sin persona': 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200',
  Inaccesible: 'border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-200',
  Inactivo: 'border-border bg-muted text-muted-foreground',
};

function FilaPlan({ plan, personas }: { plan: PlanRelacion; personas: Planes['personas'] }) {
  const editar = useEditarPlan();
  const opciones = [
    { value: '0', label: 'Sin persona' },
    ...personas
      .filter((p) => !p.tienePlan || p.id === plan.colaboradorId)
      .map((p) => ({
        value: String(p.id),
        label: p.cargo ? `${p.nombre} · ${p.cargo}` : p.nombre,
      })),
  ];
  return (
    <TableRow>
      <TableCell className="font-medium">
        {plan.titulo}
        <span className="block text-[11px] font-normal text-muted-foreground">
          {plan.tareas} tareas
          {plan.ultimaTareaCreada ? ` · última creada ${plan.ultimaTareaCreada}` : ''}
        </span>
      </TableCell>
      <TableCell className="text-muted-foreground">{plan.grupo || '—'}</TableCell>
      <TableCell className="min-w-60">
        <Select
          items={opciones}
          value={String(plan.colaboradorId ?? 0)}
          onValueChange={(v) => editar.mutate({ id: plan.id, colaborador: Number(v) || null })}
          disabled={editar.isPending}
        >
          <SelectTrigger aria-label={`Persona del plan ${plan.titulo}`} className="w-full">
            <SelectValue placeholder="Sin persona" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {opciones.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Switch
          checked={plan.activo}
          onCheckedChange={(activo) => editar.mutate({ id: plan.id, activo })}
          disabled={editar.isPending}
          aria-label={`Medir el plan ${plan.titulo}`}
        />
      </TableCell>
      <TableCell>
        <span
          title={plan.errorLectura}
          className={cn(
            'inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium',
            ESTILO_ESTADO[plan.estado],
          )}
        >
          {plan.estado}
        </span>
      </TableCell>
    </TableRow>
  );
}
