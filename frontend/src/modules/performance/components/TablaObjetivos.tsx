import { CheckIcon, PencilIcon, Trash2Icon, UploadIcon } from 'lucide-react';
import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui';
import type { Objetivo } from '../api';
import { SemaforoBadge } from './Piezas';

/** Cómo se lee la meta según el tipo de medición, como en el mockup. */
function metaLegible(objetivo: Objetivo): string {
  const valor = objetivo.metaValor ? Number(objetivo.metaValor) : null;
  const unidad =
    objetivo.unidadLabel && objetivo.unidad !== 'si_no'
      ? ` ${objetivo.unidadLabel.toLowerCase()}`
      : '';
  switch (objetivo.tipoMedicion) {
    case 'binario':
      return 'Cumple';
    case 'cualitativa':
      // Siempre son dos criterios: 2 de 2 es 100%, 1 de 2 es 50%.
      return `${valor ?? 2} de ${valor ?? 2} criterios`;
    case 'proporcional_inverso':
      return valor === null ? '—' : `≤ ${valor}${unidad}`;
    case 'formula':
      return objetivo.formula || '—';
    default:
      return valor === null ? '—' : `${valor}${unidad}`;
  }
}

const TIPO_CORTO: Record<Objetivo['tipoMedicion'], string> = {
  binario: 'Cumple o no',
  proporcional: 'Meta a alcanzar',
  proporcional_inverso: 'Meta a reducir',
  cualitativa: 'Cualitativa',
  formula: 'Cálculo personalizado',
};

/**
 * La tabla de objetivos del mes.
 *
 * Muestra el cumplimiento cuando ya hay resultado cargado; mientras no lo
 * haya, la columna dice «sin cargar» y no se pinta de rojo: no es una brecha,
 * es un dato que todavía no está.
 */
export function TablaObjetivos({
  objetivos,
  soloLectura = false,
  onEditar,
  onEliminar,
  onCargar,
  onValidar,
  puedeCargar,
  puedeValidar,
}: {
  objetivos: Objetivo[];
  soloLectura?: boolean;
  onEditar?: (objetivo: Objetivo) => void;
  onEliminar?: (objetivo: Objetivo) => void;
  onCargar?: (objetivo: Objetivo) => void;
  onValidar?: (objetivo: Objetivo) => void;
  /** Quién puede cargar el resultado de esta fila (el responsable o su jefe). */
  puedeCargar?: (objetivo: Objetivo) => boolean;
  puedeValidar?: (objetivo: Objetivo) => boolean;
}) {
  const conAcciones = !soloLectura || !!onCargar;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Objetivo</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead>Meta</TableHead>
          <TableHead className="text-right">Peso</TableHead>
          <TableHead>Cumplimiento</TableHead>
          {conAcciones && <TableHead className="w-32" />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {objetivos.map((objetivo) => (
          <TableRow key={objetivo.id}>
            <TableCell className="max-w-md">
              <p className="font-medium text-pretty">{objetivo.objetivo}</p>
              <p className="text-xs text-muted-foreground text-pretty">KPI: {objetivo.kpi}</p>
              {objetivo.fuenteDatos && (
                <p className="text-xs text-muted-foreground">Fuente: {objetivo.fuenteDatos}</p>
              )}
            </TableCell>
            <TableCell>
              <Badge variant="secondary">{TIPO_CORTO[objetivo.tipoMedicion]}</Badge>
              {objetivo.permiteSobrecumplimiento && (
                <p className="mt-1 text-xs text-muted-foreground">Permite &gt;100%</p>
              )}
            </TableCell>
            <TableCell className="tabular-nums">{metaLegible(objetivo)}</TableCell>
            <TableCell className="text-right font-medium tabular-nums">
              {Number(objetivo.peso)}%
            </TableCell>
            <TableCell>
              <SemaforoBadge semaforo={objetivo.semaforo} cumplimiento={objetivo.cumplimiento} />
              {objetivo.resultado && objetivo.resultado.estadoValidacion !== 'validado' && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {objetivo.resultado.estadoValidacionLabel}
                </p>
              )}
            </TableCell>
            {conAcciones && (
              <TableCell className="text-right whitespace-nowrap">
                {onCargar && puedeCargar?.(objetivo) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Cargar resultado de ${objetivo.objetivo}`}
                    title="Cargar resultado y evidencia"
                    onClick={() => onCargar(objetivo)}
                  >
                    <UploadIcon />
                  </Button>
                )}
                {onValidar && objetivo.resultado && puedeValidar?.(objetivo) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Validar resultado de ${objetivo.objetivo}`}
                    title="Validar el resultado cargado"
                    onClick={() => onValidar(objetivo)}
                  >
                    <CheckIcon />
                  </Button>
                )}
                {!soloLectura && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Editar ${objetivo.objetivo}`}
                      disabled={!objetivo.editable}
                      onClick={() => onEditar?.(objetivo)}
                    >
                      <PencilIcon />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Eliminar ${objetivo.objetivo}`}
                      disabled={!objetivo.editable}
                      onClick={() => onEliminar?.(objetivo)}
                    >
                      <Trash2Icon />
                    </Button>
                  </>
                )}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
