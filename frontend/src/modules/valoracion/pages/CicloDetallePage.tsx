import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeftIcon,
  CalculatorIcon,
  NetworkIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
  UsersIcon,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldLabel,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/shared/components/ui';
import { ConfirmarBorrado } from '@/shared/components/feedback';
import { FullPageLoader } from '@/shared/components/feedback';
import { valoracionApi, type Asignacion, type EstadoAsignacion } from '../api';
import {
  useAsignaciones,
  useCiclo,
  useOpciones,
  usePendientes,
  useValoracionMutation,
} from '../hooks';
import { Encabezado, EstadoTabla, formatoFecha } from '../components/Piezas';
import { BarraAvance } from '../components/Semaforo';

const VARIANTE: Record<EstadoAsignacion, 'outline' | 'warning' | 'success'> = {
  pendiente: 'outline',
  en_progreso: 'warning',
  completada: 'success',
};

/** Quién evalúa a quién dentro de un ciclo, y cómo va el seguimiento. */
export default function CicloDetallePage() {
  const { id } = useParams<{ id: string }>();
  const cicloId = Number(id);
  const { data: ciclo, isLoading: cargandoCiclo } = useCiclo(cicloId);
  const { data: asignaciones = [], isLoading } = useAsignaciones(cicloId);
  const { data: pendientes } = usePendientes(cicloId);

  const [dialogoAsignacion, setDialogoAsignacion] = useState(false);
  const [dialogoJerarquia, setDialogoJerarquia] = useState(false);
  const [porBorrar, setPorBorrar] = useState<Asignacion | null>(null);

  const eliminar = useValoracionMutation(
    (idAsignacion: number) => valoracionApi.asignaciones.remove(idAsignacion),
    'Asignación eliminada',
  );
  const reabrir = useValoracionMutation(
    (idAsignacion: number) => valoracionApi.asignaciones.reabrir(idAsignacion),
    (data) => data.message,
  );
  const alternar = useValoracionMutation(
    (idAsignacion: number) => valoracionApi.asignaciones.toggleActiva(idAsignacion),
    'Asignación actualizada',
  );
  const consolidar = useValoracionMutation(
    () => valoracionApi.ciclos.consolidar(cicloId),
    (data) => data.message,
  );

  if (cargandoCiclo || !ciclo) return <FullPageLoader label="Cargando el ciclo…" />;

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo={ciclo.name}
        descripcion={`${ciclo.evaluationTypeLabel} · ${formatoFecha(ciclo.startDate)} → ${formatoFecha(
          ciclo.endDate,
        )} · ${ciclo.effectiveStatusLabel}`}
      >
        <Button variant="outline" render={<Link to="/inicio/valoracion/ciclos" />}>
          <ArrowLeftIcon data-icon="inline-start" />
          Ciclos
        </Button>
        <Button variant="outline" onClick={() => setDialogoJerarquia(true)}>
          <NetworkIcon data-icon="inline-start" />
          Generar por jerarquía
        </Button>
        <Button variant="outline" onClick={() => setDialogoAsignacion(true)}>
          <PlusIcon data-icon="inline-start" />
          Nueva asignación
        </Button>
        <Button disabled={consolidar.isPending} onClick={() => consolidar.mutate(undefined)}>
          {consolidar.isPending && <Spinner data-icon="inline-start" />}
          <CalculatorIcon data-icon="inline-start" />
          Consolidar resultados
        </Button>
      </Encabezado>

      <Card>
        <CardHeader>
          <CardTitle>Avance del ciclo</CardTitle>
          <CardDescription>
            {ciclo.progress.completed} de {ciclo.progress.total} evaluaciones respondidas.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <BarraAvance porcentaje={ciclo.progress.percentage} />
          <span className="text-xs tabular-nums text-muted-foreground">
            {ciclo.progress.percentage}% · faltan {ciclo.progress.pending}
          </span>
        </CardContent>
      </Card>

      <Tabs defaultValue="asignaciones">
        <TabsList>
          <TabsTrigger value="asignaciones">Asignaciones ({asignaciones.length})</TabsTrigger>
          <TabsTrigger value="pendientes">Pendientes ({pendientes?.total ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="asignaciones">
          <Card className="py-0">
            <EstadoTabla
              cargando={isLoading}
              vacio={asignaciones.length === 0}
              icono={<UsersIcon />}
              titulo="Sin asignaciones"
              descripcion="Crea los pares evaluador → evaluado, o genéralos desde el organigrama."
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Evaluador</TableHead>
                    <TableHead>Evaluado</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Activa</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {asignaciones.map((asignacion) => (
                    <TableRow key={asignacion.id}>
                      <TableCell className="font-medium">{asignacion.evaluatorName}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>{asignacion.evaluateeName}</span>
                          <span className="text-xs text-muted-foreground">
                            {asignacion.evaluateePosition || 'Sin cargo'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {asignacion.evaluatorRoleLabel}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{asignacion.evaluationTypeLabel}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={VARIANTE[asignacion.status]}>
                          {asignacion.statusLabel}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={asignacion.isActive}
                          aria-label="Asignación activa"
                          onCheckedChange={() => alternar.mutate(asignacion.id)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Reabrir"
                            title="Borra las respuestas y la deja lista para rehacerse"
                            disabled={asignacion.status === 'pendiente'}
                            onClick={() => reabrir.mutate(asignacion.id)}
                          >
                            <RotateCcwIcon />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Eliminar"
                            onClick={() => setPorBorrar(asignacion)}
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
        </TabsContent>

        <TabsContent value="pendientes">
          <Card className="py-0">
            <EstadoTabla
              cargando={!pendientes}
              vacio={(pendientes?.items.length ?? 0) === 0}
              icono={<UsersIcon />}
              titulo="Nadie tiene evaluaciones pendientes"
              descripcion="Todas las asignaciones activas de este ciclo ya fueron enviadas."
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Evaluador</TableHead>
                    <TableHead>Correo</TableHead>
                    <TableHead>Evaluado</TableHead>
                    <TableHead>Respondidas</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(pendientes?.items ?? []).map((fila) => (
                    <TableRow key={fila.id}>
                      <TableCell className="font-medium">{fila.evaluatorName}</TableCell>
                      <TableCell className="text-muted-foreground">{fila.evaluatorEmail}</TableCell>
                      <TableCell>{fila.evaluateeName}</TableCell>
                      <TableCell className="tabular-nums">{fila.answered}</TableCell>
                      <TableCell>
                        <Badge variant={VARIANTE[fila.status]}>{fila.statusLabel}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </EstadoTabla>
          </Card>
        </TabsContent>
      </Tabs>

      <AsignacionDialog
        abierto={dialogoAsignacion}
        onOpenChange={setDialogoAsignacion}
        cicloId={cicloId}
        tipoCiclo={ciclo.evaluationType}
      />
      <JerarquiaDialog
        abierto={dialogoJerarquia}
        onOpenChange={setDialogoJerarquia}
        cicloId={cicloId}
      />

      <ConfirmarBorrado
        abierto={!!porBorrar}
        onOpenChange={(v) => !v && setPorBorrar(null)}
        titulo="¿Eliminar la asignación?"
        descripcion={`Se borrarán las respuestas de ${porBorrar?.evaluatorName} sobre ${porBorrar?.evaluateeName} y se recalculará el consolidado.`}
        onConfirmar={() => {
          if (porBorrar) eliminar.mutate(porBorrar.id);
          setPorBorrar(null);
        }}
      />
    </div>
  );
}

function AsignacionDialog({
  abierto,
  onOpenChange,
  cicloId,
  tipoCiclo,
}: {
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
  cicloId: number;
  tipoCiclo: string;
}) {
  const { data: opciones } = useOpciones();
  const [datos, setDatos] = useState({
    evaluator: '',
    evaluatee: '',
    evaluatorRole: 'jefe',
    evaluationType: tipoCiclo === 'mixta' ? 'operativo' : tipoCiclo,
  });

  const crear = useValoracionMutation(
    () =>
      valoracionApi.asignaciones.create({
        cycle: cicloId,
        evaluator: Number(datos.evaluator),
        evaluatee: Number(datos.evaluatee),
        evaluatorRole: datos.evaluatorRole as Asignacion['evaluatorRole'],
        evaluationType: datos.evaluationType as Asignacion['evaluationType'],
      }),
    'Asignación creada',
  );

  const personas = (opciones?.people ?? []).map((p) => ({
    value: String(p.id),
    label: `${p.fullName}${p.position ? ` · ${p.position}` : ''}`,
  }));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    crear.mutate(undefined, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva asignación</DialogTitle>
          <DialogDescription>
            Un par evaluador → evaluado. Nadie se evalúa a sí mismo salvo con rol Autoevaluación.
          </DialogDescription>
        </DialogHeader>

        <form id="asignacion-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <SelectorCampo
            id="asig-evaluador"
            label="Evaluador"
            value={datos.evaluator}
            onChange={(v) => setDatos({ ...datos, evaluator: v })}
            opciones={personas}
            placeholder="Elige quién califica"
          />
          <SelectorCampo
            id="asig-evaluado"
            label="Evaluado"
            value={datos.evaluatee}
            onChange={(v) => setDatos({ ...datos, evaluatee: v })}
            opciones={personas}
            placeholder="Elige a quién califican"
          />
          <SelectorCampo
            id="asig-rol"
            label="Rol del evaluador"
            value={datos.evaluatorRole}
            onChange={(v) => setDatos({ ...datos, evaluatorRole: v })}
            opciones={opciones?.evaluatorRoles ?? []}
            placeholder="Rol"
          />
          <SelectorCampo
            id="asig-tipo"
            label="Tipo de evaluación"
            value={datos.evaluationType}
            onChange={(v) => setDatos({ ...datos, evaluationType: v })}
            opciones={opciones?.evaluationTypes ?? []}
            placeholder="Tipo"
          />
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="asignacion-form"
            disabled={crear.isPending || !datos.evaluator || !datos.evaluatee}
          >
            {crear.isPending && <Spinner data-icon="inline-start" />}
            Crear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function JerarquiaDialog({
  abierto,
  onOpenChange,
  cicloId,
}: {
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
  cicloId: number;
}) {
  const { data: opciones } = useOpciones();
  const [areas, setAreas] = useState<number[]>([]);
  const [autoevaluacion, setAutoevaluacion] = useState(false);

  const generar = useValoracionMutation(
    () =>
      valoracionApi.ciclos.generarAsignaciones(cicloId, { areas, selfEvaluation: autoevaluacion }),
    (data) => data.message,
  );

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generar asignaciones desde el organigrama</DialogTitle>
          <DialogDescription>
            Se leen los jefes directos: en un ciclo de liderazgo cada persona evalúa a su jefe; en
            uno operativo cada jefe evalúa a su gente; en uno mixto, ambas. No duplica lo que ya
            exista.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Field>
            <FieldLabel>Áreas (si no eliges ninguna, se toman todas)</FieldLabel>
            <div className="grid max-h-64 gap-2 overflow-y-auto rounded-lg border border-border p-3 sm:grid-cols-2">
              {(opciones?.areas ?? []).map((area) => (
                <label key={area.value} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={areas.includes(area.value)}
                    onCheckedChange={(marcado) =>
                      setAreas((actual) =>
                        marcado ? [...actual, area.value] : actual.filter((a) => a !== area.value),
                      )
                    }
                  />
                  {area.label}
                </label>
              ))}
            </div>
          </Field>

          <Field orientation="horizontal">
            <Switch id="jer-auto" checked={autoevaluacion} onCheckedChange={setAutoevaluacion} />
            <FieldLabel htmlFor="jer-auto">Incluir autoevaluación</FieldLabel>
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={generar.isPending}
            onClick={() => generar.mutate(undefined, { onSuccess: () => onOpenChange(false) })}
          >
            {generar.isPending && <Spinner data-icon="inline-start" />}
            Generar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SelectorCampo({
  id,
  label,
  value,
  onChange,
  opciones,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  opciones: Array<{ value: string | number; label: string }>;
  placeholder: string;
}) {
  const items = opciones.map((o) => ({ value: String(o.value), label: o.label }));
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select items={items} value={value} onValueChange={(v) => onChange((v as string) ?? '')}>
        <SelectTrigger id={id}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map((opcion) => (
              <SelectItem key={opcion.value} value={opcion.value}>
                {opcion.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}
