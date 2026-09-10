import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  CalculatorIcon,
  ClipboardListIcon,
  PencilIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
} from 'lucide-react';
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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@/shared/components/ui';
import { valoracionApi, type Ciclo } from '../api';
import { useCiclos, useValoracionMutation } from '../hooks';
import { ConfirmarBorrado } from '@/shared/components/feedback';
import { Encabezado, EstadoTabla, formatoFecha, paraInputFechaHora } from '../components/Piezas';
import { BarraAvance } from '../components/Semaforo';

const ESTADOS = [
  { value: 'programado', label: 'Programado' },
  { value: 'activo', label: 'Activo' },
  { value: 'cerrado', label: 'Cerrado' },
  { value: 'cancelado', label: 'Cancelado' },
  { value: 'finalizado', label: 'Finalizado' },
];

const TIPOS = [
  { value: 'mixta', label: 'Mixta (liderazgo y operativo)' },
  { value: 'lider', label: 'Liderazgo' },
  { value: 'operativo', label: 'Operativo/táctico' },
];

const VARIANTE_ESTADO = (ciclo: Ciclo) => {
  if (ciclo.effectiveStatus === 'activo') return 'success' as const;
  if (ciclo.effectiveStatus === 'vencido') return 'warning' as const;
  return 'outline' as const;
};

