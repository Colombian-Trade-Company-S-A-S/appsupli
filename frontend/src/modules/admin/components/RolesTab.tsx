import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { KeyRoundIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  Checkbox,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@/shared/components/ui';
import { adminApi, type AdminPermission, type AdminRole } from '../api';
import { useAdminMutation, usePermissions, useRoles } from '../hooks';
import { ConfirmarBorrado } from '@/shared/components/feedback';

export function RolesTab() {
  const { data: roles = [], isLoading } = useRoles();
  const [editando, setEditando] = useState<AdminRole | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [porBorrar, setPorBorrar] = useState<AdminRole | null>(null);

  const eliminar = useAdminMutation((id: number) => adminApi.roles.remove(id), 'Rol eliminado');

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
          Nuevo rol
        </Button>
      </div>

      <Card className="py-0">
        {isLoading ? (
          <div className="flex flex-col gap-3 p-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : roles.length === 0 ? (
          <Empty className="py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <KeyRoundIcon />
              </EmptyMedia>
              <EmptyTitle>Sin roles</EmptyTitle>
              <EmptyDescription>
                Un rol agrupa permisos para no asignarlos uno por uno.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rol</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Permisos</TableHead>
                  <TableHead>Personas</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((rol) => (
                  <TableRow key={rol.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{rol.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{rol.code}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {rol.description || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{rol.permissions.length}</Badge>
                    </TableCell>
                    <TableCell>{rol.userCount}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Editar"
                          onClick={() => {
                            setEditando(rol);
                            setAbierto(true);
                          }}
                        >
                          <PencilIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Eliminar"
                          onClick={() => setPorBorrar(rol)}
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

      <RolDialog abierto={abierto} onOpenChange={setAbierto} rol={editando} />

      <ConfirmarBorrado
        abierto={!!porBorrar}
        onOpenChange={(v) => !v && setPorBorrar(null)}
        titulo="¿Eliminar rol?"
        descripcion={`Las ${porBorrar?.userCount ?? 0} personas con este rol perderán los permisos que les daba.`}
        onConfirmar={() => {
          if (porBorrar) eliminar.mutate(porBorrar.id);
          setPorBorrar(null);
        }}
      />
    </div>
  );
}

function RolDialog({
  abierto,
  onOpenChange,
  rol,
}: {
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
  rol: AdminRole | null;
}) {
  const editando = !!rol;
  const { data: permisos = [] } = usePermissions();
  const [datos, setDatos] = useState({
    code: '',
    name: '',
    description: '',
    permissions: [] as number[],
  });

  const guardar = useAdminMutation(
    (payload: Partial<AdminRole>) =>
      editando ? adminApi.roles.update(rol.id, payload) : adminApi.roles.create(payload),
    editando ? 'Rol actualizado' : 'Rol creado',
  );

  // Los permisos se muestran agrupados por la aplicación a la que pertenecen.
  const porAplicacion = useMemo(() => {
    const grupos = new Map<string, AdminPermission[]>();
    for (const permiso of permisos) {
      const lista = grupos.get(permiso.applicationName) ?? [];
      lista.push(permiso);
      grupos.set(permiso.applicationName, lista);
    }
    return [...grupos.entries()];
  }, [permisos]);

  useEffect(() => {
    if (!abierto) return;
    setDatos(
      rol
        ? {
            code: rol.code,
            name: rol.name,
            description: rol.description,
            permissions: rol.permissions,
          }
        : { code: '', name: '', description: '', permissions: [] },
    );
  }, [abierto, rol]);

  const alternar = (id: number) =>
    setDatos((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(id)
        ? prev.permissions.filter((x) => x !== id)
        : [...prev.permissions, id],
    }));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    guardar.mutate(datos, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editando ? 'Editar rol' : 'Nuevo rol'}</DialogTitle>
          <DialogDescription>Elige qué acciones habilita este rol.</DialogDescription>
        </DialogHeader>

        <form id="rol-form" onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="rol-name">Nombre</FieldLabel>
                <Input
                  id="rol-name"
                  value={datos.name}
                  onChange={(e) => setDatos({ ...datos, name: e.target.value })}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="rol-code">Código</FieldLabel>
                <Input
                  id="rol-code"
                  value={datos.code}
                  onChange={(e) => setDatos({ ...datos, code: e.target.value })}
                  placeholder="jefe-ventas"
                  required
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="rol-desc">Descripción</FieldLabel>
              <Textarea
                id="rol-desc"
                rows={2}
                value={datos.description}
                onChange={(e) => setDatos({ ...datos, description: e.target.value })}
              />
            </Field>

            <div className="flex flex-col gap-4">
              <h3 className="text-sm font-medium">Permisos</h3>
              {porAplicacion.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Crea primero una aplicación con permisos.
                </p>
              ) : (
                porAplicacion.map(([aplicacion, lista]) => (
                  <div key={aplicacion} className="flex flex-col gap-2">
                    <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {aplicacion}
                    </h4>
                    {lista.map((permiso) => (
                      <label
                        key={permiso.id}
                        className="flex cursor-pointer items-start gap-2 rounded-md border p-2.5"
                      >
                        <Checkbox
                          checked={datos.permissions.includes(permiso.id)}
                          onCheckedChange={() => alternar(permiso.id)}
                        />
                        <span className="flex flex-col">
                          <span className="text-sm">{permiso.name}</span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {permiso.code}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                ))
              )}
            </div>
          </FieldGroup>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="rol-form" disabled={guardar.isPending}>
            {guardar.isPending && <Spinner data-icon="inline-start" />}
            {editando ? 'Guardar' : 'Crear'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
