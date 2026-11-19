import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ExternalLinkIcon,
  ListChecksIcon,
  PencilIcon,
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
import type { EstadoPlan, PlanDePersona } from '../api';
import { useAvisoDeLectura, useConexion, usePlanes, useSincronizar } from '../hooks';
import { Nota } from '../components/Piezas';

type FiltroPlanes = 'con-plan' | 'sin-plan' | 'todos';

/**
 * La conexión con Planner y la calidad del dato. Solo People.
 *
 * Desde acá se lee Planner a mano, se consulta el plan de cada persona y se
 * revisa lo que está fuera del estándar antes de que afecte el cálculo. El
 * plan de cada persona sale de su URL de Planner, que se pone en Gestión de
 * usuarios: aquí ya no se descubren ni se relacionan planes.
 */
export default function ConexionPage() {
  const [probar, setProbar] = useState(false);
  const { data, isLoading } = useConexion(probar);
  const sincronizar = useSincronizar();
  const ultima = data?.ultimaLectura;
  // La lectura corre en el servidor: sigue «leyendo» aunque se recargue la página.
  const leyendo = sincronizar.isPending || !!ultima?.enCurso;
  useAvisoDeLectura(ultima);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Lectura de Microsoft Planner</CardTitle>
          <CardDescription>
            Lectura nocturna a las 2:00 a. m. COT y corte el lunes a las 9:00 a. m. (martes si es
            festivo), que cierra la semana anterior y toma la línea base de la nueva. Solo se leen
            los planes de las URLs de Planner de cada persona. Solo lectura: Tech mantiene los
            permisos de la aplicación en Microsoft Graph.
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
              size="sm"
              onClick={() => {
                // La prueba de conexión no se repite en cada consulta mientras se lee.
                setProbar(false);
                sincronizar.mutate();
              }}
              disabled={leyendo}
            >
              <RefreshCwIcon className={cn(leyendo && 'animate-spin')} />
              {leyendo ? 'Leyendo Planner…' : 'Sincronizar ahora'}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {ultima?.enCurso && (
            <p className="flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-900 dark:text-sky-200">
              <RefreshCwIcon className="size-4 shrink-0 animate-spin" />
              <span>
                {ultima.tipoLabel} en curso desde {formatoFechaHora(ultima.iniciadaAt)} (
                {ultima.ejecutadaPor}). Tarda unos minutos: esta página se actualiza sola y puedes
                seguir usando la app.
              </span>
            </p>
          )}
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
              label="Personas con plan"
              cargando={isLoading}
              value={`${data?.personasConPlan ?? 0} de ${data?.personasMedidas ?? 0}`}
              hint="De las que se miden, las que tienen URL de Planner"
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

      <PlanesPorPersona />

      <Card className="py-0">
        <CardHeader className="pt-6">
          <CardTitle>Bitácora de lecturas</CardTitle>
          <CardDescription>Las últimas 15, incluidas las tareas programadas.</CardDescription>
        </CardHeader>
        <EstadoTabla
          cargando={isLoading}
          vacio={(data?.lecturas.length ?? 0) === 0}
          icono={<RefreshCwIcon />}
          titulo="Sin lecturas todavía"
          descripcion="Usa «Sincronizar ahora» para la primera lectura."
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
                        l.enCurso
                          ? 'text-sky-700 dark:text-sky-300'
                          : {
                              ok: 'text-emerald-700 dark:text-emerald-300',
                              parcial: 'text-amber-700 dark:text-amber-300',
                              error: 'text-red-700 dark:text-red-300',
                            }[l.estado],
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

const CON_PLAN: EstadoPlan[] = ['Leído', 'Sin leer', 'Inaccesible'];

/** El plan de cada persona con correo @supli.tech. Solo consulta: se cambia en Gestión de usuarios. */
function PlanesPorPersona() {
  const { data, isLoading } = usePlanes();
  const [filtro, setFiltro] = useState<FiltroPlanes>('con-plan');
  const [busqueda, setBusqueda] = useState('');

  const sinPlanQueSeMiden = (data?.personas ?? []).filter(
    (p) => p.seMide && !CON_PLAN.includes(p.estado),
  );

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return (data?.personas ?? []).filter((p) => {
      const conPlan = CON_PLAN.includes(p.estado);
      if (filtro === 'con-plan' && !conPlan) return false;
      if (filtro === 'sin-plan' && conPlan) return false;
      if (!texto) return true;
      return [p.nombre, p.cargo, p.plan?.titulo ?? '', p.plan?.grupo ?? ''].some((v) =>
        v.toLowerCase().includes(texto),
      );
    });
  }, [data, filtro, busqueda]);

  return (
    <Card className="py-0">
      <CardHeader className="pt-6">
        <CardTitle>Plan de cada persona</CardTitle>
        <CardDescription>
          Sale de la URL de Planner de cada persona. Para ponerlo o cambiarlo, edita a la persona en
          Gestión de usuarios.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {sinPlanQueSeMiden.length > 0 && (
          <Nota>
            {sinPlanQueSeMiden.length} persona(s) que se miden todavía sin un plan válido:{' '}
            {sinPlanQueSeMiden.map((p) => p.nombre).join(', ')}.
          </Nota>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-border p-0.5">
            {(
              [
                ['con-plan', 'Con plan'],
                ['sin-plan', 'Sin plan'],
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
              placeholder="Buscar persona, plan o grupo"
              className="pl-8"
              aria-label="Buscar"
            />
          </div>
        </div>
      </CardContent>
      <EstadoTabla
        cargando={isLoading}
        vacio={visibles.length === 0}
        icono={<ListChecksIcon />}
        titulo="Nadie en esta vista"
        descripcion="La URL de Planner de cada persona se pone en Gestión de usuarios."
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Persona</TableHead>
              <TableHead>Plan en Planner</TableHead>
              <TableHead className="hidden md:table-cell">Se mide</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibles.map((p) => (
              <FilaPersona key={p.id} persona={p} />
            ))}
          </TableBody>
        </Table>
      </EstadoTabla>
    </Card>
  );
}

const ESTILO_ESTADO: Record<EstadoPlan, string> = {
  Leído: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
  'Sin leer': 'border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-200',
  Inaccesible: 'border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-200',
  'URL no válida': 'border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-200',
  'Sin URL': 'border-border bg-muted text-muted-foreground',
};

function FilaPersona({ persona: p }: { persona: PlanDePersona }) {
  return (
    <TableRow>
      <TableCell className="font-medium">
        {p.nombre}
        {p.cargo && (
          <span className="block text-[11px] font-normal text-muted-foreground">{p.cargo}</span>
        )}
      </TableCell>
      <TableCell className="max-w-72 whitespace-normal">
        {p.plan ? (
          <>
            {p.plan.titulo || (
              <span className="text-muted-foreground">Se lee en la próxima sincronización</span>
            )}
            <span className="block text-[11px] text-muted-foreground">
              {[
                p.plan.grupo,
                p.plan.ultimaLecturaAt ? `${p.plan.tareas} tareas` : '',
                p.plan.ultimaTareaCreada ? `última creada ${p.plan.ultimaTareaCreada}` : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="hidden text-muted-foreground md:table-cell">
        {p.seMide ? 'Sí' : 'No'}
      </TableCell>
      <TableCell>
        <span
          title={p.plan?.errorLectura || undefined}
          className={cn(
            'inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
            ESTILO_ESTADO[p.estado],
          )}
        >
          {p.estado}
        </span>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          {p.url && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Abrir el plan de ${p.nombre} en Planner`}
              render={<a href={p.url} target="_blank" rel="noreferrer" />}
            >
              <ExternalLinkIcon />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Cambiar la URL de Planner de ${p.nombre} en Gestión de usuarios`}
            render={<Link to={`/inicio/admin/usuarios/${p.id}`} />}
          >
            <PencilIcon />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
