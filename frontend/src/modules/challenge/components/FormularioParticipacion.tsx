import { useState, type FormEvent } from 'react';
import { LinkIcon } from 'lucide-react';
import {
  Button,
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
  Textarea,
} from '@/shared/components/ui';
import { useParticipar } from '../hooks';
import type { FormatoEvidencia, OpcionesChallenge, Participacion, Reto } from '../api';

/**
 * Cargar la evidencia: entregarla es participar (B9).
 *
 * Solo se ofrecen los formatos que aceptó el reto, y el video va por enlace
 * con permiso de visualización, no como archivo (B5).
 */
export function FormularioParticipacion({
  reto,
  opciones,
  mia,
  onListo,
}: {
  reto: Reto;
  opciones: OpcionesChallenge;
  mia?: Participacion;
  onListo: () => void;
}) {
  const permitidos = opciones.formatos.filter((formato) =>
    reto.formatosEvidencia.includes(formato.value as FormatoEvidencia),
  );
  const [formato, setFormato] = useState<FormatoEvidencia>(
    mia?.formato ?? (permitidos[0]?.value as FormatoEvidencia) ?? 'texto',
  );
  const [texto, setTexto] = useState(mia?.entregaTexto ?? '');
  const [link, setLink] = useState(mia?.entregaLink ?? '');
  const participar = useParticipar();

  const onSubmit = async (evento: FormEvent) => {
    evento.preventDefault();
    try {
      await participar.mutateAsync({
        reto: reto.id,
        formato,
        entregaTexto: formato === 'texto' ? texto : '',
        entregaLink: formato === 'texto' ? '' : link,
      });
      onListo();
    } catch {
      // El aviso lo da la mutación con su toast.
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
        <p className="mb-1 font-medium">Criterios con los que te van a valorar</p>
        <p className="text-xs text-muted-foreground text-pretty">
          {reto.criterios.map((criterio) => criterio.nombre).join(' · ')}. Cada uno de 1 a 10; el
          promedio se lleva a 0–100.
        </p>
      </div>

      <Field className="min-w-0">
        <FieldLabel htmlFor="participacion-formato">Formato de la evidencia</FieldLabel>
        <Select
          items={permitidos}
          value={formato}
          onValueChange={(v) => setFormato((v as FormatoEvidencia) ?? 'texto')}
        >
          <SelectTrigger id="participacion-formato">
            <SelectValue placeholder="Selecciona el formato" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {permitidos.map((opcion) => (
                <SelectItem key={opcion.value} value={opcion.value}>
                  {opcion.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldDescription>
          Este reto acepta: {permitidos.map((f) => f.label).join(', ')}.
        </FieldDescription>
      </Field>

      {formato === 'texto' ? (
        <Field className="min-w-0">
          <FieldLabel htmlFor="participacion-texto">Tu respuesta</FieldLabel>
          <Textarea
            id="participacion-texto"
            rows={4}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            required
          />
        </Field>
      ) : (
        <Field className="min-w-0">
          <FieldLabel htmlFor="participacion-link">Enlace del soporte</FieldLabel>
          <div className="relative">
            <LinkIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="participacion-link"
              type="url"
              className="pl-9"
              placeholder="https://supli.sharepoint.com/..."
              value={link}
              onChange={(e) => setLink(e.target.value)}
              required
            />
          </div>
          <FieldDescription>
            Revisa que quien valora pueda abrirlo: sin permiso de visualización, la evidencia no
            cuenta.
          </FieldDescription>
        </Field>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onListo}>
          Cancelar
        </Button>
        <Button type="submit" disabled={participar.isPending}>
          {mia ? 'Reemplazar evidencia' : 'Enviar evidencia'}
        </Button>
      </div>
    </form>
  );
}
