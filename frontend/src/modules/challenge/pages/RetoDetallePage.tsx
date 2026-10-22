import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeftIcon,
  CalendarIcon,
  ClipboardListIcon,
  HistoryIcon,
  UploadIcon,
} from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldLabel,
  Textarea,
} from '@/shared/components/ui';
import { Encabezado } from '@/shared/components/layout';
import { EsqueletoPagina } from '@/shared/components/feedback';
import { useAuth } from '@/core/auth';
import { fechaCorta, type Participacion } from '../api';
import {
  useCerrarReto,
  useFinalizarReto,
  useOpcionesChallenge,
  useParticipaciones,
  usePedirRevision,
  usePublicarReto,
  useReabrirReto,
  useReto,
  useResultado,
} from '../hooks';
import { CategoriaBadge, EstadoReto as EstadoRetoBadge } from '../components/Piezas';
import { FormularioParticipacion } from '../components/FormularioParticipacion';
import { FormularioReto } from '../components/FormularioReto';
import {
  MiEntrega,
  ResultadoPorPublicar,
  ResultadoPublicado,
} from '../components/ResultadoDelReto';
import { BASE } from './ChallengeLayout';

/**
 * El reto por dentro: sus condiciones, las entregas y el ganador.
 *
 * Lo que cada quien ve depende de su papel: People administra el ciclo de
 * vida y califica (solo People), el colaborador entrega su evidencia y consulta
 * el detalle de su propia valoración.
 */
