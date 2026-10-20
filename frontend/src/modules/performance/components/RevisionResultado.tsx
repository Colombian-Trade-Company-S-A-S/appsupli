import { useState } from 'react';
import { CheckIcon, ExternalLinkIcon, MessageSquareIcon, Undo2Icon } from 'lucide-react';
import {
  Badge,
  Button,
  Field,
  FieldDescription,
  FieldLabel,
  Spinner,
  Textarea,
} from '@/shared/components/ui';
import type { Objetivo } from '../api';
import { useDarFeedback, useValidarResultado } from '../hooks';
import { SemaforoBadge } from './Piezas';

const MAXIMO_FEEDBACK = 2000;

const fechaHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '';

/** Lo ejecutado, dicho como lo entiende el jefe y no como lo guarda la base. */
function resultadoLegible(objetivo: Objetivo): string {
  const valor = objetivo.resultado?.resultadoEjecutado;
  if (valor === null || valor === undefined) return '—';
  const numero = Number(valor);
  switch (objetivo.tipoMedicion) {
    case 'binario':
      return numero === 1 ? 'Sí se cumplió' : 'No se cumplió';
    case 'cualitativa':
      return `${numero} de ${objetivo.metaValor ? Number(objetivo.metaValor) : 2} criterios`;
    default:
      return `${numero}${objetivo.unidadLabel ? ` ${objetivo.unidadLabel.toLowerCase()}` : ''}`;
  }
}

/** Los enlaces los escribe una persona: solo se abren si son http(s). */
const esEnlaceSeguro = (enlace: string) => /^https?:\/\//i.test(enlace);

/**
 * La revisión que hace el jefe de lo que cargó el colaborador.
 *
 * Muestra el resultado, el % que calculó el sistema, la observación de quien lo
 * cargó y las evidencias (enlaces a SharePoint u OneDrive). Desde acá deja su
 * feedback y aprueba o devuelve; devolver exige explicar por qué, porque ese
 * texto es lo que el colaborador va a leer para corregir.
 */
export function RevisionResultado({
  objetivo,
  puedeValidar,
  onListo,
}: {
  objetivo: Objetivo;
  puedeValidar: boolean;
  onListo: () => void;
}) {
  const resultado = objetivo.resultado;
  const [texto, setTexto] = useState(resultado?.feedback ?? '');
  const feedback = useDarFeedback();
  const validar = useValidarResultado();
  const ocupado = feedback.isPending || validar.isPending;
  const comentario = texto.trim();
  const cambios = comentario !== (resultado?.feedback ?? '');

  if (!resultado) return null;

  const resolver = (estado: 'validado' | 'rechazado') =>
    validar.mutate(
      { objetivo: objetivo.id, estado, observacion: comentario },
      { onSuccess: onListo },
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
        <p className="font-medium text-pretty">{objetivo.objetivo}</p>
        <p className="text-xs text-muted-foreground text-pretty">
          KPI: {objetivo.kpi} · Peso {Number(objetivo.peso)}%
        </p>
      </div>

      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Resultado cargado</dt>
          <dd className="font-medium">{resultadoLegible(objetivo)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Cumplimiento</dt>
          <dd>
            <SemaforoBadge semaforo={resultado.semaforo} cumplimiento={resultado.porcentajeCumplimiento} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Cargado por</dt>
          <dd>
            {resultado.cargadoPorNombre || '—'}
            {resultado.fechaCarga && (
              <span className="text-muted-foreground"> · {fechaHora(resultado.fechaCarga)}</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Estado</dt>
          <dd>
            <Badge variant="secondary">{resultado.estadoValidacionLabel}</Badge>
            {resultado.validadoPorNombre && (
              <span className="text-xs text-muted-foreground">
                {' '}
                por {resultado.validadoPorNombre}
              </span>
            )}
          </dd>
        </div>
      </dl>

      {resultado.observacion && (
        <div className="text-sm">
          <p className="text-xs text-muted-foreground">Observación de quien lo cargó</p>
          <p className="text-pretty whitespace-pre-line">{resultado.observacion}</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Evidencias</p>
        {resultado.evidencias.length === 0 ? (
          <p className="text-sm text-muted-foreground">No adjuntó ninguna evidencia.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {resultado.evidencias.map((evidencia, indice) => (
              <li key={evidencia.id ?? indice} className="text-sm">
                {esEnlaceSeguro(evidencia.linkSoporte) ? (
                  <a
                    href={evidencia.linkSoporte}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex max-w-full items-center gap-1.5 text-primary underline-offset-4 hover:underline"
                  >
                    <ExternalLinkIcon className="size-3.5 shrink-0" />
                    <span className="truncate">{evidencia.nombre || evidencia.linkSoporte}</span>
                  </a>
                ) : (
                  <span className="break-all text-muted-foreground">{evidencia.linkSoporte}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Field className="min-w-0">
        <FieldLabel htmlFor="rev-feedback">Feedback para el colaborador</FieldLabel>
        <Textarea
          id="rev-feedback"
          rows={3}
          maxLength={MAXIMO_FEEDBACK}
          placeholder="Qué salió bien, qué falta o qué hay que corregir."
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <FieldDescription>
          {resultado.feedbackPorNombre && resultado.feedback
            ? `Último comentario: ${resultado.feedbackPorNombre} · ${fechaHora(resultado.feedbackFecha)}. `
            : ''}
          Al devolver el resultado el comentario es obligatorio.
        </FieldDescription>
      </Field>

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onListo}>
          Cerrar
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={ocupado || !cambios}
          onClick={() =>
            feedback.mutate({ objetivo: objetivo.id, feedback: comentario }, { onSuccess: onListo })
          }
        >
          {feedback.isPending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <MessageSquareIcon data-icon="inline-start" />
          )}
          Guardar feedback
        </Button>
        {puedeValidar && (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={ocupado || !comentario}
              title={comentario ? undefined : 'Escribe por qué se devuelve'}
              onClick={() => resolver('rechazado')}
            >
              <Undo2Icon data-icon="inline-start" />
              Devolver
            </Button>
            <Button
              type="button"
              disabled={ocupado || resultado.estadoValidacion === 'validado'}
              onClick={() => resolver('validado')}
            >
              <CheckIcon data-icon="inline-start" />
              Validar
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
