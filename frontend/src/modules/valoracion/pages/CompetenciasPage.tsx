import { useEffect, useState, type FormEvent } from 'react';
import { LayersIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
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
} from '@/shared/components/ui';
import { ConfirmarBorrado } from '@/shared/components/feedback';
import { valoracionApi, type Competencia } from '../api';
import { useCompetencias, useValoracionMutation } from '../hooks';
import { Encabezado, EstadoTabla } from '../components/Piezas';

/** Las categorías internas que agrupan las preguntas. */
export default function CompetenciasPage() {
  const { data: competencias = [], isLoading } = useCompetencias();
  const [editando, setEditando] = useState<Competencia | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [porBorrar, setPorBorrar] = useState<Competencia | null>(null);

  const eliminar = useValoracionMutation(
    (id: number) => valoracionApi.competencias.remove(id),
    'Competencia eliminada',
  );

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="Competencias"
        descripcion="Agrupan las preguntas para los informes. El evaluador nunca las ve al calificar."
      >
        <Button
          onClick={() => {
            setEditando(null);
            setAbierto(true);
          }}
        >
          <PlusIcon data-icon="inline-start" />
          Nueva competencia
        </Button>
      </Encabezado>

      <Card className="py-0">
        <EstadoTabla
          cargando={isLoading}
          vacio={competencias.length === 0}
          icono={<LayersIcon />}
          titulo="Sin competencias"
          descripcion="Crea las categorías (A. Cultura, B. Ejecución…) antes de cargar el banco de preguntas."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Preguntas</TableHead>
                <TableHead>Orden</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {competencias.map((competencia) => (
                <TableRow key={competencia.id}>
                  <TableCell className="font-medium">{competencia.code}</TableCell>
                  <TableCell>{competencia.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {competencia.description || '—'}
                  </TableCell>
                  <TableCell className="tabular-nums">{competencia.questionCount}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {competencia.order}
                  </TableCell>
                  <TableCell>
                    <Badge variant={competencia.isActive ? 'success' : 'outline'}>
                      {competencia.isActive ? 'Activa' : 'Inactiva'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Editar"
                        onClick={() => {
                          setEditando(competencia);
                          setAbierto(true);
                        }}
                      >
                        <PencilIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Eliminar"
                        onClick={() => setPorBorrar(competencia)}
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

      <CompetenciaDialog abierto={abierto} onOpenChange={setAbierto} competencia={editando} />

      <ConfirmarBorrado
        abierto={!!porBorrar}
        onOpenChange={(v) => !v && setPorBorrar(null)}
        titulo="¿Eliminar la competencia?"
        descripcion={`«${porBorrar?.label}» solo se puede eliminar si no tiene preguntas. Si las tiene, desactívala.`}
        onConfirmar={() => {
          if (porBorrar) eliminar.mutate(porBorrar.id);
          setPorBorrar(null);
        }}
      />
    </div>
  );
}

const VACIO = { code: '', name: '', description: '', order: 0, isActive: true };

function CompetenciaDialog({
  abierto,
  onOpenChange,
  competencia,
}: {
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
  competencia: Competencia | null;
}) {
  const editando = !!competencia;
  const [datos, setDatos] = useState(VACIO);

  const guardar = useValoracionMutation(
    (payload: Partial<Competencia>) =>
      editando
        ? valoracionApi.competencias.update(competencia.id, payload)
        : valoracionApi.competencias.create(payload),
    editando ? 'Competencia actualizada' : 'Competencia creada',
  );

  useEffect(() => {
    if (!abierto) return;
    setDatos(
      competencia
        ? {
            code: competencia.code,
            name: competencia.name,
            description: competencia.description,
            order: competencia.order,
            isActive: competencia.isActive,
          }
        : VACIO,
    );
  }, [abierto, competencia]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    guardar.mutate(datos, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editando ? 'Editar competencia' : 'Nueva competencia'}</DialogTitle>
          <DialogDescription>
            Son internas: sirven para agrupar y reportar, no se muestran al evaluar.
          </DialogDescription>
        </DialogHeader>

        <form id="competencia-form" onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="comp-codigo">Código</FieldLabel>
              <Input
                id="comp-codigo"
                placeholder="A"
                value={datos.code}
                onChange={(e) => setDatos({ ...datos, code: e.target.value })}
                required
              />
              <FieldDescription>Una letra o sigla corta: A, B, C…</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="comp-nombre">Nombre</FieldLabel>
              <Input
                id="comp-nombre"
                placeholder="CULTURA"
                value={datos.name}
                onChange={(e) => setDatos({ ...datos, name: e.target.value })}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="comp-desc">Descripción</FieldLabel>
              <Textarea
                id="comp-desc"
                rows={2}
                value={datos.description}
                onChange={(e) => setDatos({ ...datos, description: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="comp-orden">Orden</FieldLabel>
              <Input
                id="comp-orden"
                type="number"
                min={0}
                value={datos.order}
                onChange={(e) => setDatos({ ...datos, order: Number(e.target.value) })}
              />
            </Field>
            <Field orientation="horizontal">
              <Switch
                id="comp-activa"
                checked={datos.isActive}
                onCheckedChange={(v) => setDatos({ ...datos, isActive: v })}
              />
              <FieldLabel htmlFor="comp-activa">Competencia activa</FieldLabel>
            </Field>
          </FieldGroup>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="competencia-form" disabled={guardar.isPending}>
            {guardar.isPending && <Spinner data-icon="inline-start" />}
            {editando ? 'Guardar' : 'Crear'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