/** Los periodos de evaluación: crear, activar y consolidar. */
export default function CiclosPage() {
  const { data: ciclos = [], isLoading } = useCiclos();
  const [editando, setEditando] = useState<Ciclo | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [porBorrar, setPorBorrar] = useState<Ciclo | null>(null);

  const eliminar = useValoracionMutation(
    (id: number) => valoracionApi.ciclos.remove(id),
    'Ciclo eliminado',
  );
  const consolidar = useValoracionMutation(
    (id: number) => valoracionApi.ciclos.consolidar(id),
    (data) => data.message,
  );

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="Ciclos de evaluación"
        descripcion="Un ciclo es un periodo con su ventana de fechas y sus reglas de peso."
      >
        <Button
          onClick={() => {
            setEditando(null);
            setAbierto(true);
          }}
        >
          <PlusIcon data-icon="inline-start" />
          Nuevo ciclo
        </Button>
      </Encabezado>

      <Card className="py-0">
        <EstadoTabla
          cargando={isLoading}
          vacio={ciclos.length === 0}
          icono={<ClipboardListIcon />}
          titulo="Todavía no hay ciclos"
          descripcion="Crea el primer periodo de evaluación para empezar a asignar evaluadores."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ciclo</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Ventana</TableHead>
                <TableHead>Pesos</TableHead>
                <TableHead className="min-w-36">Avance</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ciclos.map((ciclo) => (
                <TableRow key={ciclo.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{ciclo.name}</span>
                      {ciclo.isAnonymous && (
                        <span className="text-xs text-muted-foreground">Anónimo</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{ciclo.evaluationTypeLabel}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatoFecha(ciclo.startDate)} → {formatoFecha(ciclo.endDate)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {ciclo.managerWeight}/{ciclo.teamWeight}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <BarraAvance porcentaje={ciclo.progress.percentage} />
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {ciclo.progress.completed}/{ciclo.progress.total} (
                        {ciclo.progress.percentage}%)
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={VARIANTE_ESTADO(ciclo)}>{ciclo.effectiveStatusLabel}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        render={<Link to={`/inicio/valoracion/ciclos/${ciclo.id}`} />}
                      >
                        <SettingsIcon data-icon="inline-start" />
                        Asignaciones
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={consolidar.isPending}
                        onClick={() => consolidar.mutate(ciclo.id)}
                      >
                        <CalculatorIcon data-icon="inline-start" />
                        Consolidar
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Editar"
                        onClick={() => {
                          setEditando(ciclo);
                          setAbierto(true);
                        }}
                      >
                        <PencilIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Eliminar"
                        onClick={() => setPorBorrar(ciclo)}
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </EstadoTabla>
      </Card>

      <p className="text-xs text-muted-foreground">
        El motor de cálculo se corre a mano con «Consolidar»: puedes repetirlo cada vez que entren
        respuestas nuevas.
      </p>

      <CicloDialog abierto={abierto} onOpenChange={setAbierto} ciclo={editando} />

      <ConfirmarBorrado
        abierto={!!porBorrar}
        onOpenChange={(v) => !v && setPorBorrar(null)}
        titulo="¿Eliminar el ciclo?"
        descripcion={`Se eliminarán también las asignaciones de «${porBorrar?.name}». Si ya tiene respuestas, ciérralo en vez de borrarlo.`}
        onConfirmar={() => {
          if (porBorrar) eliminar.mutate(porBorrar.id);
          setPorBorrar(null);
        }}
      />
    </div>
  );
}

const VACIO = {
  name: '',
  description: '',
  evaluationType: 'mixta' as Ciclo['evaluationType'],
  startDate: '',
  endDate: '',
  status: 'programado' as Ciclo['status'],
  isAnonymous: false,
  commentsRequired: false,
  managerWeight: 60,
  teamWeight: 40,
};

function CicloDialog({
  abierto,
  onOpenChange,
  ciclo,
}: {
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
  ciclo: Ciclo | null;
}) {
  const editando = !!ciclo;
  const [datos, setDatos] = useState(VACIO);

  const guardar = useValoracionMutation(
    (payload: Partial<Ciclo>) =>
      editando
        ? valoracionApi.ciclos.update(ciclo.id, payload)
        : valoracionApi.ciclos.create(payload),
    editando ? 'Ciclo actualizado' : 'Ciclo creado',
  );

  useEffect(() => {
    if (!abierto) return;
    setDatos(
      ciclo
        ? {
            name: ciclo.name,
            description: ciclo.description,
            evaluationType: ciclo.evaluationType,
            startDate: paraInputFechaHora(ciclo.startDate),
            endDate: paraInputFechaHora(ciclo.endDate),
            status: ciclo.status,
            isAnonymous: ciclo.isAnonymous,
            commentsRequired: ciclo.commentsRequired,
            managerWeight: ciclo.managerWeight,
            teamWeight: ciclo.teamWeight,
          }
        : VACIO,
    );
  }, [abierto, ciclo]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    guardar.mutate(
      {
        ...datos,
        startDate: new Date(datos.startDate).toISOString(),
        endDate: new Date(datos.endDate).toISOString(),
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editando ? 'Editar ciclo' : 'Nuevo ciclo'}</DialogTitle>
          <DialogDescription>
            Mientras esté en «Programado» nadie puede responder; pásalo a «Activo» cuando esté
            listo.
          </DialogDescription>
        </DialogHeader>

        <form id="ciclo-form" onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="ciclo-nombre">Nombre</FieldLabel>
              <Input
                id="ciclo-nombre"
                placeholder="Evaluación Q2 2026"
                value={datos.name}
                onChange={(e) => setDatos({ ...datos, name: e.target.value })}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="ciclo-desc">Descripción</FieldLabel>
              <Textarea
                id="ciclo-desc"
                rows={2}
                value={datos.description}
                onChange={(e) => setDatos({ ...datos, description: e.target.value })}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="ciclo-tipo">Tipo</FieldLabel>
              <Select
                items={TIPOS}
                value={datos.evaluationType}
                onValueChange={(v) =>
                  setDatos({ ...datos, evaluationType: (v as Ciclo['evaluationType']) ?? 'mixta' })
                }
              >
                <SelectTrigger id="ciclo-tipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {TIPOS.map((tipo) => (
                      <SelectItem key={tipo.value} value={tipo.value}>
                        {tipo.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="ciclo-inicio">Inicio</FieldLabel>
                <Input
                  id="ciclo-inicio"
                  type="datetime-local"
                  value={datos.startDate}
                  onChange={(e) => setDatos({ ...datos, startDate: e.target.value })}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ciclo-cierre">Cierre</FieldLabel>
                <Input
                  id="ciclo-cierre"
                  type="datetime-local"
                  value={datos.endDate}
                  onChange={(e) => setDatos({ ...datos, endDate: e.target.value })}
                  required
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="ciclo-estado">Estado</FieldLabel>
              <Select
                items={ESTADOS}
                value={datos.status}
                onValueChange={(v) =>
                  setDatos({ ...datos, status: (v as Ciclo['status']) ?? 'programado' })
                }
              >
                <SelectTrigger id="ciclo-estado">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {ESTADOS.map((estado) => (
                      <SelectItem key={estado.value} value={estado.value}>
                        {estado.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="ciclo-peso-jefe">Peso del jefe (%)</FieldLabel>
                <Input
                  id="ciclo-peso-jefe"
                  type="number"
                  min={0}
                  max={100}
                  value={datos.managerWeight}
                  onChange={(e) =>
                    setDatos({
                      ...datos,
                      managerWeight: Number(e.target.value),
                      teamWeight: 100 - Number(e.target.value),
                    })
                  }
                />
                <FieldDescription>Solo aplica en evaluaciones de liderazgo.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="ciclo-peso-equipo">Peso del equipo (%)</FieldLabel>
                <Input
                  id="ciclo-peso-equipo"
                  type="number"
                  min={0}
                  max={100}
                  value={datos.teamWeight}
                  onChange={(e) =>
                    setDatos({
                      ...datos,
                      teamWeight: Number(e.target.value),
                      managerWeight: 100 - Number(e.target.value),
                    })
                  }
                />
                <FieldDescription>Los dos deben sumar 100.</FieldDescription>
              </Field>
            </div>

            <Field orientation="horizontal">
              <Switch
                id="ciclo-anonimo"
                checked={datos.isAnonymous}
                onCheckedChange={(v) => setDatos({ ...datos, isAnonymous: v })}
              />
              <FieldLabel htmlFor="ciclo-anonimo">
                Anónimo (el evaluado no ve quién lo calificó)
              </FieldLabel>
            </Field>
            <Field orientation="horizontal">
              <Switch
                id="ciclo-comentarios"
                checked={datos.commentsRequired}
                onCheckedChange={(v) => setDatos({ ...datos, commentsRequired: v })}
              />
              <FieldLabel htmlFor="ciclo-comentarios">
                Observaciones y acuerdos obligatorios
              </FieldLabel>
            </Field>
          </FieldGroup>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="ciclo-form" disabled={guardar.isPending}>
            {guardar.isPending && <Spinner data-icon="inline-start" />}
            {editando ? 'Guardar' : 'Crear'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
