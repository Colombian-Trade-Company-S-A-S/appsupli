import { useState, type FormEvent } from 'react';
import { AlertTriangleIcon } from 'lucide-react';
import { Button, Field, FieldDescription, FieldLabel, Textarea } from '@/shared/components/ui';
import { useAuth } from '@/core/auth';
import { useValorar } from '../hooks';
import { puntajeDeNiveles, type OpcionesChallenge, type Participacion, type Reto } from '../api';

/**
 * La valoración con la rúbrica del reto (B2).
 *
 * Se califica cada criterio de 1 a 10 y el promedio se lleva a 0–100; el
 * evaluador ve el cálculo mientras mueve los niveles, como en el prototipo.
 * «No cumple» descalifica la entrega con cero y no valora criterios (B9).
 */
export function FormularioValoracion({
  reto,
  participacion,
  opciones,
  onListo,
}: {
  reto: Reto;
  participacion: Participacion;
  opciones: OpcionesChallenge;
  onListo: () => void;
}) {
  const { user } = useAuth();
  // La mía, no la del primero que valoró: si un evaluador vuelve a abrir la
  // ventana tiene que ver sus propios niveles, no los de otro.
  const previa = participacion.valoraciones.find((valoracion) => valoracion.evaluador === user?.id);
  const [niveles, setNiveles] = useState<Record<number, number>>(() =>
    Object.fromEntries(
      reto.criterios.map((criterio) => [
        criterio.id,
        previa?.puntajes.find((p) => p.criterio === criterio.id)?.nivel ?? 5,
      ]),
    ),
  );
  const [comentario, setComentario] = useState('');
  const valorar = useValorar();

  const valores = reto.criterios.map((criterio) => niveles[criterio.id] ?? 5);
  const puntaje = puntajeDeNiveles(valores);

  const guardar = async (evento: FormEvent) => {
    evento.preventDefault();
    try {
      await valorar.mutateAsync({
        participacion: participacion.id,
        comentario,
        puntajes: reto.criterios.map((criterio) => ({
          criterio: criterio.id,
          nivel: niveles[criterio.id] ?? 5,
        })),
      });
      onListo();
    } catch {
      // El aviso lo da la mutación con su toast.
    }
  };

  const descalificar = async () => {
    try {
      await valorar.mutateAsync({
        participacion: participacion.id,
        noCumple: true,
        comentario,
      });
      onListo();
    } catch {
      // El aviso lo da la mutación con su toast.
    }
  };

  return (
    <form onSubmit={guardar} noValidate className="flex flex-col gap-4">
      <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
        <p className="font-medium">{participacion.participanteNombre}</p>
        <p className="text-xs text-muted-foreground">
          {participacion.participanteCargo || 'Sin cargo'} · evidencia: {participacion.formato}
        </p>
        {participacion.entregaTexto && (
          <p className="mt-2 text-pretty">{participacion.entregaTexto}</p>
        )}
        {participacion.entregaLink && (
          <a
            href={participacion.entregaLink}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-sm underline underline-offset-4"
          >
            Abrir el soporte
          </a>
        )}
      </div>

      <fieldset className="flex flex-col gap-4">
        <legend className="text-sm font-medium">Valoración por criterio (1–10 cada uno)</legend>
        {reto.criterios.map((criterio) => {
          const nivel = niveles[criterio.id] ?? 5;
          return (
            <Field key={criterio.id} className="min-w-0">
              <FieldLabel htmlFor={`criterio-${criterio.id}`}>
                {criterio.nombre}
                <span className="ml-auto font-semibold tabular-nums">{nivel} / 10</span>
              </FieldLabel>
              <input
                id={`criterio-${criterio.id}`}
                type="range"
                min={1}
                max={10}
                step={1}
                value={nivel}
                onChange={(e) => setNiveles({ ...niveles, [criterio.id]: Number(e.target.value) })}
                className="w-full accent-foreground"
              />
              <FieldDescription>
                {opciones.niveles.find((opcion) => opcion.value === nivel)?.label}
              </FieldDescription>
            </Field>
          );
        })}
      </fieldset>

      <p className="rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Promedio: ({valores.join(' + ')}) ÷ {valores.length} × 10 ={' '}
        <b className="text-foreground tabular-nums">{puntaje} / 100</b>. Cada participación la
        valoran dos miembros de Supli y un jurado sorteado; el puntaje final es el promedio de los
        tres.
      </p>

      <Field className="min-w-0">
        <FieldLabel htmlFor="valoracion-comentario">
          Comentario para el colaborador (opcional)
        </FieldLabel>
        <Textarea
          id="valoracion-comentario"
          rows={2}
          placeholder="Excelente conexión con el principio; suma un dato de impacto."
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
        />
      </Field>

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          className="mr-auto text-red-700 dark:text-red-300"
          disabled={valorar.isPending}
          onClick={descalificar}
        >
          <AlertTriangleIcon />
          Marcar «No cumple» (descalifica · 0 pts)
        </Button>
        <Button type="button" variant="ghost" onClick={onListo}>
          Cancelar
        </Button>
        <Button type="submit" disabled={valorar.isPending}>
          Guardar valoración
        </Button>
      </div>
    </form>
  );
}
