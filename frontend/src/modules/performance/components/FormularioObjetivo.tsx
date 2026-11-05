import { useEffect, useState, type FormEvent } from 'react';
import { InfoIcon, SaveIcon, XIcon } from 'lucide-react';
import {
  Button,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Spinner,
  Textarea,
} from '@/shared/components/ui';
import type { Objetivo, ObjetivoPayload, Persona } from '../api';
import { useCrearObjetivo, useEditarObjetivo } from '../hooks';

/** Todo se escribe como texto; el backend valida y convierte. */
interface Campos {
  objetivo: string;
  kpi: string;
  peso: string;
  fuenteDatos: string;
}

const VACIO: Campos = { objetivo: '', kpi: '', peso: '', fuenteDatos: '' };

const desde = (objetivo: Objetivo): Campos => ({
  objetivo: objetivo.objetivo,
  kpi: objetivo.kpi,
  peso: objetivo.peso,
  fuenteDatos: objetivo.fuenteDatos,
});

/**
 * El formulario de definición de objetivos.
 *
 * Todos los objetivos se miden igual, con el % de cumplimiento de 0 a 100: no
 * hay tipo de medición, unidad ni meta que escoger. El % lo registra el
 * colaborador cuando empieza el mes —su jefe, con asesores y promotores— y lo
 * aprueba quien corresponda después de revisar la evidencia.
 */
export function FormularioObjetivo({
  colaborador,
  periodo,
  disponible,
  objetivo,
  onListo,
  onCancelar,
}: {
  colaborador: Persona;
  periodo: string;
  disponible: number;
  objetivo?: Objetivo;
  onListo: () => void;
  onCancelar?: () => void;
}) {
  const [datos, setDatos] = useState<Campos>(objetivo ? desde(objetivo) : VACIO);
  const crear = useCrearObjetivo();
  const editar = useEditarObjetivo();
  const guardando = crear.isPending || editar.isPending;

  // Al cambiar de objetivo (o al pasar de editar a crear) el formulario se
  // recarga con lo que corresponda.
  useEffect(() => {
    setDatos(objetivo ? desde(objetivo) : VACIO);
  }, [objetivo]);

  // El responsable del resultado no se escoge: es siempre el jefe directo del
  // colaborador (sale de la jerarquía, y el backend lo impone igual).
  const responsableNombre = colaborador.jefeId ? colaborador.jefe : colaborador.nombre;
  const aprobador = colaborador.aprobador || 'su jefe';
  // El CEO no tiene jefe: el backend lo devuelve como su propio aprobador.
  const suPropioJefe = !colaborador.jefeId && colaborador.aprobador === colaborador.nombre;

  const onSubmit = async (evento: FormEvent) => {
    evento.preventDefault();
    const payload: ObjetivoPayload = {
      colaborador: colaborador.id,
      periodo,
      objetivo: datos.objetivo,
      kpi: datos.kpi,
      peso: datos.peso,
      fuenteDatos: datos.fuenteDatos,
    };
    try {
      if (objetivo) await editar.mutateAsync({ id: objetivo.id, ...payload });
      else await crear.mutateAsync(payload);
      setDatos(VACIO);
      onListo();
    } catch {
      // El aviso lo da la mutación con su toast.
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Field className="min-w-0 md:col-span-2">
          <FieldLabel htmlFor="obj-objetivo">Objetivo</FieldLabel>
          <Textarea
            id="obj-objetivo"
            rows={2}
            placeholder="Entregar el portal de autogestión BI"
            value={datos.objetivo}
            onChange={(e) => setDatos({ ...datos, objetivo: e.target.value })}
            required
          />
          <FieldDescription>Qué se espera lograr en el mes, en una frase.</FieldDescription>
        </Field>

        <Field className="min-w-0 md:col-span-2">
          <FieldLabel htmlFor="obj-kpi">KPI / indicador</FieldLabel>
          <Input
            id="obj-kpi"
            placeholder="Portal en producción"
            value={datos.kpi}
            onChange={(e) => setDatos({ ...datos, kpi: e.target.value })}
            required
          />
          <FieldDescription>
            Con qué se mide ese objetivo: es lo que el jefe revisa en la evidencia.
          </FieldDescription>
        </Field>

        <Field className="min-w-0">
          <FieldLabel htmlFor="obj-peso">% de ponderación (peso)</FieldLabel>
          <Input
            id="obj-peso"
            type="number"
            step="0.01"
            min="0.01"
            max="100"
            placeholder="30"
            value={datos.peso}
            onChange={(e) => setDatos({ ...datos, peso: e.target.value })}
            required
          />
          <FieldDescription>Disponible en el mes: {disponible}%</FieldDescription>
        </Field>

        <Field className="min-w-0">
          <FieldLabel htmlFor="obj-fuente">Fuente / origen de los datos</FieldLabel>
          <Input
            id="obj-fuente"
            placeholder="Tablero de BI Trade, reporte de Claro…"
            value={datos.fuenteDatos}
            onChange={(e) => setDatos({ ...datos, fuenteDatos: e.target.value })}
          />
        </Field>

        <Field className="min-w-0">
          <FieldLabel htmlFor="obj-responsable">Responsable del resultado</FieldLabel>
          <Input id="obj-responsable" value={responsableNombre} readOnly disabled />
          <FieldDescription>
            {colaborador.jefeId
              ? 'Su jefe directo.'
              : suPropioJefe
                ? 'Es su propio jefe.'
                : 'Esta persona no tiene jefe registrado: queda ella misma.'}
          </FieldDescription>
        </Field>

        <div className="flex items-start gap-2 self-start rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground md:mt-6">
          <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
          <span className="text-pretty">
            Se mide en <b className="text-foreground">% de cumplimiento, de 0 a 100</b>.{' '}
            {suPropioJefe ? (
              <>
                Es su propio jefe: registra su % con la evidencia, queda aprobado al guardarlo y
                People lo audita después.
              </>
            ) : colaborador.asesorOPromotor ? (
              <>
                Por ser asesor o promotor, su jefe inmediato registra el % con la evidencia y lo
                aprueba <b className="text-foreground">{aprobador}</b>.
              </>
            ) : (
              <>
                Cuando empiece el mes, el colaborador registra su % con la evidencia y lo aprueba{' '}
                <b className="text-foreground">{aprobador}</b>.
              </>
            )}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button type="submit" disabled={guardando}>
          {guardando ? <Spinner data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />}
          {objetivo ? 'Guardar cambios' : 'Guardar objetivo'}
        </Button>
        {onCancelar && (
          <Button type="button" variant="outline" onClick={onCancelar}>
            <XIcon data-icon="inline-start" />
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