export default function RetoDetallePage() {
  const { id } = useParams();
  const retoId = Number(id);
  const { user } = useAuth();
  const { data: opciones } = useOpcionesChallenge();
  const { data: reto, isLoading } = useReto(retoId);
  const { data: participaciones = [] } = useParticipaciones(retoId);
  const { data: resultado } = useResultado(retoId);

  const [participando, setParticipando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [revisando, setRevisando] = useState<Participacion | null>(null);
  const [reabriendo, setReabriendo] = useState(false);
  const [motivo, setMotivo] = useState('');

  const publicar = usePublicarReto();
  const cerrar = useCerrarReto();
  const finalizar = useFinalizarReto();
  const reabrir = useReabrirReto();
  const revision = usePedirRevision();

  if (isLoading || !reto || !opciones)
    return <EsqueletoPagina forma="detalle" label="Abriendo el reto…" />;

  const { puedeGestionarRetos, esEvaluador } = opciones.capacidades;
  const mia = participaciones.find((fila) => fila.participante === user?.id);
  const abierto = reto.estado === 'publicado';
  // Calificar, las respuestas de todos y el avance son solo de People, y viven
  // en «Ver detalles del reto». Aquí todos ven lo mismo: el reto, su entrega y,
  // ya publicado, el ganador, el top 10 y su puesto.
  const puedeVerRespuestas = esEvaluador || puedeGestionarRetos;
  // Puntajes, ganador y detalle de la valoración se publican al finalizar.
  const finalizado = reto.estado === 'finalizado';

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" className="self-start" render={<Link to={BASE} />}>
        <ArrowLeftIcon />
        Volver a los retos
      </Button>

      <Encabezado titulo={reto.titulo} descripcion={reto.descripcion}>
        <CategoriaBadge label={reto.categoriaLabel} />
        <EstadoRetoBadge estado={reto.estado} label={reto.estadoLabel} />
      </Encabezado>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <CalendarIcon className="size-3.5" />
          Cierra el {fechaCorta(reto.cierraEl)}
        </span>
        <span>Público: {reto.alcanceLabel.toLowerCase()}</span>
        <span>Evidencia: {reto.visibilidadLabel.toLowerCase()}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {puedeVerRespuestas && reto.estado !== 'borrador' && (
          <Button variant="outline" render={<Link to={`${BASE}/retos/${reto.id}/detalles`} />}>
            <ClipboardListIcon data-icon="inline-start" />
            Ver detalles del reto
          </Button>
        )}
        {abierto && !mia && (
          <Button onClick={() => setParticipando(true)}>
            <UploadIcon data-icon="inline-start" />
            Cargar evidencia
          </Button>
        )}
        {abierto && mia && mia.valoraciones.length === 0 && (
          <Button variant="outline" onClick={() => setParticipando(true)}>
            Reemplazar mi evidencia
          </Button>
        )}
        {puedeGestionarRetos && reto.estado === 'borrador' && (
          <>
            <Button onClick={() => publicar.mutate(reto.id)} disabled={publicar.isPending}>
              Abrir reto
            </Button>
            <Button variant="outline" onClick={() => setEditando(true)}>
              Editar borrador
            </Button>
          </>
        )}
        {puedeGestionarRetos && abierto && (
          <>
            <Button variant="outline" onClick={() => cerrar.mutate(reto.id)}>
              Cerrar reto
            </Button>
            <Button variant="ghost" onClick={() => setEditando(true)}>
              Corregir texto o ampliar plazo
            </Button>
          </>
        )}
        {puedeGestionarRetos && reto.estado === 'cerrado' && (
          <>
            <Button onClick={() => finalizar.mutate(reto.id)} disabled={finalizar.isPending}>
              Finalizar y publicar resultado
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setMotivo('');
                setReabriendo(true);
              }}
            >
              Reabrir (excepción)
            </Button>
          </>
        )}
      </div>

      {finalizado && resultado?.publicado ? (
        <ResultadoPublicado
          resultado={resultado}
          retoId={reto.id}
          miId={user?.id}
          esPeople={puedeVerRespuestas}
        />
      ) : (
        reto.estado !== 'borrador' && (
          <ResultadoPorPublicar participo={!!mia} abierto={abierto} esPeople={puedeVerRespuestas} />
        )
      )}

      {mia && (
        <MiEntrega
          mia={mia}
          finalizado={finalizado}
          accion={
            mia.puedePedirRevision && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setRevisando(mia);
                  setMotivo('');
                }}
              >
                Pedir revisión
              </Button>
            )
          }
        />
      )}

      <Dialog open={participando} onOpenChange={setParticipando}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Cargar evidencia</DialogTitle>
            <DialogDescription>
              Entregar la evidencia es participar. Una vez valorada, ya no se puede reemplazar.
            </DialogDescription>
          </DialogHeader>
          <FormularioParticipacion
            reto={reto}
            opciones={opciones}
            mia={mia}
            onListo={() => setParticipando(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={editando} onOpenChange={setEditando}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Editar reto</DialogTitle>
            <DialogDescription>
              Con el reto abierto solo se corrige el texto y se amplía el plazo, y queda en el
              historial.
            </DialogDescription>
          </DialogHeader>
          <FormularioReto
            opciones={opciones}
            reto={reto}
            onListo={() => setEditando(false)}
            onCancelar={() => setEditando(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={reabriendo} onOpenChange={setReabriendo}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Reabrir {reto.titulo}</DialogTitle>
            <DialogDescription>
              Un reto cerrado no se reabre como acción habitual. Es una excepción que People valida
              con el Leadership Team, y queda en el historial del reto.
            </DialogDescription>
          </DialogHeader>
          <Field className="min-w-0">
            <FieldLabel htmlFor="reabrir-motivo">Motivo y con quién se validó</FieldLabel>
            <Textarea
              id="reabrir-motivo"
              rows={3}
              placeholder="Se amplía el plazo por la semana de cierre, validado con el Leadership Team."
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReabriendo(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!motivo.trim() || reabrir.isPending}
              onClick={() =>
                reabrir.mutate({ id: reto.id, motivo }, { onSuccess: () => setReabriendo(false) })
              }
            >
              Reabrir reto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!revisando} onOpenChange={(abierta) => !abierta && setRevisando(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Solicitar revisión</DialogTitle>
            <DialogDescription>
              Se habilita cuando algún criterio quedó en 7 o menos. People la revisa y te responde.
            </DialogDescription>
          </DialogHeader>
          <Field className="min-w-0">
            <FieldLabel htmlFor="revision-motivo">¿Qué quieres que se revise?</FieldLabel>
            <Textarea
              id="revision-motivo"
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRevisando(null)}>
              Cancelar
            </Button>
            <Button
              disabled={!motivo.trim() || revision.isPending}
              onClick={() =>
                revisando &&
                revision.mutate(
                  { participacion: revisando.id, motivo },
                  { onSuccess: () => setRevisando(null) },
                )
              }
            >
              Enviar solicitud
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {reto.estado !== 'borrador' && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <HistoryIcon className="size-3.5" />
          Las reglas de este reto quedaron fijas al abrirlo; los cambios de texto o plazo quedan
          registrados.
        </p>
      )}
    </div>
  );
}
