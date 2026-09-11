import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Button } from '@/shared/components/ui';
import { formatoNumero } from '@/shared/lib/formato';

/**
 * Controles de página de una tabla.
 *
 * Dice «41–55 de 1.284» y no solo el número de página porque lo que importa
 * es cuántos registros hay en total: las tarjetas de arriba suman esos 1.284,
 * no los 15 de la tabla, y este texto es lo que hace evidente esa diferencia.
 */
export function Paginacion({
  pagina,
  onPaginaChange,
  total,
  porPagina,
  cargando = false,
}: {
  pagina: number;
  onPaginaChange: (pagina: number) => void;
  total: number;
  porPagina: number;
  cargando?: boolean;
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const desde = total === 0 ? 0 : (pagina - 1) * porPagina + 1;
  const hasta = Math.min(pagina * porPagina, total);

  if (total <= porPagina) {
    return (
      <p className="text-xs text-muted-foreground">
        {formatoNumero(total)} registro{total === 1 ? '' : 's'}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">
        {formatoNumero(desde)}–{formatoNumero(hasta)} de {formatoNumero(total)} registros
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={pagina <= 1 || cargando}
          onClick={() => onPaginaChange(pagina - 1)}
        >
          <ChevronLeftIcon data-icon="inline-start" />
          Anterior
        </Button>
        <span className="text-xs tabular-nums text-muted-foreground">
          Página {formatoNumero(pagina)} de {formatoNumero(paginas)}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={pagina >= paginas || cargando}
          onClick={() => onPaginaChange(pagina + 1)}
        >
          Siguiente
          <ChevronRightIcon data-icon="inline-end" />
        </Button>
      </div>
    </div>
  );
}
