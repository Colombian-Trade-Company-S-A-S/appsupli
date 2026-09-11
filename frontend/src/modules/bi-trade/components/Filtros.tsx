import type { ReactNode } from 'react';
import { SearchIcon, XIcon } from 'lucide-react';
import { Button, Card, CardContent, Field, FieldLabel, Input } from '@/shared/components/ui';

/**
 * Barra de filtros de un listado.
 *
 * Todos los campos van en una sola tarjeta arriba de la tabla, y el botón de
 * limpiar solo se habilita si hay algo puesto: así se ve de un golpe si lo que
 * muestran las tarjetas de totales está acotado o es todo el universo.
 */
export function BarraFiltros({
  children,
  hayFiltros,
  onLimpiar,
}: {
  children: ReactNode;
  hayFiltros: boolean;
  onLimpiar: () => void;
}) {
  return (
    <Card className="py-4">
      <CardContent className="flex flex-wrap items-end gap-3">
        {children}
        <Button variant="ghost" disabled={!hayFiltros} onClick={onLimpiar}>
          <XIcon data-icon="inline-start" />
          Limpiar filtros
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Deja fuera los filtros vacíos antes de mandarlos a la API.
 *
 * Un `?regional=` vacío no es «todas las regionales» para django-filter: hay
 * campos donde sí filtraría por cadena vacía. Además mantiene la query key de
 * react-query estable, así no se recarga al vaciar un campo que ya estaba
 * vacío.
 */
export const soloConValor = (filtros: object): Record<string, unknown> =>
  Object.fromEntries(Object.entries(filtros).filter(([, valor]) => valor !== '' && valor != null));

/** Buscador de texto libre. Va contra los campos de búsqueda del backend. */
export function CampoBusqueda({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (valor: string) => void;
  placeholder: string;
}) {
  return (
    <Field className="min-w-56 flex-1">
      <FieldLabel htmlFor="filtro-buscar">Buscar</FieldLabel>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="filtro-buscar"
          className="pl-9"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </Field>
  );
}

/** Un campo suelto con su etiqueta: fechas y números de los rangos. */
export function CampoFiltro({
  id,
  label,
  tipo = 'text',
  value,
  onChange,
  placeholder,
  min,
  className = 'w-36',
}: {
  id: string;
  label: string;
  tipo?: 'text' | 'date' | 'number' | 'month';
  value: string;
  onChange: (valor: string) => void;
  placeholder?: string;
  min?: number;
  className?: string;
}) {
  return (
    <Field className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type={tipo}
        value={value}
        min={min}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}
