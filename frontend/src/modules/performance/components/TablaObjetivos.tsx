import { PencilIcon, Trash2Icon } from 'lucide-react';
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
    case 'proporcional_inverso':
      return valor === null ? '—' : `≤ ${valor}${unidad}`;
    case 'formula':
      return objetivo.formula || '—';
    default:
      return valor === null ? '—' : `${valor}${unidad}`;
  }
}

const TIPO_CORTO: Record<Objetivo['tipoMedicion'], string> = {
  binario: 'Binario',
  proporcional: 'Proporcional',
  proporcional_inverso: 'Prop. inverso',
  formula: 'Fórmula',
};

/** La tabla de objetivos del mes. En «Mis objetivos» va sin acciones. */
export function TablaObjetivos({
  objetivos,
  soloLectura = false,
  onEditar,
  onEliminar,
}: {
  objetivos: Objetivo[];
  soloLectura?: boolean;
  onEditar?: (objetivo: Objetivo) => void;
  onEliminar?: (objetivo: Objetivo) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Objetivo</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead>Meta</TableHead>
          <TableHead className="text-right">Peso</TableHead>
          {!soloLectura && <TableHead className="w-24" />}
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
            {!soloLectura && (
              <TableCell className="text-right">
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
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
