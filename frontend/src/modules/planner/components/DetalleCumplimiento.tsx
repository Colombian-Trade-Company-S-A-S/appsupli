import { AlertTriangleIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui';
import { Kpi } from '@/shared/components/layout';
import { formatoIndice, formatoPct, type Cumplimiento, type ParametrosPlanner } from '../api';
import {
  BarrasSemanas,
  EstadoHitoTag,
  LeyendaSemaforoPlanner,
  Nota,
  Renglon,
  SemaforoTag,
} from './Piezas';

/**
 * El cumplimiento de una persona: índice semanal y mensual, sus últimas
 * semanas en barras y el detalle de la semana elegida. Lo usan «Mi
 * cumplimiento» y el detalle de persona del dashboard.
 */
export function DetalleCumplimiento({
  datos,
  parametros,
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

  return (
    <div className="flex flex-col gap-6">
      {datos && !datos.plan && (
        <Nota>
          Todavía no hay un plan de Planner relacionado con {datos.persona.nombre}. People lo
          relaciona desde «Conexión y calidad»; mientras tanto no hay datos que medir.
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
          hint={conDato ? `${s?.weeklyCompletadas} de ${s?.weeklyBase} tareas` : 'Sin lectura'}
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
              {s?.final ? ' · resultado final' : conDato ? ' · resultado provisional' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col">
            {s && (
              <Renglon
                titulo="Hito"
                detalle={s.hitoTexto || 'Sin tarea HITO en el depósito de la semana'}
                valor={<EstadoHitoTag estado={s.hitoEstado} label={s.hitoEstadoLabel} />}
              />
            )}
            <Renglon
              titulo="Weekly"
              detalle="Tareas WEEKLY completadas al cierre ÷ línea base"
              valor={conDato ? formatoPct(s?.pctWeekly) : '—'}
            />
            <Renglon
              titulo="Daily"
              detalle="Ítems marcados ÷ total de la checklist"
              valor={conDato ? formatoPct(s?.pctDaily) : '—'}
            />
            <Renglon
              titulo="Índice de la semana"
              detalle={`${parametros.pesoWeekly}% Weekly · ${parametros.pesoDaily}% Daily · ${parametros.pesoHito}% Hito`}
              valor={<b className="font-heading">{conDato ? formatoIndice(s?.indice) : '—'}</b>}
            />
            {s?.baseAproximada && (
              <p className="mt-3 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200">
                <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
                No hubo foto del lunes para esta semana: la línea base es la primera lectura
                disponible.
              </p>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              El líder valida el Hito de lunes a miércoles de la semana siguiente.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
