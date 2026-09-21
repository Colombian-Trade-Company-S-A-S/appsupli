import { useEffect, useState, type FormEvent } from 'react';
import { InfoIcon, SaveIcon, XIcon } from 'lucide-react';
import {
  Button,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Spinner,
  Switch,
  Textarea,
} from '@/shared/components/ui';
import type { Objetivo, ObjetivoPayload, OpcionesPerformance, Persona, TipoMedicion } from '../api';
import { useCrearObjetivo, useEditarObjetivo } from '../hooks';
import { Selector } from './Piezas';

/** Todo se escribe como texto; el backend valida y convierte. */
interface Campos {
  objetivo: string;
  kpi: string;
  tipoMedicion: TipoMedicion | '';
  unidad: string;
  metaValor: string;
  peso: string;
  umbralCumplimiento: string;
  permiteSobrecumplimiento: boolean;
  topeCumplimiento: string;
  formula: string;
  fuenteDatos: string;
  responsableResultado: string;
}

const VACIO: Campos = {
  objetivo: '',
  kpi: '',
  tipoMedicion: '',
  unidad: '',
  metaValor: '',
  peso: '',
  umbralCumplimiento: '',
  permiteSobrecumplimiento: false,
  topeCumplimiento: '100',
  formula: '',
  fuenteDatos: '',
  responsableResultado: '',
};

const desde = (objetivo: Objetivo): Campos => ({
  objetivo: objetivo.objetivo,
  kpi: objetivo.kpi,
  tipoMedicion: objetivo.tipoMedicion,
  unidad: objetivo.unidad,
  metaValor: objetivo.metaValor ?? '',
  peso: objetivo.peso,
  umbralCumplimiento: objetivo.umbralCumplimiento ?? '',
  permiteSobrecumplimiento: objetivo.permiteSobrecumplimiento,
  topeCumplimiento: objetivo.topeCumplimiento,
  formula: objetivo.formula,
  fuenteDatos: objetivo.fuenteDatos,
  responsableResultado: objetivo.responsableResultado ? String(objetivo.responsableResultado) : '',
});

/**
 * El formulario de definición de objetivos, tal como el mockup aprobado.
 *
 * Los campos cambian según el tipo de medición: el binario no pide meta, la
 * fórmula sí pide la expresión. El % de cumplimiento no aparece por ninguna
 * parte, a propósito: nunca se digita, lo calcula el backend.
 */
