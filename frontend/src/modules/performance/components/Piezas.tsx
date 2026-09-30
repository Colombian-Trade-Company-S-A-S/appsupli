import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangleIcon, CheckCircle2Icon, LockIcon, UnlockIcon } from 'lucide-react';
import {
  Badge,
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
import type { CortesSemaforo, EstadoPeriodo, Ponderacion, Semaforo } from '../api';

/** Un desplegable con su etiqueta. Todos los del módulo son obligatorios. */
export function Selector({
  id,
  label,
  placeholder,
  value,
  onChange,
  opciones,
  className,
  disabled = false,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (valor: string) => void;
  opciones: Array<{ value: string; label: string }>;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <Field className={className ?? 'min-w-0'}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        items={opciones}
        value={value}
        disabled={disabled}
        onValueChange={(v) => onChange((v as string) ?? '')}
      >
        <SelectTrigger id={id}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {opciones.map((opcion) => (
              <SelectItem key={opcion.value} value={opcion.value}>
                {opcion.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

/**
 * El banner del 100% de ponderación.
 *
 * Es la regla 1 de la especificación puesta a la vista: mientras los objetivos
 * de la persona no sumen 100, el mes no se puede poner en medición. Se pinta
 * ámbar mientras falta y verde cuando cierra, como en el mockup aprobado —son
 * los dos únicos colores fuera del sistema, y aquí significan algo—.
 */
export function BannerPonderacion({ ponderacion }: { ponderacion?: Ponderacion }) {
  const asignado = ponderacion?.pesoAsignado ?? 0;
  const completo = ponderacion?.completo ?? false;
  const falta = Math.max(0, 100 - asignado);

  return (
    <div
      role="status"
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm',
        completo
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200'
          : 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200',
      )}
    >
      {completo ? (
        <CheckCircle2Icon className="size-4 shrink-0" />
      ) : (
        <AlertTriangleIcon className="size-4 shrink-0" />
      )}
      <span>
        <b className="font-semibold tabular-nums">{asignado}%</b> de ponderación asignada
      </span>
      <div className="h-2 w-full max-w-[280px] overflow-hidden rounded-full border border-black/5 bg-background">
        <div
          className="h-full rounded-full bg-current opacity-60 transition-[width] duration-300"
          style={{ width: `${Math.min(100, asignado)}%` }}
        />
      </div>
      <span className="text-xs">
        {completo
          ? 'Listo: el mes de esta persona ya se puede poner en medición.'
          : `falta ${falta.toFixed(0).replace(/\.0$/, '')}% — el mes no se puede activar hasta llegar a 100%`}
      </span>
      {ponderacion && (
        <Badge variant="outline" className="ml-auto shrink-0 bg-background">
          {ponderacion.objetivos} de {ponderacion.maximoObjetivos} objetivos
        </Badge>
      )}
    </div>
  );
}

/** El estado del mes, con el mismo texto en todas las pantallas. */
export function EstadoDelMes({ estado, label }: { estado: EstadoPeriodo; label: string }) {
  return (
    <Badge variant={estado === 'definicion' ? 'secondary' : 'default'} className="shrink-0">
      {label}
    </Badge>
  );
}

/**
 * El semáforo de cumplimiento, con los cortes que cerró People (A2).
 *
 * Verde desde 100, naranja de 85 a 99.9 y rojo por debajo. Los tres colores
 * significan algo concreto, así que van fuera de la paleta del sistema, igual
 * que el banner del 100%.
 */
const ESTILO_SEMAFORO: Record<Semaforo, string> = {
  verde: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200',
  naranja: 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200',
  rojo: 'border-red-500/40 bg-red-500/10 text-red-900 dark:text-red-200',
};

const TEXTO_SEMAFORO: Record<Semaforo, string> = {
  verde: 'En meta',
  naranja: 'En riesgo',
  rojo: 'Brecha',
};

export function SemaforoBadge({
  semaforo,
  cumplimiento,
}: {
  semaforo: Semaforo | null;
  cumplimiento?: number | string | null;
}) {
  if (!semaforo) {
    return <span className="text-sm text-muted-foreground">Sin cargar</span>;
  }
  const valor = cumplimiento === null || cumplimiento === undefined ? null : Number(cumplimiento);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        ESTILO_SEMAFORO[semaforo],
      )}
    >
      {valor !== null && <b className="tabular-nums">{valor.toFixed(0)}%</b>}
      {TEXTO_SEMAFORO[semaforo]}
    </span>
  );
}

const COLOR_ANILLO: Record<Semaforo, string> = {
  verde: 'text-emerald-500',
  naranja: 'text-amber-500',
  rojo: 'text-red-500',
};

/**
 * Anillo de cumplimiento: el % en el centro y el arco en el color del
 * semáforo. El arco se llena al aparecer. Por encima de 100 el anillo queda
 * lleno; el número sigue diciendo cuánto se pasó.
 */
export function AnilloCumplimiento({
  cumplimiento,
  semaforo,
  tamano = 64,
  className,
}: {
  cumplimiento: number | string | null | undefined;
  semaforo: Semaforo | null | undefined;
  tamano?: number;
  className?: string;
}) {
  const [lleno, setLleno] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setLleno(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const valor = cumplimiento === null || cumplimiento === undefined ? null : Number(cumplimiento);
  const radio = 42;
  const perimetro = 2 * Math.PI * radio;
  const avance = valor === null ? 0 : Math.max(0, Math.min(100, valor)) / 100;
  const texto = valor === null ? '—' : `${valor.toFixed(0)}%`;

  return (
    <div
      role="img"
      aria-label={valor === null ? 'Sin cumplimiento cargado' : `${valor.toFixed(0)}% de cumplimiento`}
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: tamano, height: tamano }}
    >
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={radio} fill="none" strokeWidth="9" className="stroke-muted" />
        <circle
          cx="50"
          cy="50"
          r={radio}
          fill="none"
          strokeWidth="9"
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={perimetro}
          strokeDashoffset={perimetro * (1 - (lleno ? avance : 0))}
          className={cn(
            'transition-[stroke-dashoffset] duration-1000 ease-out motion-reduce:transition-none',
            semaforo ? COLOR_ANILLO[semaforo] : 'text-muted-foreground',
          )}
        />
      </svg>
      <span
        className="absolute font-heading font-semibold tabular-nums"
        style={{ fontSize: tamano * (texto.length > 3 ? 0.19 : 0.24) }}
      >
        {texto}
      </span>
    </div>
  );
}

/** La leyenda del semáforo, con los mismos números que usa el backend. */
export function LeyendaSemaforo({ cortes }: { cortes?: CortesSemaforo }) {
  const verde = cortes?.verdeDesde ?? 100;
  const naranja = cortes?.naranjaDesde ?? 85;
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <i className="size-2 rounded-full bg-emerald-500" aria-hidden /> En meta ≥ {verde}%
      </span>
      <span className="inline-flex items-center gap-1.5">
        <i className="size-2 rounded-full bg-amber-500" aria-hidden /> En riesgo {naranja}–
        {verde - 0.1}%
      </span>
      <span className="inline-flex items-center gap-1.5">
        <i className="size-2 rounded-full bg-red-500" aria-hidden /> Brecha &lt; {naranja}%
      </span>
    </p>
  );
}

/**
 * El aviso de que el mes está congelado, y por qué (A9).
 *
 * Los objetivos se editan hasta el último día del mes anterior. Cuando el mes
 * empieza se bloquean solos; People puede reabrirlos en un caso excepcional
 * autorizado por el CEO, y entonces el aviso cambia de tono para que quede
 * claro que se está trabajando bajo una excepción.
 */
export function AvisoCongelado({
  motivo,
  edicionHabilitada,
  children,
}: {
  motivo: string;
  edicionHabilitada: boolean;
  children?: ReactNode;
}) {
  if (!motivo && !edicionHabilitada) return null;
  return (
    <div
      role="status"
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm',
        edicionHabilitada
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200'
          : 'border-border bg-muted/40 text-muted-foreground',
      )}
    >
      {edicionHabilitada ? (
        <UnlockIcon className="size-4 shrink-0" />
      ) : (
        <LockIcon className="size-4 shrink-0" />
      )}
      <span className="min-w-0 flex-1 text-pretty">
        {edicionHabilitada
          ? 'Este mes está abierto por una excepción autorizada: los cambios quedan registrados.'
          : motivo}
      </span>
      {children}
    </div>
  );
}
