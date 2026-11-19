import type { ReactNode } from 'react';
import { InfoIcon } from 'lucide-react';
import {
  Field,
  FieldLabel,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui';
import { cn } from '@/shared/lib/utils';
import {
  formatoIndice,
  type ParametrosPlanner,
  type SemaforoPlanner,
  type SemanaInfo,
  type SemanaPersona,
} from '../api';

/**
 * Los colores del semáforo y de los estados del Hito.
 *
 * Significan algo concreto (en meta, en riesgo, brecha), así que van fuera de
 * la paleta del sistema, igual que el semáforo de Objetivos y KPIs.
 */
const ESTILO: Record<SemaforoPlanner, string> = {
  verde: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200',
  ambar: 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200',
  rojo: 'border-red-500/40 bg-red-500/10 text-red-900 dark:text-red-200',
};
const TEXTO: Record<SemaforoPlanner, string> = { verde: 'Verde', ambar: 'Ámbar', rojo: 'Rojo' };
const BARRA: Record<SemaforoPlanner, string> = {
  verde: 'bg-emerald-500',
  ambar: 'bg-amber-500',
  rojo: 'bg-red-500',
};

export function SemaforoTag({ semaforo }: { semaforo: SemaforoPlanner | null | undefined }) {
  if (!semaforo) return <span className="text-sm text-muted-foreground">Sin dato</span>;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        ESTILO[semaforo],
      )}
    >
      {TEXTO[semaforo]}
    </span>
  );
}

/**
 * Si el Hito de la semana quedó registrado: hay una tarea HITO en el depósito
 * de la semana con al menos un ítem en su checklist. Ya no se valida.
 */
export function HitoTag({ registrado }: { registrado: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        registrado ? ESTILO.verde : 'border-border bg-muted text-muted-foreground',
      )}
    >
      {registrado ? 'Registrado' : 'No registrado'}
    </span>
  );
}

export function LeyendaSemaforoPlanner({ parametros }: { parametros?: ParametrosPlanner }) {
  const verde = parametros?.verdeDesde ?? 80;
  const ambar = parametros?.ambarDesde ?? 60;
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <i className="size-2 rounded-full bg-emerald-500" aria-hidden /> Verde desde {verde}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <i className="size-2 rounded-full bg-amber-500" aria-hidden /> Ámbar desde {ambar}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <i className="size-2 rounded-full bg-red-500" aria-hidden /> Rojo por debajo de {ambar}
      </span>
    </p>
  );
}

/** El desplegable de semanas: «WEEK 46 · 9–15 nov». */
export function SelectorSemana({
  id,
  semanas,
  value,
  onChange,
  label = 'Semana',
}: {
  id: string;
  semanas: SemanaInfo[];
  value: string;
  onChange: (codigo: string) => void;
  label?: string;
}) {
  const opciones = semanas.map((s) => ({ value: s.codigo, label: `${s.etiqueta} · ${s.rango}` }));
  return (
    <Field className="w-full min-w-0 sm:w-64">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select items={opciones} value={value} onValueChange={(v) => onChange((v as string) ?? '')}>
        <SelectTrigger id={id}>
          <SelectValue placeholder="Elige la semana" />
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
    </Field>
  );
}

/** Índice por semana: barras con el valor encima; la semana elegida, resaltada. */
export function BarrasSemanas({
  historia,
  seleccionada,
  onSeleccionar,
}: {
  historia: SemanaPersona[];
  seleccionada: string;
  onSeleccionar?: (codigo: string) => void;
}) {
  return (
    <div
      className="flex h-48 items-end gap-2 sm:gap-3"
      role="list"
      aria-label="Índice Planner por semana"
    >
      {historia.map((s) => {
        const valor = s.conDato ? (s.indice ?? 0) : null;
        const activa = s.semana === seleccionada;
        return (
          <button
            key={s.semana}
            type="button"
            role="listitem"
            onClick={() => onSeleccionar?.(s.semana)}
            aria-current={activa ? 'true' : undefined}
            aria-label={`${s.etiqueta}: ${valor === null ? 'sin dato' : formatoIndice(valor)}`}
            className={cn(
              'group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1 rounded-md pb-1 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              activa && 'bg-muted/70',
            )}
          >
            <b className="font-heading text-xs tabular-nums">
              {valor === null ? '—' : formatoIndice(valor)}
            </b>
            <i
              className={cn(
                'w-full max-w-10 rounded-t-md transition-[height] duration-500',
                valor === null ? 'bg-muted' : s.semaforo ? BARRA[s.semaforo] : 'bg-primary',
                !activa && 'opacity-70 group-hover:opacity-100',
              )}
              style={{ height: `${Math.max(4, (valor ?? 0) * 0.75)}%` }}
            />
            <span className="text-[11px] whitespace-nowrap text-muted-foreground">
              {s.etiqueta.replace('WEEK ', 'Sem. ')}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Un renglón «etiqueta / explicación — valor» del detalle de la semana. */
export function Renglon({
  titulo,
  detalle,
  valor,
}: {
  titulo: string;
  detalle?: string;
  valor: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-3 last:border-0">
      <div className="flex min-w-0 flex-col">
        <b className="text-sm font-medium">{titulo}</b>
        {detalle && <small className="text-xs text-pretty text-muted-foreground">{detalle}</small>}
      </div>
      <div className="shrink-0 text-right tabular-nums">{valor}</div>
    </div>
  );
}

/** Aviso suave, para «por confirmar con People» y notas del cálculo. */
export function Nota({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'flex items-start gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-pretty text-muted-foreground',
        className,
      )}
    >
      <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
