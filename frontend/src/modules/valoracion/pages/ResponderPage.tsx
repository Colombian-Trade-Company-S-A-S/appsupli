import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  CheckCircle2Icon,
  LockIcon,
  SaveIcon,
  SendIcon,
} from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Spinner,
  Textarea,
} from '@/shared/components/ui';
import { FullPageLoader } from '@/shared/components/feedback';
import { cn } from '@/shared/lib/utils';
import { valoracionApi } from '../api';
import { useEvaluacion, useValoracionMutation } from '../hooks';
import { Encabezado, formatoFecha } from '../components/Piezas';
import { BarraAvance } from '../components/Semaforo';

type Respuesta = { value: number | null; text: string };

/**
 * El formulario de evaluación.
 *
 * Dos reglas que vienen del uso real:
 *  · Se puede guardar borrador y volver luego; el trabajo nunca se pierde.
 *  · Un envío incompleto tampoco se descarta: el backend guarda lo que haya y
 *    devuelve qué falta, que es lo que se marca en rojo aquí.
 */
export default function ResponderPage() {
  const { id } = useParams<{ id: string }>();
  const asignacionId = Number(id);
  const navegar = useNavigate();
  const { data: formulario, isLoading } = useEvaluacion(asignacionId);

  const [respuestas, setRespuestas] = useState<Record<number, Respuesta>>({});
  const [acuerdos, setAcuerdos] = useState('');
  const [faltantes, setFaltantes] = useState<number[]>([]);
  const [faltanAcuerdos, setFaltanAcuerdos] = useState(false);

  useEffect(() => {
    if (!formulario) return;
    setRespuestas(
      Object.fromEntries(formulario.questions.map((p) => [p.id, { value: p.value, text: p.text }])),
    );
    setAcuerdos(formulario.agreements);
  }, [formulario]);

  const guardar = useValoracionMutation(
    (accion: 'borrador' | 'enviar') =>
      valoracionApi.misEvaluaciones.guardar(asignacionId, {
        action: accion,
        agreements: acuerdos,
        answers: Object.entries(respuestas).map(([pregunta, respuesta]) => ({
          question: Number(pregunta),
          value: respuesta.value,
          text: respuesta.text,
        })),
      }),
    (data) => data.message,
  );

  const respondidas = useMemo(
    () => Object.values(respuestas).filter((r) => r.value !== null || r.text.trim() !== '').length,
    [respuestas],
  );

  if (isLoading || !formulario) return <FullPageLoader label="Abriendo la evaluación…" />;

  const { assignment: asignacion, cycle: ciclo, scale: escala, questions: preguntas } = formulario;
  const total = preguntas.length;
  const porcentaje = total ? Math.round((respondidas / total) * 100) : 0;

  const enviar = (accion: 'borrador' | 'enviar') =>
    guardar.mutate(accion, {
      onSuccess: (data) => {
        setFaltantes(data.missingQuestions);
        setFaltanAcuerdos(data.missingAgreements);
        if (data.completed) navegar('/inicio/valoracion/mis-evaluaciones');
      },
    });

  const responder = (preguntaId: number, cambio: Partial<Respuesta>) =>
    setRespuestas((actual) => ({
      ...actual,
      [preguntaId]: { ...actual[preguntaId], ...cambio },
    }));

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo={`Evaluar a ${asignacion.evaluateeName}`}
        descripcion={`${ciclo.name} · ${asignacion.evaluationTypeLabel} · Tu rol: ${asignacion.evaluatorRoleLabel}`}
      >
        <Button variant="outline" render={<Link to="/inicio/valoracion/mis-evaluaciones" />}>
          <ArrowLeftIcon data-icon="inline-start" />
          Volver
        </Button>
      </Encabezado>

      {!asignacion.canAnswer && (
        <Alert variant="destructive">
          <LockIcon />
          <AlertTitle>Esta evaluación no admite cambios</AlertTitle>
          <AlertDescription>{asignacion.blockedReason}</AlertDescription>
        </Alert>
      )}

      {(faltantes.length > 0 || faltanAcuerdos) && (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>Guardamos lo que llevas, pero falta algo por completar</AlertTitle>
          <AlertDescription>
            {faltantes.length > 0 && `${faltantes.length} pregunta(s) obligatorias sin responder. `}
            {faltanAcuerdos && 'Las observaciones y acuerdos son obligatorios en este ciclo. '}
            Está marcado en rojo más abajo.
          </AlertDescription>
        </Alert>
      )}

      {/* Barra de avance pegada arriba: es la referencia mientras se responde. */}
      <div className="sticky top-0 z-10 -mx-1 rounded-lg border border-border bg-background/95 p-4 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-56 flex-1 flex-col gap-2">
            <BarraAvance porcentaje={porcentaje} />
            <span className="text-xs tabular-nums text-muted-foreground">
              {respondidas} de {total} respondidas ({porcentaje}%) · cierra el{' '}
              {formatoFecha(ciclo.endDate)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              disabled={!asignacion.canAnswer || guardar.isPending}
              onClick={() => enviar('borrador')}
            >
              {guardar.isPending && <Spinner data-icon="inline-start" />}
              <SaveIcon data-icon="inline-start" />
              Guardar borrador
            </Button>
            <Button
              disabled={!asignacion.canAnswer || guardar.isPending}
              onClick={() => enviar('enviar')}
            >
              <SendIcon data-icon="inline-start" />
              Enviar evaluación
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {preguntas.map((pregunta) => {
          const respuesta = respuestas[pregunta.id] ?? { value: null, text: '' };
          const falta = faltantes.includes(pregunta.id);
          return (
            <Card
              key={pregunta.id}
              className={cn(falta && 'border-destructive ring-1 ring-destructive/30')}
            >
              <CardHeader>
                <CardTitle className="flex items-start gap-2 text-base font-medium">
                  <span className="mt-0.5 text-sm tabular-nums text-muted-foreground">
                    {pregunta.order}.
                  </span>
                  <span className="flex-1">{pregunta.statement}</span>
                  {!pregunta.isRequired && (
                    <Badge variant="outline" className="shrink-0">
                      Opcional
                    </Badge>
                  )}
                </CardTitle>
                {falta && (
                  <CardDescription className="text-destructive">
                    Esta pregunta es obligatoria.
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                {pregunta.questionType === 'likert' ? (
                  <div className="grid gap-2 sm:grid-cols-5">
                    {escala.map((opcion) => {
                      const activa = respuesta.value === opcion.value;
                      return (
                        <button
                          key={opcion.value}
                          type="button"
                          disabled={!asignacion.canAnswer}
                          aria-pressed={activa}
                          onClick={() =>
                            responder(pregunta.id, { value: activa ? null : opcion.value })
                          }
                          className={cn(
                            'flex flex-col items-center gap-1 rounded-lg border p-3 text-center text-xs transition-colors',
                            'disabled:cursor-not-allowed disabled:opacity-60',
                            activa
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border hover:bg-muted',
                          )}
                        >
                          <span className="text-lg font-semibold tabular-nums">{opcion.value}</span>
                          <span className="leading-tight">{opcion.label}</span>
                          {activa && <CheckCircle2Icon className="size-3.5" />}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <Textarea
                    rows={3}
                    disabled={!asignacion.canAnswer}
                    placeholder="Escribe tu respuesta…"
                    value={respuesta.text}
                    onChange={(e) => responder(pregunta.id, { text: e.target.value })}
                  />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className={cn(faltanAcuerdos && 'border-destructive ring-1 ring-destructive/30')}>
        <CardHeader>
          <CardTitle>Observaciones y acuerdos</CardTitle>
          <CardDescription>
            Campo libre para compromisos cualitativos. No califica
            {ciclo.commentsRequired ? ', pero en este ciclo es obligatorio.' : '.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={4}
            disabled={!asignacion.canAnswer}
            placeholder="Acuerdos, compromisos y comentarios de la conversación…"
            value={acuerdos}
            onChange={(e) => setAcuerdos(e.target.value)}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          disabled={!asignacion.canAnswer || guardar.isPending}
          onClick={() => enviar('borrador')}
        >
          <SaveIcon data-icon="inline-start" />
          Guardar borrador
        </Button>
        <Button
          disabled={!asignacion.canAnswer || guardar.isPending}
          onClick={() => enviar('enviar')}
        >
          {guardar.isPending && <Spinner data-icon="inline-start" />}
          <SendIcon data-icon="inline-start" />
          Enviar evaluación
        </Button>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Una vez enviada, la evaluación queda bloqueada y no se puede modificar.
      </p>
    </div>
  );
}