export function FormularioObjetivo({
  opciones,
  colaborador,
  periodo,
  disponible,
  objetivo,
  onListo,
  onCancelar,
}: {
  opciones: OpcionesPerformance;
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

  const esBinario = datos.tipoMedicion === 'binario';
  const esFormula = datos.tipoMedicion === 'formula';
  const necesitaMeta =
    datos.tipoMedicion === 'proporcional' || datos.tipoMedicion === 'proporcional_inverso';

  const responsables = [
    { value: String(colaborador.id), label: `El colaborador (${colaborador.nombre})` },
    ...opciones.equipo
      .filter((persona) => persona.id !== colaborador.id)
      .map((persona) => ({ value: String(persona.id), label: persona.nombre })),
  ];

  const onSubmit = async (evento: FormEvent) => {
    evento.preventDefault();
    const payload: ObjetivoPayload = {
      colaborador: colaborador.id,
      periodo,
      objetivo: datos.objetivo,
      kpi: datos.kpi,
      peso: datos.peso,
      tipoMedicion: datos.tipoMedicion as TipoMedicion,
      unidad: esBinario ? 'si_no' : datos.unidad,
      metaValor: esBinario || !datos.metaValor ? null : datos.metaValor,
      umbralCumplimiento: datos.umbralCumplimiento || null,
      permiteSobrecumplimiento: datos.permiteSobrecumplimiento,
      topeCumplimiento: datos.topeCumplimiento || '100',
      formula: esFormula ? datos.formula : '',
      fuenteDatos: datos.fuenteDatos,
      responsableResultado: datos.responsableResultado
        ? Number(datos.responsableResultado)
        : colaborador.id,
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
          <FieldDescription>Con qué se mide ese objetivo.</FieldDescription>
        </Field>

        <Selector
          id="obj-tipo"
          label="Tipo de medición"
          placeholder="Selecciona cómo se mide"
          value={datos.tipoMedicion}
          onChange={(valor) =>
            setDatos({
              ...datos,
              tipoMedicion: valor as TipoMedicion,
              // El binario no lleva meta ni unidad numérica.
              ...(valor === 'binario' ? { metaValor: '', unidad: 'si_no' } : {}),
            })
          }
          opciones={opciones.tiposMedicion}
        />

        <Selector
          id="obj-unidad"
          label="Unidad de medición"
          placeholder="Selecciona la unidad"
          value={datos.unidad}
          onChange={(unidad) => setDatos({ ...datos, unidad })}
          opciones={opciones.unidades}
          disabled={esBinario}
        />

        {necesitaMeta && (
          <Field className="min-w-0">
            <FieldLabel htmlFor="obj-meta">Meta</FieldLabel>
            <Input
              id="obj-meta"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="8"
              value={datos.metaValor}
              onChange={(e) => setDatos({ ...datos, metaValor: e.target.value })}
              required
            />
            <FieldDescription>
              {datos.tipoMedicion === 'proporcional_inverso'
                ? 'Menos es mejor: se cumple al llegar a este valor o por debajo.'
                : 'Más es mejor: el cumplimiento es lo logrado sobre esta meta.'}
            </FieldDescription>
          </Field>
        )}

        {esBinario && (
          <div className="flex items-start gap-2 rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground md:col-span-1">
            <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Resultado posible: <b className="text-foreground">Cumple → 100%</b> ·{' '}
              <b className="text-foreground">No cumple → 0%</b>. No requiere meta numérica.
            </span>
          </div>
        )}

        {esFormula && (
          <Field className="min-w-0 md:col-span-2">
            <FieldLabel htmlFor="obj-formula">Fórmula de medición</FieldLabel>
            <Input
              id="obj-formula"
              placeholder="logrado / meta * 100"
              value={datos.formula}
              onChange={(e) => setDatos({ ...datos, formula: e.target.value })}
              required
            />
            <FieldDescription>
              Solo aritmética con <code>logrado</code> y <code>meta</code>; también <code>min</code>
              , <code>max</code>, <code>abs</code> y <code>round</code>. Se prueba al guardar.
            </FieldDescription>
          </Field>
        )}

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
          <FieldLabel htmlFor="obj-umbral">Umbral de cumplimiento (opcional)</FieldLabel>
          <Input
            id="obj-umbral"
            type="number"
            step="0.01"
            value={datos.umbralCumplimiento}
            onChange={(e) => setDatos({ ...datos, umbralCumplimiento: e.target.value })}
          />
          <FieldDescription>
            Desde dónde cuenta como cumplido. Alimenta el semáforo.
          </FieldDescription>
        </Field>

        <Field className="min-w-0 md:col-span-2">
          <FieldLabel htmlFor="obj-sobre">Sobrecumplimiento (&gt;100%)</FieldLabel>
          <div className="flex items-center gap-3">
            <Switch
              id="obj-sobre"
              checked={datos.permiteSobrecumplimiento}
              onCheckedChange={(valor) =>
                setDatos({ ...datos, permiteSobrecumplimiento: Boolean(valor) })
              }
            />
            <span className="text-sm">Permitir superar el 100%</span>
          </div>
          <FieldDescription>
            Pendiente de definir con People — por ahora se configura por objetivo y viene topado a
            100%.
          </FieldDescription>
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

        <Selector
          id="obj-responsable"
          label="Responsable del resultado"
          placeholder="Quién carga el resultado"
          value={datos.responsableResultado || String(colaborador.id)}
          onChange={(responsableResultado) => setDatos({ ...datos, responsableResultado })}
          opciones={responsables}
        />
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
