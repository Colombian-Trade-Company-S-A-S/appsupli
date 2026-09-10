import {
  Field,
  FieldLabel,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui';

/**
 * Un desplegable con su etiqueta.
 *
 * `incluirTodas` agrega la opción vacía al principio: sirve para los filtros,
 * no para los formularios, donde un campo obligatorio no debe poder quedar en
 * blanco desde el desplegable.
 */
export function CampoSelect({
  id,
  label,
  placeholder,
  value,
  onChange,
  opciones,
  incluirTodas = true,
  className,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (valor: string) => void;
  opciones: Array<{ value: string; label: string }>;
  incluirTodas?: boolean;
  className?: string;
}) {
  const items = incluirTodas ? [{ value: '', label: placeholder }, ...opciones] : opciones;

  return (
    <Field className={className ?? 'min-w-44 flex-1'}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select items={items} value={value} onValueChange={(v) => onChange((v as string) ?? '')}>
        <SelectTrigger id={id}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map((opcion) => (
              <SelectItem key={opcion.value || 'todas'} value={opcion.value}>
                {opcion.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}
