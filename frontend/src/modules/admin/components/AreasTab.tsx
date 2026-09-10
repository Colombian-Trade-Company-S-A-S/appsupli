import { useEffect, useState, type FormEvent } from 'react';
import { BuildingIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  Skeleton,
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
import { adminApi, type AdminArea } from '../api';
import { useAdminMutation, useAreas } from '../hooks';
import { ConfirmarBorrado } from '@/shared/components/feedback';

export function AreasTab() {
  const { data: areas = [], isLoading } = useAreas();
  const [editando, setEditando] = useState<AdminArea | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [porBorrar, setPorBorrar] = useState<AdminArea | null>(null);

  const eliminar = useAdminMutation((id: number) => adminApi.areas.remove(id), 'Área eliminada');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditando(null);
            setAbierto(true);
          }}
        >
          <PlusIcon data-icon="inline-start" />
          Nueva área
        </Button>
      </div>

      <Card className="py-0">
        {isLoading ? (
          <div className="flex flex-col gap-3 p-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : areas.length === 0 ? (
          <Empty className="py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BuildingIcon />
              </EmptyMedia>
              <EmptyTitle>Sin áreas</EmptyTitle>
              <EmptyDescription>Crea la primera área de la compañía.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Área</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Personas</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {areas.map((area) => (
                  <TableRow key={area.id}>
                    <TableCell className="font-medium">{area.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {area.description || '—'}
                    </TableCell>
                    <TableCell>{area.userCount}</TableCell>
                    <TableCell>
                      <Badge variant={area.isActive ? 'success' : 'outline'}>
                        {area.isActive ? 'Activa' : 'Inactiva'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Editar"
                          onClick={() => {
                            setEditando(area);
                            setAbierto(true);
                          }}
                        >
                          <PencilIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Eliminar"
                          onClick={() => setPorBorrar(area)}
                        >
                          <Trash2Icon />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <AreaDialog abierto={abierto} onOpenChange={setAbierto} area={editando} />

      <ConfirmarBorrado
        abierto={!!porBorrar}
        onOpenChange={(v) => !v && setPorBorrar(null)}
        titulo="¿Eliminar área?"
        descripcion={`Las ${porBorrar?.userCount ?? 0} personas de "${porBorrar?.name}" quedarán sin área asignada.`}
        onConfirmar={() => {
          if (porBorrar) eliminar.mutate(porBorrar.id);
          setPorBorrar(null);
        }}
      />
    </div>
  );
}

function AreaDialog({
  abierto,
  onOpenChange,
  area,
}: {
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
  area: AdminArea | null;
}) {
  const editando = !!area;
  const [datos, setDatos] = useState({ name: '', description: '', isActive: true });

  const guardar = useAdminMutation(
    (payload: Partial<AdminArea>) =>
      editando ? adminApi.areas.update(area.id, payload) : adminApi.areas.create(payload),
    editando ? 'Área actualizada' : 'Área creada',
  );

  useEffect(() => {
    if (!abierto) return;
    setDatos(
      area
        ? { name: area.name, description: area.description, isActive: area.isActive }
        : { name: '', description: '', isActive: true },
    );
  }, [abierto, area]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    guardar.mutate(datos, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editando ? 'Editar área' : 'Nueva área'}</DialogTitle>
          <DialogDescription>
            Las áreas agrupan a las personas de la compañía.
          </DialogDescription>
        </DialogHeader>

        <form id="area-form" onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="area-name">Nombre</FieldLabel>
              <Input
                id="area-name"
                value={datos.name}
                onChange={(e) => setDatos({ ...datos, name: e.target.value })}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="area-desc">Descripción</FieldLabel>
              <Textarea
                id="area-desc"
                rows={3}
                value={datos.description}
                onChange={(e) => setDatos({ ...datos, description: e.target.value })}
              />
            </Field>
            <Field orientation="horizontal">
              <Switch
                id="area-active"
                checked={datos.isActive}
                onCheckedChange={(v) => setDatos({ ...datos, isActive: v })}
              />
              <FieldLabel htmlFor="area-active">Área activa</FieldLabel>
            </Field>
          </FieldGroup>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="area-form" disabled={guardar.isPending}>
            {guardar.isPending && <Spinner data-icon="inline-start" />}
            {editando ? 'Guardar' : 'Crear'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
