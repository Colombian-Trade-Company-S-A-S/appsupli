import { useEffect, useState, type FormEvent } from 'react';
import { CircleXIcon, InfoIcon, LinkIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import {
  Button,
  Checkbox,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Textarea,
} from '@/shared/components/ui';
import { celebrar } from '@/shared/lib/celebrar';
import { useCargarResultado } from '../hooks';
import type { Objetivo } from '../api';
import { estadoRevision, fechaHora, ultimoRechazo } from '../flujo';
import { SemaforoBadge } from './Piezas';

interface Soporte {
  nombre: string;
  linkSoporte: string;
}

/** Cómo se pide el resultado según cómo se mide el objetivo. */
function comoSeCarga(objetivo: Objetivo) {
  switch (objetivo.tipoMedicion) {
    case 'binario':
      return { etiqueta: '¿Se cumplió?', ayuda: '', max: 1, paso: '1' };
    case 'cualitativa':
      return {
        etiqueta: 'Criterios cumplidos',
        ayuda: 'De 0 a 2. Dos de dos es 100%, uno es 50%.',
        max: 2,
        paso: '1',
      };
    case 'proporcional_inverso':
      return {
        etiqueta: 'Resultado ejecutado',
        ayuda: 'Menos es mejor: cero cuenta como cumplimiento pleno.',
        max: undefined,
        paso: '0.01',
      };
    default:
      return {
        etiqueta: 'Resultado ejecutado',
        ayuda: 'Lo logrado en el mes, en la unidad del objetivo.',
        max: undefined,
        paso: '0.01',
      };
  }
}

/**
 * La carga de lo ejecutado y sus soportes.
 *
 * El porcentaje no se digita nunca: lo calcula el backend con el tipo de
 * medición, y de ahí sale el color. Las evidencias son enlaces a SharePoint o
 * OneDrive, que es donde la compañía ya guarda sus soportes (A5).
 */
export function FormularioResultado({
  objetivo,
  onListo,
}: {
  objetivo: Objetivo;
  onListo: () => void;
}) {
  const [valor, setValor] = useState('');
  const [observacion, setObservacion] = useState('');
  const [soportes, setSoportes] = useState<Soporte[]>([{ nombre: '', linkSoporte: '' }]);
  const cargar = useCargarResultado();
  const como = comoSeCarga(objetivo);
  // El binario no se digita: es una casilla. Sin marcar es 0, no «vacío».
  const esBinario = objetivo.tipoMedicion === 'binario';
  const cumplido = Number(valor) === 1;

  // Si el jefe lo devolvió, el motivo va arriba —es lo que hay que corregir—
  // y el formulario arranca limpio: lo devuelto queda en el historial, no
  // precargado, para que no se confunda con lo que se va a enviar ahora.
  const devolucion =
    objetivo.resultado && estadoRevision(objetivo.resultado) === 'devuelto'
      ? ultimoRechazo(objetivo.resultado)
      : undefined;
  const corrigiendo = !!devolucion;

  useEffect(() => {
    const resultado = corrigiendo ? null : objetivo.resultado;
    setValor(resultado?.resultadoEjecutado ?? '');
    setObservacion(resultado?.observacion ?? '');
    setSoportes(
      resultado?.evidencias.length
        ? resultado.evidencias.map((evidencia) => ({
            nombre: evidencia.nombre,
            linkSoporte: evidencia.linkSoporte,
          }))
        : [{ nombre: '', linkSoporte: '' }],
    );
  }, [objetivo, corrigiendo]);

  const cambiar = (indice: number, parche: Partial<Soporte>) =>
    setSoportes(soportes.map((fila, i) => (i === indice ? { ...fila, ...parche } : fila)));

  const onSubmit = async (evento: FormEvent) => {
    evento.preventDefault();
    try {
      const resultado = await cargar.mutateAsync({
        objetivo: objetivo.id,
        resultadoEjecutado: esBinario ? (cumplido ? '1' : '0') : valor,
        observacion,
        evidencias: soportes
          .filter((fila) => fila.linkSoporte.trim())
          .map((fila) => ({ nombre: fila.nombre, linkSoporte: fila.linkSoporte.trim() })),
      });
      // Meta cumplida: se celebra. Solo al cargar, no al abrir un resultado viejo.
      if (Number(resultado?.porcentajeCumplimiento ?? 0) >= 100) void celebrar();
      onListo();
    } catch {
      // El aviso lo da la mutación con su toast.
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
        <p className="font-medium text-pretty">{objetivo.objetivo}</p>
        <p className="text-xs text-muted-foreground text-pretty">
          KPI: {objetivo.kpi} · Peso {Number(objetivo.peso)}%
        </p>
      </div>

      {devolucion ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200">
          <CircleXIcon className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium">
              {devolucion.autorNombre || 'Tu jefe'} te lo devolvió ·{' '}
              {fechaHora(devolucion.createdAt)}
            </p>
            <p className="text-pretty whitespace-pre-line">
              Motivo: {devolucion.comentario || '(sin motivo)'}
            </p>
            <p className="mt-1 text-xs">
              Carga de nuevo el resultado y la evidencia corregidos y guarda: le vuelve a llegar
              para revisar. Lo que habías enviado queda en el historial.
            </p>
          </div>
        </div>
      ) : (
        objetivo.resultado?.feedback && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
            <p className="text-xs font-medium text-muted-foreground">
              {`Comentario${objetivo.resultado.feedbackPorNombre ? ` de ${objetivo.resultado.feedbackPorNombre}` : ''}`}
            </p>
            <p className="text-pretty whitespace-pre-line">{objetivo.resultado.feedback}</p>
          </div>
        )
      )}

      {esBinario ? (
        <Field className="min-w-0">
          <div className="flex items-center gap-2">
            <Checkbox
              id="res-valor"
              checked={cumplido}
              onCheckedChange={(marcado) => setValor(marcado ? '1' : '0')}
            />
            <FieldLabel htmlFor="res-valor">Se cumplió</FieldLabel>
          </div>
          <FieldDescription>
            Marcado cuenta como cumplido (100%); sin marcar, como no cumplido (0%).
          </FieldDescription>
        </Field>
      ) : (
        <Field className="min-w-0">
          <FieldLabel htmlFor="res-valor">{como.etiqueta}</FieldLabel>
          <Input
            id="res-valor"
            type="number"
            min="0"
            max={como.max}
            step={como.paso}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            required
          />
          <FieldDescription>{como.ayuda}</FieldDescription>
        </Field>
      )}

      <div className="flex items-start gap-2 rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
        <span>
          El % de cumplimiento no se digita: lo calcula el sistema.{' '}
          {objetivo.resultado && !corrigiendo && (
            <>
              Hoy va en{' '}
              <SemaforoBadge semaforo={objetivo.semaforo} cumplimiento={objetivo.cumplimiento} />
            </>
          )}
        </span>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">Evidencias</legend>
        <p className="text-xs text-muted-foreground">
          Enlaces a SharePoint u OneDrive. Verifica que tu jefe y People puedan abrirlos.
        </p>
        {soportes.map((soporte, indice) => (
          <div key={indice} className="flex flex-wrap items-end gap-2">
            <Field className="min-w-0 flex-1">
              <FieldLabel htmlFor={`res-link-${indice}`}>Enlace</FieldLabel>
              <div className="relative">
                <LinkIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id={`res-link-${indice}`}
                  type="url"
                  className="pl-9"
                  placeholder="https://supli.sharepoint.com/..."
                  value={soporte.linkSoporte}
                  onChange={(e) => cambiar(indice, { linkSoporte: e.target.value })}
                />
              </div>
            </Field>
            <Field className="min-w-0 flex-1">
              <FieldLabel htmlFor={`res-nombre-${indice}`}>Nombre (opcional)</FieldLabel>
              <Input
                id={`res-nombre-${indice}`}
                placeholder="Acta de cierre"
                value={soporte.nombre}
                onChange={(e) => cambiar(indice, { nombre: e.target.value })}
              />
            </Field>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Quitar evidencia ${indice + 1}`}
              disabled={soportes.length === 1}
              onClick={() => setSoportes(soportes.filter((_, i) => i !== indice))}
            >
              <Trash2Icon />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setSoportes([...soportes, { nombre: '', linkSoporte: '' }])}
        >
          <PlusIcon />
          Agregar otro enlace
        </Button>
      </fieldset>

      <Field className="min-w-0">
        <FieldLabel htmlFor="res-observacion">Observación (opcional)</FieldLabel>
        <Textarea
          id="res-observacion"
          rows={2}
          value={observacion}
          onChange={(e) => setObservacion(e.target.value)}
        />
      </Field>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onListo}>
          Cancelar
        </Button>
        <Button type="submit" disabled={cargar.isPending}>
          Guardar resultado
        </Button>
      </div>
    </form>
  );
}
