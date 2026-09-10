import { useEffect, useState, type FormEvent } from 'react';
import { LayoutGridIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
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
  FieldDescription,
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
import { adminApi, type AdminApplication } from '../api';
import { useAdminMutation, useApplications } from '../hooks';
import { ConfirmarBorrado } from '@/shared/components/feedback';

const NUEVA = {
  code: '',
  name: '',
  description: '',
  basePath: '',
  icon: '',
  order: 100,
  isActive: true,
};

export function ApplicationsTab() {
  const { data: apps = [], isLoading } = useApplications();
  const [editando, setEditando] = useState<AdminApplication | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [porBorrar, setPorBorrar] = useState<AdminApplication | null>(null);

  const eliminar = useAdminMutation(
    (id: number) => adminApi.applications.remove(id),
    'Aplicación eliminada',
  );

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
          Nueva aplicación
        </Button>
      </div>

      <Card className="py-0">
        {isLoading ? (
          <div className="flex flex-col gap-3 p-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : apps.length === 0 ? (
          <Empty className="py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <LayoutGridIcon />
              </EmptyMedia>
              <EmptyTitle>Sin aplicaciones</EmptyTitle>
              <EmptyDescription>
                Cada aplicación es un área de la plataforma que aparece en el menú lateral.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Aplicación</TableHead>
                  <TableHead>Ruta</TableHead>
                  <TableHead>Permisos</TableHead>
                  <TableHead>Personas</TableHead>
                  <TableHead>Orden</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apps.map((app) => (
                  <TableRow key={app.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{app.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{app.code}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{app.basePath}</TableCell>
                    <TableCell>{app.permissions.length}</TableCell>
                    <TableCell>{app.userCount}</TableCell>
                    <TableCell>{app.order}</TableCell>
                    <TableCell>
                      <Badge variant={app.isActive ? 'success' : 'outline'}>
                        {app.isActive ? 'Activa' : 'Inactiva'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Editar"
                          onClick={() => {
                            setEditando(app);
                            setAbierto(true);
                          }}
                        >
                          <PencilIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Eliminar"
                          onClick={() => setPorBorrar(app)}
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

      <AppDialog abierto={abierto} onOpenChange={setAbierto} app={editando} />

      <ConfirmarBorrado
        abierto={!!porBorrar}
        onOpenChange={(v) => !v && setPorBorrar(null)}
        titulo="¿Eliminar aplicación?"
        descripcion={`Se eliminarán también sus ${porBorrar?.permissions.length ?? 0} permisos y dejará de verse en el menú.`}
        onConfirmar={() => {
          if (porBorrar) eliminar.mutate(porBorrar.id);
          setPorBorrar(null);
        }}
      />
    </div>
  );
}

function AppDialog({
  abierto,
  onOpenChange,
  app,
}: {
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
  app: AdminApplication | null;
}) {
  const editando = !!app;
  const [datos, setDatos] = useState(NUEVA);

  const guardar = useAdminMutation(
    (payload: Partial<AdminApplication>) =>
      editando
        ? adminApi.applications.update(app.id, payload)
        : adminApi.applications.create(payload),
    editando ? 'Aplicación actualizada' : 'Aplicación creada',
  );

  useEffect(() => {
    if (!abierto) return;
    setDatos(
      app
        ? {
            code: app.code,
            name: app.name,
            description: app.description,
            basePath: app.basePath,
            icon: app.icon,
            order: app.order,
            isActive: app.isActive,
          }
        : NUEVA,
    );
  }, [abierto, app]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    guardar.mutate(datos, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editando ? 'Editar aplicación' : 'Nueva aplicación'}</DialogTitle>
          <DialogDescription>
            Aparecerá en el menú lateral de quienes tengan acceso.
          </DialogDescription>
        </DialogHeader>

        <form id="app-form" onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="app-name">Nombre</FieldLabel>
                <Input
                  id="app-name"
                  value={datos.name}
                  onChange={(e) => setDatos({ ...datos, name: e.target.value })}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="app-code">Código</FieldLabel>
                <Input
                  id="app-code"
                  value={datos.code}
                  onChange={(e) => setDatos({ ...datos, code: e.target.value })}
                  placeholder="ventas"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="app-path">Ruta base</FieldLabel>
                <Input
                  id="app-path"
                  value={datos.basePath}
                  onChange={(e) => setDatos({ ...datos, basePath: e.target.value })}
                  placeholder="/inicio/ventas"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="app-icon">Ícono</FieldLabel>
                <Input
                  id="app-icon"
                  value={datos.icon}
                  onChange={(e) => setDatos({ ...datos, icon: e.target.value })}
                  placeholder="store"
                />
                <FieldDescription>Nombre en lucide-react.</FieldDescription>
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="app-desc">Descripción</FieldLabel>
              <Textarea
                id="app-desc"
                rows={2}
                value={datos.description}
                onChange={(e) => setDatos({ ...datos, description: e.target.value })}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="app-order">Orden en el menú</FieldLabel>
              <Input
                id="app-order"
                type="number"
                value={datos.order}
                onChange={(e) => setDatos({ ...datos, order: Number(e.target.value) })}
              />
            </Field>

            <Field orientation="horizontal">
              <Switch
                id="app-active"
                checked={datos.isActive}
                onCheckedChange={(v) => setDatos({ ...datos, isActive: v })}
              />
              <FieldLabel htmlFor="app-active">Aplicación activa</FieldLabel>
            </Field>
          </FieldGroup>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="app-form" disabled={guardar.isPending}>
            {guardar.isPending && <Spinner data-icon="inline-start" />}
            {editando ? 'Guardar' : 'Crear'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
