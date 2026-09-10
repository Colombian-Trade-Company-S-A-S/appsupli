import { useState } from 'react';
import { CheckIcon, NetworkIcon, SearchIcon } from 'lucide-react';
import {
  Button,
  Card,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui';
import { valoracionApi, type FilaJerarquia } from '../api';
import { useJerarquia, useOpciones, useValoracionMutation } from '../hooks';
import { Encabezado, EstadoTabla } from '../components/Piezas';

/**
 * Cargo y jefe directo de cada persona.
 *
 * Es la misma información que administra el módulo de Administración; se edita
 * también desde aquí porque es la base de «quién evalúa a quién» y quien arma
 * los ciclos necesita ajustarla sin salir del módulo.
 */
export default function JerarquiaPage() {
  const [buscar, setBuscar] = useState('');
  const { data: personas = [], isLoading } = useJerarquia({ search: buscar || undefined });
  const { data: opciones } = useOpciones();

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="Jerarquía"
        descripcion="El organigrama del que salen las asignaciones: cada quien con su cargo y su jefe."
      />

      <div className="relative max-w-md">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por nombre, correo o cargo…"
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
        />
      </div>

      <Card className="py-0">
        <EstadoTabla
          cargando={isLoading}
          vacio={personas.length === 0}
          icono={<NetworkIcon />}
          titulo="Sin personas"
          descripcion="Ajusta la búsqueda o crea usuarios desde el módulo de Administración."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Persona</TableHead>
                <TableHead>Área</TableHead>
                <TableHead className="min-w-56">Cargo</TableHead>
                <TableHead className="min-w-56">Jefe directo</TableHead>
                <TableHead>A cargo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {personas.map((persona) => (
                <FilaPersona
                  key={persona.id}
                  persona={persona}
                  jefes={(opciones?.people ?? []).map((p) => ({
                    value: String(p.id),
                    label: p.fullName,
                  }))}
                />
              ))}
            </TableBody>
          </Table>
        </EstadoTabla>
      </Card>

      <p className="text-xs text-muted-foreground">
        Cambiar el jefe directo no altera las asignaciones ya creadas: aplica a los ciclos que se
        generen de aquí en adelante.
      </p>
    </div>
  );
}

function FilaPersona({
  persona,
  jefes,
}: {
  persona: FilaJerarquia;
  jefes: Array<{ value: string; label: string }>;
}) {
  const [cargo, setCargo] = useState(persona.position);

  const guardar = useValoracionMutation(
    (payload: { position?: string; manager?: number | null }) =>
      valoracionApi.jerarquia.update(persona.id, payload),
    'Jerarquía actualizada',
  );

  const opcionesJefe = [
    { value: '', label: 'Sin jefe' },
    ...jefes.filter((j) => Number(j.value) !== persona.id),
  ];
  const cargoCambio = cargo !== persona.position;

  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-col">
          <span className="font-medium">{persona.fullName}</span>
          <span className="text-xs text-muted-foreground">{persona.email}</span>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">{persona.areaName || '—'}</TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Input
            value={cargo}
            aria-label={`Cargo de ${persona.fullName}`}
            onChange={(e) => setCargo(e.target.value)}
          />
          {cargoCambio && (
            <Button
              variant="outline"
              size="icon"
              aria-label="Guardar cargo"
              disabled={guardar.isPending}
              onClick={() => guardar.mutate({ position: cargo })}
            >
              <CheckIcon />
            </Button>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Select
          items={opcionesJefe}
          value={persona.manager ? String(persona.manager) : ''}
          onValueChange={(v) => guardar.mutate({ manager: v ? Number(v) : null })}
        >
          <SelectTrigger aria-label={`Jefe directo de ${persona.fullName}`}>
            <SelectValue placeholder="Sin jefe" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {opcionesJefe.map((opcion) => (
                <SelectItem key={opcion.value || 'ninguno'} value={opcion.value}>
                  {opcion.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="tabular-nums text-muted-foreground">{persona.teamCount}</TableCell>
    </TableRow>
  );
}
