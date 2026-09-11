import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Button, Field, FieldLabel, Input } from '@/shared/components/ui';

/** El mes que se está mirando. */
export interface Mes {
  anio: number;
  mes: number;
}

/** El mes en curso, que es con el que abre el tablero. */
export const mesActual = (): Mes => {
  const hoy = new Date();
  return { anio: hoy.getFullYear(), mes: hoy.getMonth() + 1 };
};

/** `{anio: 2026, mes: 3}` → `'2026-03'`, el formato de un `<input type="month">`. */
export const aValorMes = ({ anio, mes }: Mes) => `${anio}-${String(mes).padStart(2, '0')}`;

/** `'2026-03'` → `{anio: 2026, mes: 3}`. Devuelve null si el valor no sirve. */
export const desdeValorMes = (valor: string): Mes | null => {
  const partes = /^(\d{4})-(\d{2})$/.exec(valor);
  if (!partes) return null;
  const anio = Number(partes[1]);
  const mes = Number(partes[2]);
  if (mes < 1 || mes > 12) return null;
  return { anio, mes };
};

/** Corre el mes n posiciones, cambiando de año cuando toca. */
const correr = ({ anio, mes }: Mes, pasos: number): Mes => {
  const indice = anio * 12 + (mes - 1) + pasos;
  return { anio: Math.floor(indice / 12), mes: (indice % 12) + 1 };
};

const NOMBRES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** `{anio: 2026, mes: 3}` → `'marzo de 2026'`. */
export const nombreDelMes = ({ anio, mes }: Mes) => `${NOMBRES[mes - 1]} de ${anio}`;

/**
 * Selector de un mes, no de un rango.
 *
 * La meta del negocio es mensual, así que un corte de «15 de marzo a 20 de
 * abril» no tendría contra qué medirse: por eso se elige un mes completo y
 * nada más. Las flechas están porque comparar con el mes anterior es lo
 * primero que se hace al abrir el tablero.
 */
export function SelectorMes({ valor, onChange }: { valor: Mes; onChange: (mes: Mes) => void }) {
  return (
    <div className="flex w-full items-end gap-2 sm:w-auto">
      <Button
        variant="outline"
        size="icon"
        aria-label="Mes anterior"
        onClick={() => onChange(correr(valor, -1))}
      >
        <ChevronLeftIcon />
      </Button>
      <Field className="min-w-0 flex-1 sm:w-44 sm:flex-none">
        <FieldLabel htmlFor="filtro-mes">Mes</FieldLabel>
        <Input
          id="filtro-mes"
          type="month"
          value={aValorMes(valor)}
          onChange={(e) => {
            const elegido = desdeValorMes(e.target.value);
            // Un mes vacío o a medio escribir no debe recargar el tablero.
            if (elegido) onChange(elegido);
          }}
        />
      </Field>
      <Button
        variant="outline"
        size="icon"
        aria-label="Mes siguiente"
        onClick={() => onChange(correr(valor, 1))}
      >
        <ChevronRightIcon />
      </Button>
    </div>
  );
}
