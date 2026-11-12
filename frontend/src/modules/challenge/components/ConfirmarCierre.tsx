import { AlertTriangleIcon, CheckCircle2Icon } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
  Spinner,
} from '@/shared/components/ui';
import type { PersonaPendiente } from '../api';
import { usePendientesReto } from '../hooks';

export type AccionCierre = 'cerrar' | 'cerrar-y-publicar' | 'publicar';

const TEXTOS: Record<AccionCierre, { titulo: string; boton: string; enCurso: string }> = {
  cerrar: { titulo: 'Cerrar el reto', boton: 'Aceptar y cerrar', enCurso: 'Cerrando…' },
  'cerrar-y-publicar': {
    titulo: 'Cerrar el reto y publicar el resultado',
    boton: 'Aceptar, cerrar y publicar',
    enCurso: 'Publicando…',
  },
  publicar: {
    titulo: 'Publicar el resultado',
    boton: 'Aceptar y publicar',
    enCurso: 'Publicando…',
  },
};

/**
 * El aviso antes de cerrar o publicar un reto: quién no ha subido evidencia y
 * qué entregas siguen sin calificar.
 *
 * No bloquea nada —se puede cerrar y publicar con pendientes—, pero People
 * decide con la lista a la vista. Las entregas sin calificar se publican sin
 * puntaje y no compiten por el primer puesto.
 */
export function ConfirmarCierre({
  retoId,
  accion,
  onCancelar,
  onAceptar,
  enCurso,
}: {
  retoId: number;
  /** `null` = cerrado. */
  accion: AccionCierre | null;
  onCancelar: () => void;
  onAceptar: () => void;
  enCurso: boolean;
}) {
  const abierto = accion !== null;
  const { data, isLoading } = usePendientesReto(retoId, abierto);
  const textos = TEXTOS[accion ?? 'cerrar'];
  const publica = accion !== 'cerrar';
  const sinEvidencia = data?.sinEvidencia ?? [];
  const sinCalificar = publica ? (data?.sinCalificar ?? []) : [];
  const nadieFalta = !!data && sinEvidencia.length === 0 && sinCalificar.length === 0;

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && !enCurso && onCancelar()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{textos.titulo}</DialogTitle>
          <DialogDescription>
            {accion === 'publicar'
              ? 'Al publicar, el ganador y los puntajes quedan en firme y los ve todo el público.'
              : accion === 'cerrar-y-publicar'
                ? 'Ya no se reciben más evidencias, y el ganador y los puntajes quedan en firme.'
                : 'Ya no se reciben más evidencias. Las que llegaron se pueden seguir calificando.'}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : nadieFalta ? (
          <Alert>
            <CheckCircle2Icon />
            <AlertTitle>No hay pendientes</AlertTitle>
            <AlertDescription>
              Todo el público del reto subió su evidencia
              {publica ? ' y todas las entregas están calificadas' : ''}.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="flex flex-col gap-4">
            <Alert variant="destructive">
              <AlertTriangleIcon />
              <AlertTitle>Hay pendientes</AlertTitle>
              <AlertDescription>
                Se puede {publica ? 'publicar' : 'cerrar'} igual.
                {sinEvidencia.length > 0 && ' Quienes no subieron evidencia quedan sin participar.'}
                {sinCalificar.length > 0 &&
                  ' Las entregas sin calificar se publican sin puntaje y no compiten por el primer puesto.'}
              </AlertDescription>
            </Alert>

            {sinEvidencia.length > 0 && (
              <ListaPendientes
                titulo="Sin evidencia cargada"
                personas={sinEvidencia}
                pie={data ? `${data.entregas} de ${data.publico} personas participaron` : undefined}
              />
            )}
            {sinCalificar.length > 0 && (
              <ListaPendientes titulo="Entregas sin calificar" personas={sinCalificar} />
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCancelar} disabled={enCurso}>
            Cancelar
          </Button>
          <Button onClick={onAceptar} disabled={enCurso || isLoading}>
            {enCurso && <Spinner data-icon="inline-start" />}
            {enCurso ? textos.enCurso : textos.boton}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ListaPendientes({
  titulo,
  personas,
  pie,
}: {
  titulo: string;
  personas: PersonaPendiente[];
  pie?: string;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        {titulo}
        <Badge variant="secondary">{personas.length}</Badge>
      </h3>
      <ul className="max-h-56 divide-y overflow-y-auto rounded-lg border">
        {personas.map((persona) => (
          <li key={persona.id} className="flex flex-col px-3 py-2">
            <span className="text-sm font-medium">{persona.nombre}</span>
            <span className="text-xs text-muted-foreground">
              {[persona.cargo, persona.area].filter(Boolean).join(' · ') || '—'}
            </span>
          </li>
        ))}
      </ul>
      {pie && <p className="text-xs text-muted-foreground">{pie}</p>}
    </section>
  );
}
