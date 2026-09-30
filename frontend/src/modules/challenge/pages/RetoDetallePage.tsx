import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeftIcon,
  CalendarIcon,
  ClipboardCheckIcon,
  HistoryIcon,
  TrophyIcon,
  UploadIcon,
} from 'lucide-react';
import {
  Avatar,
  AvatarFallback,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldLabel,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@/shared/components/ui';
import { Encabezado, EstadoTabla, Kpi } from '@/shared/components/layout';
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
import {
  CategoriaBadge,
  EstadoEntrega,
  EstadoReto as EstadoRetoBadge,
  iniciales,
} from '../components/Piezas';
import { FormularioParticipacion } from '../components/FormularioParticipacion';
import { FormularioValoracion } from '../components/FormularioValoracion';
import { FormularioReto } from '../components/FormularioReto';
import { BASE } from './ChallengeLayout';

/**
 * El reto por dentro: sus condiciones, las entregas y el ganador.
 *
 * Lo que cada quien ve depende de su papel: People administra el ciclo de
 * vida, el evaluador valora, el colaborador entrega su evidencia y consulta
 * el detalle de su propia valoración.
 */
export default function RetoDetallePage() {
  const { id } = useParams();
  const retoId = Number(id);
  const { user } = useAuth();
  const { data: opciones } = useOpcionesChallenge();
  const { data: reto, isLoading } = useReto(retoId);
  const { data: participaciones = [], isLoading: cargandoRespuestas } = useParticipaciones(retoId);
  const { data: resultado } = useResultado(retoId);

  const [participando, setParticipando] = useState(false);
  const [valorando, setValorando] = useState<Participacion | null>(null);
  const [editando, setEditando] = useState(false);
  const [revisando, setRevisando] = useState<Participacion | null>(null);
  const [reabriendo, setReabriendo] = useState(false);
  const [motivo, setMotivo] = useState('');

  const publicar = usePublicarReto();
  const cerrar = useCerrarReto();
  const finalizar = useFinalizarReto();
  const reabrir = useReabrirReto();
  const revision = usePedirRevision();

  if (isLoading || !reto || !opciones) return <EsqueletoPagina forma="detalle" label="Abriendo el reto…" />;

  const { puedeGestionarRetos, esEvaluador } = opciones.capacidades;
  const mia = participaciones.find((fila) => fila.participante === user?.id);
  const abierto = reto.estado === 'publicado';
  // El colaborador ve su propia entrega y el ganador; el listado completo de
  // respuestas es de quien valora, como en el prototipo.
  const puedeVerRespuestas = esEvaluador || puedeGestionarRetos;
  const pendientes = participaciones.filter((fila) => fila.estado === 'entregada').length;

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
        {reto.juradosNombres.length > 0 && <span>Jurado: {reto.juradosNombres.join(', ')}</span>}
      </div>

      <div className="flex flex-wrap gap-2">
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Respuestas recibidas" value={reto.participacionesCount} />
        <Kpi label="Valoradas" value={reto.valoradasCount} />
        <Kpi label="Pendientes" value={pendientes} />
        <Kpi
          label="Ganador"
          value={resultado?.ganador?.participanteNombre ?? '—'}
          hint={
            resultado?.huboDesempate
              ? 'Ganó el desempate y sumó +20'
              : 'Se define con el mayor puntaje'
          }
        />
      </div>

      {resultado?.ganador && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex flex-wrap items-center gap-4 pt-6">
            <Avatar className="size-14">
              <AvatarFallback className="bg-amber-500/20 text-lg font-semibold">
                {iniciales(resultado.ganador.participanteNombre)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <TrophyIcon className="size-3.5 text-amber-500" />
                Reconocimiento del reto
              </p>
              <p className="text-lg font-semibold">{resultado.ganador.participanteNombre}</p>
              <p className="text-sm text-muted-foreground">
                Ganador · mayor puntaje · {resultado.ganador.puntajeConBonus} / 100
                {resultado.huboDesempate && ' (incluye +20 del desempate)'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {puedeVerRespuestas && (
        <Card className="py-0">
          <CardHeader className="pt-6">
            <CardTitle>Respuestas</CardTitle>
            <CardDescription>
              La evidencia se muestra según la visibilidad del reto:{' '}
              {reto.visibilidadLabel.toLowerCase()}.
            </CardDescription>
          </CardHeader>
          <EstadoTabla
            cargando={cargandoRespuestas}
            vacio={participaciones.length === 0}
            icono={<ClipboardCheckIcon />}
            titulo="Todavía no hay respuestas"
            descripcion="Cuando alguien cargue su evidencia, aparece acá con su estado y su puntaje."
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Participante</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Evidencia</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Puntaje</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {participaciones.map((fila) => (
                  <TableRow key={fila.id}>
                    <TableCell className="font-medium">{fila.participanteNombre}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {fila.participanteCargo || '—'}
                    </TableCell>
                    <TableCell>
                      {!fila.evidenciaVisible ? (
                        <span className="text-xs text-muted-foreground">Restringida</span>
                      ) : fila.entregaLink ? (
                        <a
                          href={fila.entregaLink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm underline underline-offset-4"
                        >
                          Ver soporte
                        </a>
                      ) : (
                        <span className="line-clamp-2 max-w-xs text-sm">{fila.entregaTexto}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <EstadoEntrega estado={fila.estado} label={fila.estadoLabel} />
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {fila.puntajeConBonus ?? '—'}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {esEvaluador && fila.participante !== user?.id && (
                        <Button variant="ghost" size="sm" onClick={() => setValorando(fila)}>
                          Valorar
                        </Button>
                      )}
                      {fila.puedePedirRevision && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setRevisando(fila);
                            setMotivo('');
                          }}
                        >
                          Pedir revisión
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </EstadoTabla>
        </Card>
      )}

      {mia && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mi entrega</CardTitle>
            <CardDescription>
              {mia.valoraciones.length
                ? 'Criterio, nivel y comentario de cada evaluador, no solo el puntaje.'
                : 'Tu evidencia quedó registrada. Cuando la valoren, acá ves el detalle.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <EstadoEntrega estado={mia.estado} label={mia.estadoLabel} />
              {mia.puntajeConBonus && (
                <span className="tabular-nums">{mia.puntajeConBonus} / 100</span>
              )}
              {mia.puedePedirRevision && (
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  onClick={() => {
                    setRevisando(mia);
                    setMotivo('');
                  }}
                >
                  Pedir revisión
                </Button>
              )}
            </div>
            {mia.valoraciones.map((valoracion) => (
              <div key={valoracion.id} className="rounded-lg border px-3 py-2 text-sm">
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {valoracion.esJurado ? 'Jurado del reto' : 'Evaluador de Supli'}
                  <span className="ml-auto font-semibold text-foreground tabular-nums">
                    {valoracion.puntaje ?? '—'} / 100
                  </span>
                </p>
                {valoracion.noCumple ? (
                  <p className="mt-1 text-red-700 dark:text-red-300">
                    Marcada como «no cumple»: {mia.motivoDescalificacion}
                  </p>
                ) : (
                  <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                    {valoracion.puntajes.map((puntaje) => (
                      <li key={puntaje.criterio} className="flex justify-between gap-2 text-xs">
                        <span className="text-muted-foreground">{puntaje.criterioNombre}</span>
                        <b className="tabular-nums">{puntaje.nivel} / 10</b>
                      </li>
                    ))}
                  </ul>
                )}
                {valoracion.comentario && (
                  <p className="mt-2 text-pretty">{valoracion.comentario}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
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

      <Dialog open={!!valorando} onOpenChange={(abierta) => !abierta && setValorando(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Valorar respuesta · {valorando?.participanteNombre}</DialogTitle>
            <DialogDescription>
              Cada criterio de 1 a 10. El sistema promedia y lo lleva a 0–100.
            </DialogDescription>
          </DialogHeader>
          {valorando && (
            <FormularioValoracion
              reto={reto}
              participacion={valorando}
              opciones={opciones}
              onListo={() => setValorando(null)}
            />
          )}
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
