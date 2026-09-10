import { useEffect, useState, type FormEvent } from 'react';
import { PlusIcon, TargetIcon, Trash2Icon } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Input,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
} from '@/shared/components/ui';
import { ConfirmarBorrado } from '@/shared/components/feedback';
import { ApiError } from '@/shared/api/http-client';
import { valoracionApi, type EstadoPlan, type PlanAccion } from '../api';
import { useQuery } from '@tanstack/react-query';
import {
  useOpciones,
  usePlanes,
  useResumen,
  useValoracionMutation,
  valoracionKeys,
} from '../hooks';
import { CampoSelect } from '../components/Filtros';
import { Bloqueado, Encabezado, EstadoTabla, formatoFecha } from '../components/Piezas';

const ESTADOS: Array<{ value: EstadoPlan | ''; label: string }> = [
  { value: '', label: 'Todos' },
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'en_proceso', label: 'En proceso' },
  { value: 'cumplido', label: 'Cumplido' },
];

const VARIANTE = (plan: PlanAccion) => {
  if (plan.status === 'cumplido') return 'success' as const;
  if (plan.isOverdue) return 'destructive' as const;
  if (plan.status === 'en_proceso') return 'warning' as const;
  return 'outline' as const;
};

/** Compromisos de mejora sobre las brechas detectadas. */
export default function PlanesAccionPage() {
  const [estado, setEstado] = useState('');
  const { data: planes = [], isLoading, error } = usePlanes({ status: estado || undefined });
  const { data: resumen } = useResumen();
  const [abierto, setAbierto] = useState(false);
  const [porBorrar, setPorBorrar] = useState<PlanAccion | null>(null);

  const puedeGestionar = !!resumen?.capabilities.canManagePlans;

  const eliminar = useValoracionMutation(
    (id: number) => valoracionApi.planes.remove(id),
    'Plan eliminado',
  );
  const marcar = useValoracionMutation(
    ({ id, status }: { id: number; status: EstadoPlan }) =>
      valoracionApi.planes.update(id, { status }),
    'Estado actualizado',
  );

  if (error instanceof ApiError && error.status === 403) {
    return (
      <div className="flex flex-col gap-6">
        <Encabezado titulo="Planes de acción" />
        <Bloqueado seccion="Planes de acción" avance={resumen?.progress} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="Planes de acción"
        descripcion="Cada brecha detectada se convierte en un compromiso con responsable y fecha."
      >
        {puedeGestionar && (
          <Button onClick={() => setAbierto(true)}>
            <PlusIcon data-icon="inline-start" />
            Nuevo plan
          </Button>
        )}
      </Encabezado>

      <ToggleGroup
        value={[estado]}
        onValueChange={(v) => setEstado((v[0] as string) ?? '')}
        variant="outline"
      >
        {ESTADOS.map((opcion) => (
          <ToggleGroupItem key={opcion.value || 'todos'} value={opcion.value}>
            {opcion.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <Card className="py-0">
        <EstadoTabla
          cargando={isLoading}
          vacio={planes.length === 0}
          icono={<TargetIcon />}
          titulo="Sin planes de acción"
          descripcion="Cuando se identifiquen brechas, crea aquí los compromisos de mejora."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-64">Acción</TableHead>
                <TableHead>Persona evaluada</TableHead>
                <TableHead>Responsable</TableHead>
                <TableHead>Compromiso</TableHead>
                <TableHead>Estado</TableHead>
                {puedeGestionar && <TableHead className="text-right">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {planes.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span>{plan.description}</span>
                      <span className="text-xs text-muted-foreground">{plan.cycleName}</span>
                      {plan.evidenceUrl && (
                        <a
                          href={plan.evidenceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs underline"
                        >
                          Ver evidencia
                        </a>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{plan.evaluateeName}</TableCell>
                  <TableCell>{plan.ownerName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatoFecha(plan.dueDate)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={VARIANTE(plan)}>
                      {plan.isOverdue && plan.status !== 'cumplido' ? 'Vencido' : plan.statusLabel}
                    </Badge>
                  </TableCell>
                  {puedeGestionar && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {plan.status !== 'cumplido' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              marcar.mutate({
                                id: plan.id,
                                status: plan.status === 'pendiente' ? 'en_proceso' : 'cumplido',
                              })
                            }
                          >
                            {plan.status === 'pendiente' ? 'Iniciar' : 'Marcar cumplido'}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Eliminar"
                          onClick={() => setPorBorrar(plan)}
                        >
                          <Trash2Icon />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </EstadoTabla>
      </Card>

      <PlanDialog abierto={abierto} onOpenChange={setAbierto} />

      <ConfirmarBorrado
        abierto={!!porBorrar}
        onOpenChange={(v) => !v && setPorBorrar(null)}
        titulo="¿Eliminar el plan?"
        descripcion="Se perderá el compromiso y su seguimiento."
        onConfirmar={() => {
          if (porBorrar) eliminar.mutate(porBorrar.id);
          setPorBorrar(null);
        }}
      />
    </div>
  );
}

const VACIO = {
  result: '',
  description: '',
  owner: '',
  dueDate: '',
  evidenceUrl: '',
  notes: '',
};

function PlanDialog({
  abierto,
  onOpenChange,
}: {
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [datos, setDatos] = useState(VACIO);
  const { data: opciones } = useOpciones();
  // Sobre lo que cada quien puede ver es sobre lo que puede comprometer algo:
  // el backend ya acota este listado, así que no hace falta ser líder.
  const { data: resultados = [] } = useQuery({
    queryKey: [...valoracionKeys.todo, 'resultados', 'visibles'],
    queryFn: () => valoracionApi.resultados.list(),
    enabled: abierto,
  });

  const crear = useValoracionMutation(
    () =>
      valoracionApi.planes.create({
        result: Number(datos.result),
        description: datos.description,
        owner: Number(datos.owner),
        dueDate: datos.dueDate,
        evidenceUrl: datos.evidenceUrl,
        notes: datos.notes,
      }),
    'Plan creado',
  );

  useEffect(() => {
    if (abierto) setDatos(VACIO);
  }, [abierto]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    crear.mutate(undefined, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo plan de acción</DialogTitle>
          <DialogDescription>
            Un compromiso concreto sobre un resultado ya consolidado.
          </DialogDescription>
        </DialogHeader>

        <form id="plan-form" onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <CampoSelect
              id="plan-resultado"
              label="Resultado"
              placeholder="Elige el resultado"
              value={datos.result}
              onChange={(v) => setDatos({ ...datos, result: v })}
              opciones={resultados.map((r) => ({
                value: String(r.id),
                label: `${r.evaluateeName} · ${r.cycleName} (${r.percentage}%)`,
              }))}
            />
            <Field>
              <FieldLabel htmlFor="plan-desc">Acción</FieldLabel>
              <Textarea
                id="plan-desc"
                rows={3}
                placeholder="Capacitación en gestión del tiempo…"
                value={datos.description}
                onChange={(e) => setDatos({ ...datos, description: e.target.value })}
                required
              />
            </Field>
            <CampoSelect
              id="plan-responsable"
              label="Responsable"
              placeholder="Quién ejecuta la acción"
              value={datos.owner}
              onChange={(v) => setDatos({ ...datos, owner: v })}
              opciones={(opciones?.people ?? []).map((p) => ({
                value: String(p.id),
                label: p.fullName,
              }))}
            />
            <Field>
              <FieldLabel htmlFor="plan-fecha">Fecha de compromiso</FieldLabel>
              <Input
                id="plan-fecha"
                type="date"
                value={datos.dueDate}
                onChange={(e) => setDatos({ ...datos, dueDate: e.target.value })}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="plan-evidencia">Evidencia</FieldLabel>
              <Input
                id="plan-evidencia"
                type="url"
                placeholder="https://…"
                value={datos.evidenceUrl}
                onChange={(e) => setDatos({ ...datos, evidenceUrl: e.target.value })}
              />
              <FieldDescription>Link a un certificado, documento o registro.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="plan-notas">Observaciones</FieldLabel>
              <Textarea
                id="plan-notas"
                rows={2}
                value={datos.notes}
                onChange={(e) => setDatos({ ...datos, notes: e.target.value })}
              />
            </Field>
          </FieldGroup>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="plan-form"
            disabled={crear.isPending || !datos.result || !datos.owner}
          >
            {crear.isPending && <Spinner data-icon="inline-start" />}
            Crear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
