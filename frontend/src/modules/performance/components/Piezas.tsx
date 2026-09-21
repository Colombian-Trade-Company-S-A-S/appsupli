import { AlertTriangleIcon, CheckCircle2Icon } from 'lucide-react';
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
import type { EstadoPeriodo, Ponderacion } from '../api';

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
