import { useEffect, useState, type FormEvent } from 'react';
import { ListChecksIcon, PencilIcon, PlusIcon, SearchIcon, Trash2Icon } from 'lucide-react';
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
  Switch,
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
import { valoracionApi, type Pregunta } from '../api';
import { useCompetencias, usePreguntas, useValoracionMutation } from '../hooks';
import { CampoSelect } from '../components/Filtros';
import { Encabezado, EstadoTabla } from '../components/Piezas';

const TIPOS_EVALUACION = [
  { value: '', label: 'Ambos tipos' },
  { value: 'lider', label: 'Liderazgo' },
  { value: 'operativo', label: 'Operativo' },
];

/** El banco de preguntas: se crea una vez y se reutiliza en todos los ciclos. */
export default function PreguntasPage() {
  const [tipo, setTipo] = useState('');
  const [buscar, setBuscar] = useState('');
  const { data: preguntas = [], isLoading } = usePreguntas({
    evaluation_type: tipo || undefined,
    search: buscar || undefined,
  });
  const [editando, setEditando] = useState<Pregunta | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [porBorrar, setPorBorrar] = useState<Pregunta | null>(null);

  const eliminar = useValoracionMutation(
    (id: number) => valoracionApi.preguntas.remove(id),
    'Pregunta eliminada',
  );

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="Banco de preguntas"
        descripcion="Los ítems que verá cada evaluador. Se reutilizan ciclo tras ciclo."
      >
        <Button
          onClick={() => {
            setEditando(null);
            setAbierto(true);
          }}
        >
          <PlusIcon data-icon="inline-start" />
          Nueva pregunta
        </Button>
      </Encabezado>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por enunciado…"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
          />
        </div>
        <ToggleGroup
          value={[tipo]}
          onValueChange={(v) => setTipo((v[0] as string) ?? '')}
          variant="outline"
        >
          {TIPOS_EVALUACION.map((opcion) => (
            <ToggleGroupItem key={opcion.value || 'todos'} value={opcion.value}>
              {opcion.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <Card className="py-0">
        <EstadoTabla
          cargando={isLoading}
          vacio={preguntas.length === 0}
          icono={<ListChecksIcon />}
          titulo="Sin preguntas"
          descripcion="Crea el banco de ítems de liderazgo y de operativo para poder evaluar."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-64">Enunciado</TableHead>
                <TableHead className="hidden md:table-cell">Competencia</TableHead>
                <TableHead className="hidden lg:table-cell">Tipo</TableHead>
                <TableHead className="hidden xl:table-cell">Formato</TableHead>
                <TableHead className="hidden xl:table-cell">Peso</TableHead>
                <TableHead className="hidden xl:table-cell">Obligatoria</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preguntas.map((pregunta) => (
                <TableRow key={pregunta.id}>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span>{pregunta.statement}</span>
                      <span className="text-xs text-muted-foreground lg:hidden">
                        <span className="md:hidden">{pregunta.competencyLabel} · </span>
                        {pregunta.evaluationTypeLabel}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {pregunta.competencyLabel}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <Badge variant="secondary">{pregunta.evaluationTypeLabel}</Badge>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground xl:table-cell">
                    {pregunta.questionTypeLabel}
                  </TableCell>
                  <TableCell className="hidden tabular-nums xl:table-cell">
                    {pregunta.weight}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground xl:table-cell">
                    {pregunta.isRequired ? 'Sí' : 'No'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={pregunta.isActive ? 'success' : 'outline'}>
                      {pregunta.isActive ? 'Activa' : 'Inactiva'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Editar"
                        onClick={() => {
                          setEditando(pregunta);
                          setAbierto(true);
                        }}
                      >
                        <PencilIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Eliminar"
                        onClick={() => setPorBorrar(pregunta)}
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
        {preguntas.length} pregunta{preguntas.length === 1 ? '' : 's'} · una pregunta con respuestas
        ya registradas no se borra, se desactiva.
      </p>

      <PreguntaDialog abierto={abierto} onOpenChange={setAbierto} pregunta={editando} />

      <ConfirmarBorrado
        abierto={!!porBorrar}
        onOpenChange={(v) => !v && setPorBorrar(null)}
        titulo="¿Eliminar la pregunta?"
        descripcion="Si ya tiene respuestas no se podrá borrar, porque alteraría resultados ya calculados. En ese caso, desactívala."
        onConfirmar={() => {
          if (porBorrar) eliminar.mutate(porBorrar.id);
          setPorBorrar(null);
        }}
      />
    </div>
  );
}

const VACIO = {
  competency: 0,
  statement: '',
  evaluationType: 'lider' as Pregunta['evaluationType'],
  questionType: 'likert' as Pregunta['questionType'],
  weight: '1.00',
  order: 0,
  isRequired: true,
  isActive: true,
};

function PreguntaDialog({
  abierto,
  onOpenChange,
  pregunta,
}: {
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
  pregunta: Pregunta | null;
}) {
  const editando = !!pregunta;
  const { data: competencias = [] } = useCompetencias();
  const [datos, setDatos] = useState(VACIO);

  const guardar = useValoracionMutation(
    (payload: Partial<Pregunta>) =>
      editando
        ? valoracionApi.preguntas.update(pregunta.id, payload)
        : valoracionApi.preguntas.create(payload),
    editando ? 'Pregunta actualizada' : 'Pregunta creada',
  );

  useEffect(() => {
    if (!abierto) return;
    setDatos(
      pregunta
        ? {
            competency: pregunta.competency,
            statement: pregunta.statement,
            evaluationType: pregunta.evaluationType,
            questionType: pregunta.questionType,
            weight: pregunta.weight,
            order: pregunta.order,
            isRequired: pregunta.isRequired,
            isActive: pregunta.isActive,
          }
        : { ...VACIO, competency: competencias[0]?.id ?? 0 },
    );
  }, [abierto, pregunta, competencias]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    guardar.mutate(datos, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editando ? 'Editar pregunta' : 'Nueva pregunta'}</DialogTitle>
          <DialogDescription>
            El evaluador solo ve el enunciado y las opciones; la competencia queda interna.
          </DialogDescription>
        </DialogHeader>

        <form id="pregunta-form" onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="preg-enunciado">Enunciado</FieldLabel>
              <Textarea
                id="preg-enunciado"
                rows={3}
                placeholder="El líder promueve los valores de la compañía en su equipo."
                value={datos.statement}
                onChange={(e) => setDatos({ ...datos, statement: e.target.value })}
                required
              />
            </Field>

            <CampoSelect
              id="preg-competencia"
              label="Competencia"
              placeholder="Elige la competencia"
              value={datos.competency ? String(datos.competency) : ''}
              onChange={(v) => setDatos({ ...datos, competency: Number(v) })}
              opciones={competencias.map((c) => ({ value: String(c.id), label: c.label }))}
            />

            <CampoSelect
              id="preg-tipo-eval"
              label="Tipo de evaluación"
              placeholder="Liderazgo u operativo"
              value={datos.evaluationType}
              onChange={(v) =>
                setDatos({ ...datos, evaluationType: v as Pregunta['evaluationType'] })
              }
              opciones={[
                { value: 'lider', label: 'Liderazgo' },
                { value: 'operativo', label: 'Operativo/táctico' },
              ]}
            />

            <CampoSelect
              id="preg-formato"
              label="Formato"
              placeholder="Escala o abierta"
              value={datos.questionType}
              onChange={(v) => setDatos({ ...datos, questionType: v as Pregunta['questionType'] })}
              opciones={[
                { value: 'likert', label: 'Escala 1-5' },
                { value: 'abierta', label: 'Pregunta abierta (no califica)' },
              ]}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="preg-peso">Peso</FieldLabel>
                <Input
                  id="preg-peso"
                  type="number"
                  step="0.25"
                  min={0}
                  value={datos.weight}
                  onChange={(e) => setDatos({ ...datos, weight: e.target.value })}
                />
                <FieldDescription>Cuánto pesa frente a las demás. Normal: 1.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="preg-orden">Orden</FieldLabel>
                <Input
                  id="preg-orden"
                  type="number"
                  min={0}
                  value={datos.order}
                  onChange={(e) => setDatos({ ...datos, order: Number(e.target.value) })}
                />
              </Field>
            </div>

            <Field orientation="horizontal">
              <Switch
                id="preg-obligatoria"
                checked={datos.isRequired}
                onCheckedChange={(v) => setDatos({ ...datos, isRequired: v })}
              />
              <FieldLabel htmlFor="preg-obligatoria">Obligatoria para poder enviar</FieldLabel>
            </Field>
            <Field orientation="horizontal">
              <Switch
                id="preg-activa"
                checked={datos.isActive}
                onCheckedChange={(v) => setDatos({ ...datos, isActive: v })}
              />
              <FieldLabel htmlFor="preg-activa">Pregunta activa</FieldLabel>
            </Field>
          </FieldGroup>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="pregunta-form"
            disabled={guardar.isPending || !datos.competency}
          >
            {guardar.isPending && <Spinner data-icon="inline-start" />}
            {editando ? 'Guardar' : 'Crear'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
