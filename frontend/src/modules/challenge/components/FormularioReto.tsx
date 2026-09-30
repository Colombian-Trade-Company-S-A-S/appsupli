import { useEffect, useState, type FormEvent } from 'react';
import { InfoIcon } from 'lucide-react';
import {
  Badge,
  Button,
  Checkbox,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from '@/shared/components/ui';
import { useCrearReto, useEditarReto } from '../hooks';
import type { Alcance, FormatoEvidencia, OpcionesChallenge, Reto, RetoPayload } from '../api';

const VACIO: RetoPayload = {
  titulo: '',
  descripcion: '',
  categoria: '',
  cuentaParaDesempeno: false,
  alcance: 'todos',
  areas: [],
  personas: [],
  pais: '',
  cierraEl: '',
  formatosEvidencia: ['texto', 'enlace'],
  visibilidadEvidencia: 'lider_people',
};

const desde = (reto: Reto): RetoPayload => ({
  titulo: reto.titulo,
  descripcion: reto.descripcion,
  categoria: reto.categoria,
  cuentaParaDesempeno: reto.cuentaParaDesempeno,
  alcance: reto.alcance,
  areas: reto.areas,
  personas: reto.personas,
  pais: reto.pais,
  cierraEl: reto.cierraEl,
  formatosEvidencia: reto.formatosEvidencia,
  visibilidadEvidencia: reto.visibilidadEvidencia,
});

/**
 * El formulario de reto, como el prototipo aprobado.
 *
 * Con el reto ya abierto solo se habilitan el texto y la fecha de cierre, y
 * esta última nunca hacia atrás: al publicar, las reglas quedan fijas (B1).
 */
export function FormularioReto({
  opciones,
  reto,
  onListo,
  onCancelar,
}: {
  opciones: OpcionesChallenge;
  reto?: Reto;
  onListo: () => void;
  onCancelar?: () => void;
}) {
  const [datos, setDatos] = useState<RetoPayload>(reto ? desde(reto) : VACIO);
  const crear = useCrearReto();
  const editar = useEditarReto();
  const bloqueado = !!reto && reto.estado !== 'borrador';

  useEffect(() => {
    setDatos(reto ? desde(reto) : VACIO);
  }, [reto]);

  const alternarFormato = (formato: FormatoEvidencia, activo: boolean) =>
    setDatos({
      ...datos,
      formatosEvidencia: activo
        ? [...datos.formatosEvidencia, formato]
        : datos.formatosEvidencia.filter((f) => f !== formato),
    });

  const onSubmit = async (evento: FormEvent) => {
    evento.preventDefault();
    try {
      if (reto) {
        // Publicado el reto, solo viajan los campos que sí se pueden cambiar.
        const payload = bloqueado
          ? {
              titulo: datos.titulo,
              descripcion: datos.descripcion,
              cierraEl: datos.cierraEl,
            }
          : datos;
        await editar.mutateAsync({ id: reto.id, ...payload });
      } else {
        await crear.mutateAsync(datos);
      }
      onListo();
    } catch {
      // El aviso lo da la mutación con su toast.
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {bloqueado && (
        <div className="flex items-start gap-2 rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
          <span>
            El reto ya está abierto: criterios, puntaje, público y tipo de evidencia quedaron fijos.
            Se puede corregir el texto y ampliar el plazo, nunca reducirlo, y el cambio queda en el
            historial que ve el colaborador.
          </span>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Field className="min-w-0 md:col-span-2">
          <FieldLabel htmlFor="reto-titulo">Nombre del reto</FieldLabel>
          <Input
            id="reto-titulo"
            placeholder="Vive el principio: foco en el cliente"
            value={datos.titulo}
            onChange={(e) => setDatos({ ...datos, titulo: e.target.value })}
            required
          />
        </Field>

        <Field className="min-w-0 md:col-span-2">
          <FieldLabel htmlFor="reto-descripcion">Descripción / instrucciones</FieldLabel>
          <Textarea
            id="reto-descripcion"
            rows={3}
            placeholder="Comparte una acción concreta donde priorizaste al cliente interno."
            value={datos.descripcion}
            onChange={(e) => setDatos({ ...datos, descripcion: e.target.value })}
            required
          />
          <FieldDescription>Lo que el colaborador ve antes de participar.</FieldDescription>
        </Field>

        <Field className="min-w-0">
          <FieldLabel htmlFor="reto-categoria">Categoría</FieldLabel>
          <Select
            items={opciones.categorias}
            value={datos.categoria}
            disabled={bloqueado}
            onValueChange={(v) =>
              setDatos({ ...datos, categoria: (v as RetoPayload['categoria']) ?? '' })
            }
          >
            <SelectTrigger id="reto-categoria">
              <SelectValue placeholder="Selecciona la categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {opciones.categorias.map((opcion) => (
                  <SelectItem key={opcion.value} value={opcion.value}>
                    {opcion.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <Field className="min-w-0">
          <FieldLabel htmlFor="reto-cierre">Cierra el</FieldLabel>
          <Input
            id="reto-cierre"
            type="date"
            value={datos.cierraEl}
            onChange={(e) => setDatos({ ...datos, cierraEl: e.target.value })}
            required
          />
          <FieldDescription>
            {bloqueado ? 'Solo se puede ampliar.' : 'Último día para participar.'}
          </FieldDescription>
        </Field>

        <Field className="min-w-0">
          <FieldLabel htmlFor="reto-alcance">Público objetivo</FieldLabel>
          <Select
            items={opciones.alcances}
            value={datos.alcance}
            disabled={bloqueado}
            onValueChange={(v) => setDatos({ ...datos, alcance: (v as Alcance) ?? 'todos' })}
          >
            <SelectTrigger id="reto-alcance">
              <SelectValue placeholder="Selecciona el público" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {opciones.alcances.map((opcion) => (
                  <SelectItem key={opcion.value} value={opcion.value}>
                    {opcion.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>
            Con la integración de Odoo, el área y el país llegan solos.
          </FieldDescription>
        </Field>

        <Field className="min-w-0">
          <FieldLabel htmlFor="reto-pais">País (opcional)</FieldLabel>
          <Input
            id="reto-pais"
            placeholder="Colombia"
            value={datos.pais}
            disabled={bloqueado}
            onChange={(e) => setDatos({ ...datos, pais: e.target.value })}
          />
        </Field>

        {datos.alcance === 'areas' && (
          <fieldset className="md:col-span-2">
            <legend className="mb-2 text-sm font-medium">Áreas invitadas</legend>
            <div className="flex flex-wrap gap-3">
              {opciones.areas.map((area) => (
                <label key={area.value} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={datos.areas.includes(area.value)}
                    disabled={bloqueado}
                    onCheckedChange={(activo) =>
                      setDatos({
                        ...datos,
                        areas: activo
                          ? [...datos.areas, area.value]
                          : datos.areas.filter((id) => id !== area.value),
                      })
                    }
                  />
                  {area.label}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {datos.alcance === 'personas' && (
          <fieldset className="md:col-span-2">
            <legend className="mb-2 text-sm font-medium">Personas invitadas</legend>
            <div className="flex max-h-48 flex-wrap gap-3 overflow-y-auto">
              {opciones.personas.map((persona) => (
                <label key={persona.value} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={datos.personas.includes(persona.value)}
                    disabled={bloqueado}
                    onCheckedChange={(activo) =>
                      setDatos({
                        ...datos,
                        personas: activo
                          ? [...datos.personas, persona.value]
                          : datos.personas.filter((id) => id !== persona.value),
                      })
                    }
                  />
                  {persona.label}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <fieldset className="md:col-span-2">
          <legend className="mb-2 text-sm font-medium">Formatos de evidencia permitidos</legend>
          <div className="flex flex-wrap gap-3">
            {opciones.formatos.map((formato) => (
              <label key={formato.value} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={datos.formatosEvidencia.includes(formato.value as FormatoEvidencia)}
                  disabled={bloqueado}
                  onCheckedChange={(activo) =>
                    alternarFormato(formato.value as FormatoEvidencia, Boolean(activo))
                  }
                />
                {formato.label}
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            El video se referencia por enlace con permiso de visualización; no se sube el archivo.
          </p>
        </fieldset>

        <Field className="min-w-0 md:col-span-2">
          <FieldLabel htmlFor="reto-visibilidad">Visibilidad de la evidencia</FieldLabel>
          <Select
            items={opciones.visibilidades}
            value={datos.visibilidadEvidencia}
            disabled={bloqueado}
            onValueChange={(v) =>
              setDatos({
                ...datos,
                visibilidadEvidencia: (v as RetoPayload['visibilidadEvidencia']) ?? 'lider_people',
              })
            }
          >
            <SelectTrigger id="reto-visibilidad">
              <SelectValue placeholder="Quién puede ver los soportes" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {opciones.visibilidades.map((opcion) => (
                  <SelectItem key={opcion.value} value={opcion.value}>
                    {opcion.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>
            El jefe inmediato, People y el CEO siempre pueden validar los soportes.
          </FieldDescription>
        </Field>

        <Field className="min-w-0 md:col-span-2">
          <FieldLabel htmlFor="reto-desempeno">Relación con Performance</FieldLabel>
          <div className="flex items-center gap-3">
            <Switch
              id="reto-desempeno"
              checked={datos.cuentaParaDesempeno}
              disabled={bloqueado}
              onCheckedChange={(valor) =>
                setDatos({ ...datos, cuentaParaDesempeno: Boolean(valor) })
              }
            />
            <span className="text-sm">
              {datos.cuentaParaDesempeno
                ? 'Cuenta para desempeño'
                : 'Cultura — no cuenta para desempeño'}
            </span>
          </div>
        </Field>
      </div>

      <div className="rounded-lg border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        <p className="mb-1 font-medium text-foreground">Rúbrica del reto</p>
        <div className="flex flex-wrap gap-2">
          {(reto?.criterios.length ? reto.criterios : opciones.criteriosBase).map((criterio) => (
            <Badge key={criterio.nombre} variant="outline">
              {criterio.nombre}
              {criterio.desempate && ' · desempate'}
            </Badge>
          ))}
        </div>
        <p className="mt-2">
          Cada criterio se califica de 1 a 10; el sistema promedia y lo lleva a 0–100. Cada
          participación la valoran dos miembros de Supli y un jurado sorteado para el reto.
        </p>
      </div>

      <div className="flex justify-end gap-2">
        {onCancelar && (
          <Button type="button" variant="ghost" onClick={onCancelar}>
            Cancelar
          </Button>
        )}
        <Button
          type="submit"
          // La categoría y la fecha son obligatorias: sin ellas el backend
          // rechaza el reto, y es mejor decirlo antes de enviarlo.
          disabled={
            !datos.titulo.trim() ||
            !datos.categoria ||
            !datos.cierraEl ||
            datos.formatosEvidencia.length === 0 ||
            crear.isPending ||
            editar.isPending
          }
        >
          {reto ? 'Guardar cambios' : 'Guardar borrador'}
        </Button>
      </div>
    </form>
  );
}
