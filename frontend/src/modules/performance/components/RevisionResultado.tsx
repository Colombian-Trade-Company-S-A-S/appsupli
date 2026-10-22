import { useState, type ReactNode } from 'react';
import {
  CheckIcon,
  CircleCheckIcon,
  CircleXIcon,
  ExternalLinkIcon,
  HistoryIcon,
  Undo2Icon,
} from 'lucide-react';
import {
  Button,
  Field,
  FieldDescription,
  FieldLabel,
  Spinner,
  Textarea,
} from '@/shared/components/ui';
import { cn } from '@/shared/lib/utils';
import type { Objetivo } from '../api';
import {
  esEnlaceSeguro,
  estadoRevision,
  fechaHora,
  porcentajeLegible,
  ultimoRechazo,
  valorLegible,
  versionDevuelta,
} from '../flujo';
import { useValidarResultado } from '../hooks';
import { HistorialResultado } from './HistorialResultado';
import { SemaforoBadge } from './Piezas';

const MAXIMO_COMENTARIO = 2000;

interface Soporte {
  nombre: string;
  linkSoporte: string;
}

function ListaEvidencias({ evidencias }: { evidencias: Soporte[] | null | undefined }) {
  if (evidencias === null || evidencias === undefined) {
    return <span className="text-muted-foreground">No registradas</span>;
  }
  if (evidencias.length === 0) return <span className="text-muted-foreground">Ninguna</span>;
  return (
    <ul className="flex flex-col gap-1">
      {evidencias.map((evidencia, indice) => (
        <li key={`${evidencia.linkSoporte}-${indice}`} className="min-w-0">
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
  );
}

const mismasEvidencias = (a: Soporte[] | null | undefined, b: Soporte[]) =>
  !!a &&
  a.length === b.length &&
  a.every((fila, i) => fila.linkSoporte === b[i].linkSoporte && fila.nombre === b[i].nombre);

/** Una fila de «antes → ahora»; se resalta cuando cambió. */
function FilaCambio({
  etiqueta,
  antes,
  ahora,
  cambio,
}: {
  etiqueta: string;
  antes: ReactNode;
  ahora: ReactNode;
  cambio: boolean;
}) {
  return (
    <tr className={cn('align-top', cambio && 'bg-amber-500/10')}>
      <th scope="row" className="py-2 pr-3 text-left text-xs font-medium text-muted-foreground">
        {etiqueta}
        {cambio && <span className="ml-1 text-amber-700 dark:text-amber-300">· cambió</span>}
      </th>
      <td className="py-2 pr-3 text-muted-foreground">{antes}</td>
      <td className="py-2 font-medium">{ahora}</td>
    </tr>
  );
}

/**
 * La revisión del jefe, en una sola ventana.
 *
 * Si es una corrección, arriba va el motivo con que se devolvió y el «antes →
 * ahora» de lo que cambió; si es una carga nueva, lo cargado. Abajo, dos
 * decisiones: aprobar (comentario opcional) o devolver (motivo obligatorio).
 * Ya resuelto, solo se muestra la decisión. El historial completo queda
 * plegado al final.
 */
export function RevisionResultado({
  objetivo,
  onListo,
}: {
  objetivo: Objetivo;
  onListo: () => void;
}) {
  const resultado = objetivo.resultado;
  // Dos textos separados: el comentario (opcional) acompaña la aprobación; el
  // motivo de la devolución se pide aparte, al pulsar «Devolver», y no se
  // envía hasta confirmarlo.
  const [comentario, setComentario] = useState('');
  const [devolviendo, setDevolviendo] = useState(false);
  const [motivo, setMotivo] = useState('');
  const validar = useValidarResultado();

  if (!resultado) return null;

  const estado = estadoRevision(resultado);
  const rechazo = ultimoRechazo(resultado);
  const antes = estado === 'corregido' ? versionDevuelta(resultado) : undefined;
  const motivoLimpio = motivo.trim();
  const evidenciasAhora: Soporte[] = resultado.evidencias.map(({ nombre, linkSoporte }) => ({
    nombre,
    linkSoporte,
  }));

  const decidir = (decision: 'validado' | 'rechazado', texto: string) =>
    validar.mutate(
      { objetivo: objetivo.id, estado: decision, observacion: texto },
      { onSuccess: onListo },
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
        <p className="font-medium text-pretty">{objetivo.objetivo}</p>
        <p className="text-xs text-muted-foreground text-pretty">
          KPI: {objetivo.kpi} · Peso {Number(objetivo.peso)}% · Cargado por{' '}
          {resultado.cargadoPorNombre || '—'} · {fechaHora(resultado.fechaCarga)}
        </p>
      </div>

      {estado === 'aprobado' && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
          <CircleCheckIcon className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium">
              Aprobado por {resultado.validadoPorNombre || '—'} ·{' '}
              {fechaHora(resultado.fechaValidacion)}
            </p>
            {resultado.feedback && <p className="text-pretty">{resultado.feedback}</p>}
          </div>
        </div>
      )}

      {(estado === 'devuelto' || estado === 'corregido') && rechazo && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200">
          <CircleXIcon className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium">
              {rechazo.autorNombre || 'Se'} lo devolvió · {fechaHora(rechazo.createdAt)}
            </p>
            <p className="text-pretty whitespace-pre-line">
              Motivo: {rechazo.comentario || '(sin motivo)'}
            </p>
            {estado === 'devuelto' && (
              <p className="mt-1 text-xs">Esperando que el colaborador lo corrija.</p>
            )}
          </div>
        </div>
      )}

      {estado === 'corregido' ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Lo que cambió con la corrección</p>
          <div className="overflow-x-auto rounded-lg border px-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-2 pr-3 text-left font-normal" />
                  <th className="py-2 pr-3 text-left font-normal">Antes (devuelto)</th>
                  <th className="py-2 text-left font-normal">Ahora</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <FilaCambio
                  etiqueta="Resultado"
                  antes={valorLegible(objetivo, antes?.resultadoEjecutado)}
                  ahora={valorLegible(objetivo, resultado.resultadoEjecutado)}
                  cambio={antes?.resultadoEjecutado !== resultado.resultadoEjecutado}
                />
                <FilaCambio
                  etiqueta="Cumplimiento"
                  antes={porcentajeLegible(antes?.porcentajeCumplimiento)}
                  ahora={
                    <SemaforoBadge
                      semaforo={resultado.semaforo}
                      cumplimiento={resultado.porcentajeCumplimiento}
                    />
                  }
                  cambio={antes?.porcentajeCumplimiento !== resultado.porcentajeCumplimiento}
                />
                <FilaCambio
                  etiqueta="Evidencias"
                  antes={<ListaEvidencias evidencias={antes?.evidencias} />}
                  ahora={<ListaEvidencias evidencias={evidenciasAhora} />}
                  cambio={!mismasEvidencias(antes?.evidencias, evidenciasAhora)}
                />
                <FilaCambio
                  etiqueta="Observación"
                  antes={antes?.comentario || '—'}
                  ahora={resultado.observacion || '—'}
                  cambio={(antes?.comentario ?? '') !== resultado.observacion}
                />
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Resultado cargado</dt>
            <dd className="font-medium">{valorLegible(objetivo, resultado.resultadoEjecutado)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Cumplimiento</dt>
            <dd>
              <SemaforoBadge
                semaforo={resultado.semaforo}
                cumplimiento={resultado.porcentajeCumplimiento}
              />
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Evidencias</dt>
            <dd>
              <ListaEvidencias evidencias={evidenciasAhora} />
            </dd>
          </div>
          {resultado.observacion && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">Observación de quien lo cargó</dt>
              <dd className="text-pretty whitespace-pre-line">{resultado.observacion}</dd>
            </div>
          )}
        </dl>
      )}

      {(estado === 'por_revisar' || estado === 'corregido') &&
        (devolviendo ? (
          <div className="flex flex-col gap-3 rounded-lg border border-red-500/40 bg-red-500/5 p-3">
            <Field className="min-w-0">
              <FieldLabel htmlFor="rev-motivo">Motivo de la devolución</FieldLabel>
              <Textarea
                id="rev-motivo"
                rows={3}
                autoFocus
                maxLength={MAXIMO_COMENTARIO}
                placeholder="Qué tiene que corregir: falta el acta firmada, el valor no coincide con el reporte…"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              />
              <FieldDescription>
                El colaborador lo ve en rojo junto a su objetivo, con un botón para corregir.
              </FieldDescription>
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={validar.isPending}
                onClick={() => {
                  setDevolviendo(false);
                  setMotivo('');
                }}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={validar.isPending || !motivoLimpio}
                title={motivoLimpio ? undefined : 'Escribe el motivo para poder enviarlo'}
                onClick={() => decidir('rechazado', motivoLimpio)}
              >
                {validar.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <Undo2Icon data-icon="inline-start" />
                )}
                Enviar devolución
              </Button>
            </div>
          </div>
        ) : (
          <>
            <Field className="min-w-0">
              <FieldLabel htmlFor="rev-comentario">Comentario al aprobar (opcional)</FieldLabel>
              <Textarea
                id="rev-comentario"
                rows={2}
                maxLength={MAXIMO_COMENTARIO}
                placeholder="Un reconocimiento o una nota para el colaborador."
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
              />
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={validar.isPending}
                onClick={() => setDevolviendo(true)}
              >
                <Undo2Icon data-icon="inline-start" />
                Devolver
              </Button>
              <Button
                type="button"
                disabled={validar.isPending}
                onClick={() => decidir('validado', comentario.trim())}
              >
                {validar.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <CheckIcon data-icon="inline-start" />
                )}
                Aprobar
              </Button>
            </div>
          </>
        ))}

      <details className="group rounded-lg border px-3 py-2">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium">
          <HistoryIcon className="size-4 text-muted-foreground" />
          Historial ({resultado.historial.length}{' '}
          {resultado.historial.length === 1 ? 'paso' : 'pasos'})
          <span className="ml-auto text-xs text-muted-foreground group-open:hidden">Ver</span>
        </summary>
        <div className="pt-3">
          <HistorialResultado objetivo={objetivo} />
        </div>
      </details>
    </div>
  );
}
