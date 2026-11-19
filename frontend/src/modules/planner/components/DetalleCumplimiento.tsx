import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  CircleIcon,
  FlagIcon,
} from 'lucide-react';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui';
import { Kpi } from '@/shared/components/layout';
import {
  diaCorto,
  formatoIndice,
  formatoPct,
  type Cumplimiento,
  type ParametrosPlanner,
} from '../api';
import {
  BarrasSemanas,
  HitoTag,
  LeyendaSemaforoPlanner,
  Nota,
  Renglon,
  SemaforoTag,
} from './Piezas';

/** «9 nov, 2:00 p. m.» a partir de una fecha con hora. */
const fechaHora = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('es-CO', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—';

/**
 * El cumplimiento de una persona: índice semanal y mensual, sus últimas
 * semanas en barras, el detalle de la semana elegida (con sus Hitos y la
 * trazabilidad de sus tareas). Lo usan «Mi cumplimiento» y el detalle de
 * persona del dashboard.
 *
 * Reglas de People (v3): las tareas creadas después del corte cuentan en la
 * semana; el Hito queda registrado si su checklist tiene al menos un ítem, sin
 * validación; cada semana se calcula con la versión de parámetros que regía.
 */
export function DetalleCumplimiento({
  datos,
  parametros: parametrosPorDefecto,
  onSemana,
  cargando = false,
}: {
  datos?: Cumplimiento;
  parametros: ParametrosPlanner;
  onSemana: (codigo: string) => void;
  cargando?: boolean;
}) {
  const s = datos?.actual;
  const conDato = !!s?.conDato;
  // La versión que rige la semana elegida, no la de hoy.
  const parametros = datos?.parametros ?? parametrosPorDefecto;
  const sinComponente = conDato && (s?.pctWeekly === null || s?.pctDaily === null);

  return (
    <div className="flex flex-col gap-6">
      {datos && !datos.plan && (
        <Nota>
          {datos.persona.nombre} todavía no tiene plan: falta su URL de Planner en Gestión de
          usuarios. Mientras tanto no hay datos que medir.
        </Nota>
      )}
      {datos && !datos.persona.seMide && (
        <Nota>
          {datos.persona.nombre} no entra en la medición: hace falta correo @supli.tech y el switch
          «Planner» encendido en Gestión de usuarios.
        </Nota>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Índice semanal"
          cargando={cargando}
          value={conDato ? formatoIndice(s?.indice) : '—'}
          hint={datos ? `${datos.semana.etiqueta} · ${datos.semana.rango}` : ''}
          extra={<SemaforoTag semaforo={conDato ? s?.semaforo : null} />}
        />
        <Kpi
          label="Índice mensual"
          cargando={cargando}
          value={formatoIndice(datos?.indiceMensual)}
          hint={datos ? `Promedio de las semanas del mes (${datos.semanasDelMes})` : ''}
          extra={<SemaforoTag semaforo={datos?.semaforoMensual} />}
        />
        <Kpi
          label="% Weekly"
          cargando={cargando}
          value={conDato ? formatoPct(s?.pctWeekly) : '—'}
          hint={
            conDato
              ? `${s?.weeklyCompletadas} de ${s?.weeklyTotal} tareas${
                  s?.weeklyAgregadas ? ` · ${s.weeklyAgregadas} agregadas después del corte` : ''
                }`
              : 'Sin lectura'
          }
        />
        <Kpi
          label="% Daily"
          cargando={cargando}
          value={conDato ? formatoPct(s?.pctDaily) : '—'}
          hint={
            conDato
              ? s?.dailyItems
                ? `${s?.dailyMarcados} de ${s?.dailyItems} ítems`
                : 'Sin checklist'
              : 'Sin lectura'
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Índice Planner por semana</CardTitle>
            <CardDescription>
              La barra resaltada es la semana seleccionada. Toca otra para verla.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {datos && (
              <BarrasSemanas
                historia={datos.historia}
                seleccionada={datos.semana.codigo}
                onSeleccionar={onSemana}
              />
            )}
            <LeyendaSemaforoPlanner parametros={parametros} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Detalle de la semana</CardTitle>
            <CardDescription>
              {datos ? `${datos.semana.etiqueta} · ${datos.semana.rango}` : ''}
              {s?.final ? ' · semana cerrada' : conDato ? ' · resultado provisional' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col">
            {s && (
              <Renglon
                titulo="Hito"
                detalle={
                  s.hitoRegistrado
                    ? `${s.hitosRegistrados} tarea(s) HITO con ítems en la checklist`
                    : 'Sin tarea HITO con ítems en el depósito de la semana'
                }
                valor={<HitoTag registrado={s.hitoRegistrado} />}
              />
            )}
            <Renglon
              titulo="Weekly"
              detalle="Completadas ÷ las de la línea base más las agregadas después del corte"
              valor={conDato ? formatoPct(s?.pctWeekly) : '—'}
            />
            <Renglon
              titulo="Daily"
              detalle="Ítems marcados ÷ total de la checklist"
              valor={conDato ? formatoPct(s?.pctDaily) : '—'}
            />
            <Renglon
              titulo="Índice de la semana"
              detalle={`${parametros.pesoWeekly}% Weekly · ${parametros.pesoDaily}% Daily · ${parametros.pesoHito}% Hito (versión que rige desde el ${diaCorto(parametros.vigenteDesde)})`}
              valor={<b className="font-heading">{conDato ? formatoIndice(s?.indice) : '—'}</b>}
            />
            {sinComponente && (
              <p className="mt-3 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200">
                <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
                La semana no tuvo{' '}
                {s?.pctWeekly === null && s?.pctDaily === null
                  ? 'Weekly ni Daily: no tiene índice'
                  : s?.pctWeekly === null
                    ? 'tareas Weekly: su peso se repartió entre Daily e Hito'
                    : 'ítems Daily: su peso se repartió entre Weekly e Hito'}
                .
              </p>
            )}
            {s?.baseAproximada && (
              <p className="mt-3 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200">
                <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
                No hubo foto del corte para esta semana: la línea base es la primera lectura
                disponible.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {datos && datos.hitos.length > 0 && <HitosDeLaSemana datos={datos} />}
      {datos && datos.tareas.length > 0 && <TareasDeLaSemana datos={datos} />}
    </div>
  );
}

/** Los Hitos de la semana con los ítems de su checklist, tal como están en Planner. */
function HitosDeLaSemana({ datos }: { datos: Cumplimiento }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlagIcon className="size-4 text-primary" />
          Hitos de la semana
        </CardTitle>
        <CardDescription>
          Un Hito queda registrado con al menos un ítem en su checklist. No hace falta completarlo
          ni marcar los ítems.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        {datos.hitos.map((hito, i) => (
          <div key={`${hito.titulo}-${i}`} className="flex flex-col gap-2 rounded-lg border p-3">
            <div className="flex items-start justify-between gap-2">
              <b className="text-sm font-medium">{hito.titulo || 'HITO'}</b>
              <HitoTag registrado={hito.registrado} />
            </div>
            {hito.items.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {hito.items.map((item, j) => (
                  <li key={j} className="flex items-start gap-2 text-sm">
                    {item.marcado ? (
                      <CheckCircle2Icon className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                    ) : (
                      <CircleIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 text-pretty">{item.titulo || 'Ítem sin texto'}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                {hito.totalItems
                  ? `${hito.totalItems} ítem(s); el texto llega en la próxima lectura.`
                  : 'Sin ítems en la checklist: no cuenta como registrado.'}
              </p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** La trazabilidad: cuándo entró cada tarea a la medición y por dónde se movió. */
function TareasDeLaSemana({ datos }: { datos: Cumplimiento }) {
  return (
    <Card className="gap-0 pb-0">
      <CardHeader className="pb-4">
        <CardTitle>Tareas de la semana</CardTitle>
        <CardDescription>
          Cuándo se creó cada tarea, cuándo entró a la medición (en el corte o después) y sus
          cambios de depósito.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tarea</TableHead>
              <TableHead className="hidden md:table-cell">Creada</TableHead>
              <TableHead>Entró a la medición</TableHead>
              <TableHead className="hidden sm:table-cell">Depósito</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {datos.tareas.map((t, i) => (
              <TableRow key={`${t.titulo}-${i}`}>
                <TableCell className="max-w-56 whitespace-normal sm:max-w-none">
                  <span className="flex flex-wrap items-center gap-1.5 font-medium">
                    {t.completada && (
                      <CheckCircle2Icon className="size-3.5 shrink-0 text-emerald-600" />
                    )}
                    {t.titulo}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {t.etiquetas.map((e) => (
                      <Badge key={e} variant="outline" className="text-[10px]">
                        {e}
                      </Badge>
                    ))}
                  </span>
                  {t.movimientos.length > 0 && (
                    <ul className="mt-1.5 flex flex-col gap-0.5">
                      {t.movimientos.map((m, j) => (
                        <li
                          key={j}
                          className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground"
                        >
                          {m.desde} <ArrowRightIcon className="size-3" /> {m.hacia} ·{' '}
                          {fechaHora(m.at)}
                        </li>
                      ))}
                    </ul>
                  )}
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                  {fechaHora(t.creadaAt)}
                </TableCell>
                <TableCell className="text-sm">
                  {t.enLineaBase ? (
                    <Badge variant="secondary">En el corte</Badge>
                  ) : (
                    <span className="flex flex-col">
                      <Badge variant="outline" className="self-start">
                        Después del corte
                      </Badge>
                      <span className="text-xs text-muted-foreground">{fechaHora(t.entroAt)}</span>
                    </span>
                  )}
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                  {t.deposito || '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
