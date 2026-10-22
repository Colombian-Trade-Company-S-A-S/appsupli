import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  CircleCheckIcon,
  CircleXIcon,
  ClockIcon,
  EyeIcon,
  HistoryIcon,
  PencilIcon,
  RotateCcwIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui';
import type { Objetivo } from '../api';
import { cn } from '@/shared/lib/utils';
import {
  ETIQUETA_REVISION,
  estadoRevision,
  porRevisar,
  ultimoRechazo,
  type EstadoRevision,
} from '../flujo';
import { HistorialResultado } from './HistorialResultado';
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

/** El color de cada estado del flujo: lo que pide una acción se nota. */
const ESTILO_REVISION: Record<EstadoRevision, { icono: LucideIcon; clase: string }> = {
  por_revisar: { icono: ClockIcon, clase: 'border-border bg-muted text-muted-foreground' },
  corregido: {
    icono: RotateCcwIcon,
    clase: 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200',
  },
  devuelto: {
    icono: CircleXIcon,
    clase: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
  },
  aprobado: {
    icono: CircleCheckIcon,
    clase: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
};

function EstadoRevisionBadge({ estado }: { estado: EstadoRevision }) {
  const { icono: Icono, clase } = ESTILO_REVISION[estado];
  return (
    <span
      className={cn(
        'mt-1 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium',
        clase,
      )}
    >
      <Icono className="size-3.5 shrink-0" aria-hidden />
      {ETIQUETA_REVISION[estado]}
    </span>
  );
}

/**
 * Lo que dijo el jefe con su última decisión: el motivo si lo devolvió, el
 * comentario si lo aprobó. Mientras está por revisar no hay nada que mostrar.
 */
function ComentarioDeLaDecision({ objetivo }: { objetivo: Objetivo }) {
  const resultado = objetivo.resultado;
  if (!resultado) return null;
  const estado = estadoRevision(resultado);
  const rechazo = estado === 'devuelto' ? ultimoRechazo(resultado) : undefined;
  const texto = rechazo ? rechazo.comentario : estado === 'aprobado' ? resultado.feedback : '';
  if (!texto) return null;
  const autor = rechazo ? rechazo.autorNombre : resultado.validadoPorNombre;
  return (
    <p
      className={cn(
        'mt-1 line-clamp-2 max-w-56 text-xs text-pretty',
        rechazo ? 'text-red-700 dark:text-red-300' : 'text-muted-foreground',
      )}
      title={texto}
    >
      <span className="font-medium">
        {`${rechazo ? 'Motivo' : 'Comentario'}${autor ? ` de ${autor}` : ''}:`}
      </span>{' '}
      {texto}
    </p>
  );
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
  onRevisar,
  puedeCargar,
}: {
  objetivos: Objetivo[];
  soloLectura?: boolean;
  onEditar?: (objetivo: Objetivo) => void;
  onEliminar?: (objetivo: Objetivo) => void;
  onCargar?: (objetivo: Objetivo) => void;
  /** Abre la revisión del jefe: ver lo cargado (o qué cambió) y aprobar o devolver. */
  onRevisar?: (objetivo: Objetivo) => void;
  /** Quién puede cargar el resultado de esta fila (el colaborador, su jefe o el responsable). */
  puedeCargar?: (objetivo: Objetivo) => boolean;
}) {
  const [historialDe, setHistorialDe] = useState<Objetivo | null>(null);
  // El historial lo abre cualquiera que vea la fila: el colaborador, su jefe,
  // People y admin (el backend solo manda los objetivos que cada quien ve).
  // Quien revisa lo tiene dentro de la revisión, así que no se le repite.
  const conAcciones =
    !soloLectura || !!onCargar || !!onRevisar || objetivos.some((o) => !!o.resultado);

  return (
    <>
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
                {objetivo.resultado && (
                  <div>
                    <EstadoRevisionBadge estado={estadoRevision(objetivo.resultado)} />
                    <ComentarioDeLaDecision objetivo={objetivo} />
                  </div>
                )}
              </TableCell>
              {conAcciones && (
                <TableCell className="text-right whitespace-nowrap">
                  {onCargar &&
                    puedeCargar?.(objetivo) &&
                    (objetivo.resultado?.estadoValidacion === 'rechazado' ? (
                      // Devuelto: lo que toca es corregir, y se dice con palabras.
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-red-500/50 text-red-700 dark:text-red-300"
                        onClick={() => onCargar(objetivo)}
                      >
                        <RotateCcwIcon data-icon="inline-start" />
                        Corregir
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Cargar resultado de ${objetivo.objetivo}`}
                        title="Cargar resultado y evidencia"
                        onClick={() => onCargar(objetivo)}
                      >
                        <UploadIcon />
                      </Button>
                    ))}
                  {objetivo.resultado && !onRevisar && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Historial del resultado de ${objetivo.objetivo}`}
                      title="Historial: cargas, rechazos con su motivo y aprobaciones"
                      onClick={() => setHistorialDe(objetivo)}
                    >
                      <HistoryIcon />
                    </Button>
                  )}
                  {onRevisar &&
                    objetivo.resultado &&
                    (porRevisar(objetivo.resultado) ? (
                      // Le toca decidir al jefe: botón con texto, que se vea.
                      <Button size="sm" onClick={() => onRevisar(objetivo)}>
                        <EyeIcon data-icon="inline-start" />
                        Revisar
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Ver la revisión de ${objetivo.objetivo}`}
                        title="Ver la revisión y el historial"
                        onClick={() => onRevisar(objetivo)}
                      >
                        <EyeIcon />
                      </Button>
                    ))}
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

      <Dialog open={!!historialDe} onOpenChange={(abierto) => !abierto && setHistorialDe(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Historial del resultado</DialogTitle>
            <DialogDescription className="text-pretty">
              {historialDe?.objetivo} · quién cargó, quién validó o devolvió y por qué.
            </DialogDescription>
          </DialogHeader>
          {historialDe && <HistorialResultado objetivo={historialDe} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
