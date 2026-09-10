import { FilterXIcon } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Field,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui';
import type { Segmentacion } from '../api';
import { useOpciones } from '../hooks';
import { NIVELES } from './Semaforo';

export type OpcionSelect = { value: string; label: string };

/** Un desplegable con su opción «todas» al principio. */
export function CampoSelect({
  id,
  label,
  placeholder,
  value,
  onChange,
  opciones,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (valor: string) => void;
  opciones: OpcionSelect[];
}) {
  const items = [{ value: '', label: placeholder }, ...opciones];
  return (
    <Field className="min-w-40 flex-1">
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

/**
 * Segmentación compartida por el dashboard, el consolidado y los resultados
 * del equipo. Los mismos filtros viajan al CSV, así que lo que se ve en
 * pantalla es exactamente lo que se exporta.
 */
export function FiltrosSegmentacion({
  filtros,
  onChange,
  ocultar = [],
}: {
  filtros: Segmentacion;
  onChange: (filtros: Segmentacion) => void;
  ocultar?: Array<keyof Segmentacion>;
}) {
  const { data: opciones } = useOpciones();
  const set = (clave: keyof Segmentacion, valor: string) =>
    onChange({ ...filtros, [clave]: valor });
  const visible = (clave: keyof Segmentacion) => !ocultar.includes(clave);
  const hayFiltros = Object.values(filtros).some(Boolean);

  return (
    <Card className="py-4">
      <CardContent className="flex flex-wrap items-end gap-3">
        <Field className="min-w-36 flex-1">
          <FieldLabel htmlFor="filtro-desde">Desde</FieldLabel>
          <Input
            id="filtro-desde"
            type="date"
            value={filtros.dateFrom ?? ''}
            onChange={(e) => set('dateFrom', e.target.value)}
          />
        </Field>
        <Field className="min-w-36 flex-1">
          <FieldLabel htmlFor="filtro-hasta">Hasta</FieldLabel>
          <Input
            id="filtro-hasta"
            type="date"
            value={filtros.dateTo ?? ''}
            onChange={(e) => set('dateTo', e.target.value)}
          />
        </Field>

        {visible('cycle') && (
          <CampoSelect
            id="filtro-ciclo"
            label="Ciclo"
            placeholder="Todos los ciclos"
            value={filtros.cycle ?? ''}
            onChange={(v) => set('cycle', v)}
            opciones={(opciones?.cycles ?? []).map((c) => ({
              value: String(c.value),
              label: c.label,
            }))}
          />
        )}
        {visible('area') && (
          <CampoSelect
            id="filtro-area"
            label="Área"
            placeholder="Todas las áreas"
            value={filtros.area ?? ''}
            onChange={(v) => set('area', v)}
            opciones={(opciones?.areas ?? []).map((a) => ({
              value: String(a.value),
              label: a.label,
            }))}
          />
        )}
        {visible('team') && (
          <CampoSelect
            id="filtro-equipo"
            label="Equipo"
            placeholder="Todos los equipos"
            value={filtros.team ?? ''}
            onChange={(v) => set('team', v)}
            opciones={(opciones?.teams ?? []).map((t) => ({
              value: String(t.value),
              label: t.label,
            }))}
          />
        )}
        {visible('kind') && (
          <CampoSelect
            id="filtro-rol"
            label="Rol"
            placeholder="Todos los roles"
            value={filtros.kind ?? ''}
            onChange={(v) => set('kind', v)}
            opciones={[
              { value: 'lider', label: 'Líder' },
              { value: 'colaborador', label: 'Colaborador' },
              { value: 'admin', label: 'Admin' },
            ]}
          />
        )}
        {visible('position') && (
          <CampoSelect
            id="filtro-cargo"
            label="Cargo"
            placeholder="Todos los cargos"
            value={filtros.position ?? ''}
            onChange={(v) => set('position', v)}
            opciones={(opciones?.positions ?? []).map((c) => ({ value: c, label: c }))}
          />
        )}
        {visible('person') && (
          <CampoSelect
            id="filtro-persona"
            label="Persona"
            placeholder="Todas las personas"
            value={filtros.person ?? ''}
            onChange={(v) => set('person', v)}
            opciones={(opciones?.people ?? []).map((p) => ({
              value: String(p.id),
              label: p.fullName,
            }))}
          />
        )}
        {visible('evaluationType') && (
          <CampoSelect
            id="filtro-tipo"
            label="Tipo"
            placeholder="Ambos tipos"
            value={filtros.evaluationType ?? ''}
            onChange={(v) => set('evaluationType', v)}
            opciones={[
              { value: 'lider', label: 'Liderazgo' },
              { value: 'operativo', label: 'Operativo' },
            ]}
          />
        )}
        {visible('level') && (
          <CampoSelect
            id="filtro-semaforo"
            label="Semáforo"
            placeholder="Todos los niveles"
            value={filtros.level ?? ''}
            onChange={(v) => set('level', v)}
            opciones={NIVELES.map((n) => ({ value: n.value, label: n.label }))}
          />
        )}

        <Button variant="ghost" onClick={() => onChange({})} disabled={!hayFiltros}>
          <FilterXIcon data-icon="inline-start" />
          Limpiar
        </Button>
      </CardContent>
    </Card>
  );
}
