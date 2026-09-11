import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Button, Field, FieldLabel, Input } from '@/shared/components/ui';
import { CampoSelect } from './CampoSelect';
import { aValorMes, desdeValorMes } from './SelectorMes';

/** `Date` → `AAAA-MM-DD` en hora local. `toISOString` daría el día en UTC. */
export const aValorFecha = (fecha: Date) => {
  const desfase = fecha.getTimezoneOffset() * 60000;
  return new Date(fecha.getTime() - desfase).toISOString().slice(0, 10);
};

/** Hoy, que es con el día que abre la hoja. */
export const hoyISO = () => aValorFecha(new Date());

/** Corre la fecha n días, cambiando de mes y de año cuando toca. */
const correrDias = (fecha: string, pasos: number) => {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  // El mediodía evita que un cambio de horario mueva el día al restar.
  const movida = new Date(anio, mes - 1, dia, 12);
  movida.setDate(movida.getDate() + pasos);
  return aValorFecha(movida);
};

/**
 * Selector de un solo día: el mes por un lado, el día por otro.
 *
 * Son dos controles y no un `<input type="date">` porque así el día nunca
 * puede caer fuera del mes elegido, y porque la lista de días marca cuáles no
 * son hábiles —domingos y festivos—, que es justo lo que hay que saber antes
 * de juzgar el cumplimiento de un día.
 *
 * Las flechas cruzan el límite del mes: del 1 hacia atrás se va al último día
 * del mes anterior, que es lo que uno espera al comparar días seguidos.
 */
export function SelectorDia({
  fecha,
  onChange,
  diasDelMes,
  diasNoHabiles = [],
}: {
  fecha: string;
  onChange: (fecha: string) => void;
  diasDelMes: number;
  diasNoHabiles?: number[];
}) {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const noHabiles = new Set(diasNoHabiles);

  const cambiarMes = (valor: string) => {
    const elegido = desdeValorMes(valor);
    if (!elegido) return;
    // Si el día no existe en el mes nuevo —un 31 al pasar a febrero— se ajusta
    // al último, en vez de dejar una fecha inválida.
    const ultimo = new Date(elegido.anio, elegido.mes, 0).getDate();
    const diaValido = Math.min(dia, ultimo);
    onChange(
      `${elegido.anio}-${String(elegido.mes).padStart(2, '0')}-${String(diaValido).padStart(2, '0')}`,
    );
  };

  return (
    <div className="flex w-full items-end gap-2 sm:w-auto">
      <Button
        variant="outline"
        size="icon"
        aria-label="Día anterior"
        onClick={() => onChange(correrDias(fecha, -1))}
      >
        <ChevronLeftIcon />
      </Button>

      <Field className="min-w-0 flex-1 sm:w-40 sm:flex-none">
        <FieldLabel htmlFor="dia-mes">Mes</FieldLabel>
        <Input
          id="dia-mes"
          type="month"
          value={aValorMes({ anio, mes })}
          onChange={(e) => cambiarMes(e.target.value)}
        />
      </Field>

      <CampoSelect
        id="dia-dia"
        label="Día"
        placeholder="Día"
        className="w-24 shrink-0 sm:w-32"
        incluirTodas={false}
        value={String(dia)}
        onChange={(valor) =>
          onChange(`${anio}-${String(mes).padStart(2, '0')}-${valor.padStart(2, '0')}`)
        }
        opciones={Array.from({ length: diasDelMes }, (_, i) => i + 1).map((numero) => ({
          value: String(numero),
          label: noHabiles.has(numero) ? `${numero} · no hábil` : String(numero),
        }))}
      />

      <Button
        variant="outline"
        size="icon"
        aria-label="Día siguiente"
        onClick={() => onChange(correrDias(fecha, 1))}
      >
        <ChevronRightIcon />
      </Button>
    </div>
  );
}
