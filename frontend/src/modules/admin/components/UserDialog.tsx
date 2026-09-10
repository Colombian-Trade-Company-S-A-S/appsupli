import { useEffect, useState, type FormEvent } from 'react';
import { adminApi, type AdminUser, type AdminUserPayload, type UserKind } from '../api';
import { useAdminMutation, useApplications, useAreas, useRoles } from '../hooks';
import {
  Button,
  Checkbox,
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
  PasswordInput,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Spinner,
  Switch,
} from '@/shared/components/ui';

const TIPOS: Array<{ value: UserKind; label: string }> = [
  { value: 'colaborador', label: 'Colaborador' },
  { value: 'lider', label: 'Líder' },
  { value: 'admin', label: 'Admin (acceso total)' },
];

const VACIO: AdminUserPayload = {
  email: '',
  username: '',
  firstName: '',
  lastName: '',
  area: null,
  position: '',
  kind: 'colaborador',
  phone: '',
  isActive: true,
  applications: [],
  roles: [],
  password: '',
};

interface UserDialogProps {
  abierto: boolean;
  onOpenChange: (abierto: boolean) => void;
  /** Si viene, se edita; si no, se crea. */
  usuario?: AdminUser | null;
}

export function UserDialog({ abierto, onOpenChange, usuario }: UserDialogProps) {
  const editando = !!usuario;
  const [datos, setDatos] = useState<AdminUserPayload>(VACIO);

  const { data: areas = [] } = useAreas();
  const { data: apps = [] } = useApplications();
  const { data: roles = [] } = useRoles();

  const guardar = useAdminMutation(
    (payload: AdminUserPayload) =>
      editando ? adminApi.users.update(usuario.id, payload) : adminApi.users.create(payload),
    editando ? 'Usuario actualizado' : 'Usuario creado',
  );

  useEffect(() => {
    if (!abierto) return;
    setDatos(
      usuario
        ? {
            email: usuario.email,
            username: usuario.username,
            firstName: usuario.firstName,
            lastName: usuario.lastName,
            area: usuario.area,
            position: usuario.position,
            kind: usuario.kind,
            phone: usuario.phone,
            isActive: usuario.isActive,
            applications: usuario.applications,
            roles: usuario.roles,
          }
        : VACIO,
    );
  }, [abierto, usuario]);

  const set = <K extends keyof AdminUserPayload>(campo: K, valor: AdminUserPayload[K]) =>
    setDatos((prev) => ({ ...prev, [campo]: valor }));

  const alternar = (campo: 'applications' | 'roles', id: number) =>
    setDatos((prev) => {
      const actuales = prev[campo] ?? [];
      return {
        ...prev,
        [campo]: actuales.includes(id)
          ? actuales.filter((x) => x !== id)
          : [...actuales, id],
      };
    });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const payload = { ...datos };
    if (!payload.password) delete payload.password;
    guardar.mutate(payload, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editando ? 'Editar usuario' : 'Nuevo usuario'}</DialogTitle>
          <DialogDescription>
            {editando
              ? 'Actualiza sus datos y define a qué aplicaciones entra.'
              : 'Crea la cuenta y asígnale sus accesos.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} id="user-form" noValidate>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="firstName">Nombres</FieldLabel>
                <Input
                  id="firstName"
                  value={datos.firstName ?? ''}
                  onChange={(e) => set('firstName', e.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="lastName">Apellidos</FieldLabel>
                <Input
                  id="lastName"
                  value={datos.lastName ?? ''}
                  onChange={(e) => set('lastName', e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="email">Correo corporativo</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  value={datos.email ?? ''}
                  onChange={(e) => set('email', e.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="username">Usuario</FieldLabel>
                <Input
                  id="username"
                  value={datos.username ?? ''}
                  onChange={(e) => set('username', e.target.value)}
                  required
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="area">Área</FieldLabel>
                <Select
                  items={areas.map((a) => ({ value: String(a.id), label: a.name }))}
                  value={datos.area ? String(datos.area) : ''}
                  onValueChange={(v) => set('area', v ? Number(v) : null)}
                >
                  <SelectTrigger id="area">
                    <SelectValue placeholder="Sin área" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {areas.map((area) => (
                        <SelectItem key={area.id} value={String(area.id)}>
                          {area.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel htmlFor="position">Cargo</FieldLabel>
                <Input
                  id="position"
                  value={datos.position ?? ''}
                  onChange={(e) => set('position', e.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="kind">Tipo de usuario</FieldLabel>
                <Select
                  items={TIPOS.map((t) => ({ value: t.value, label: t.label }))}
                  value={datos.kind ?? 'colaborador'}
                  onValueChange={(v) => set('kind', v as UserKind)}
                >
                  <SelectTrigger id="kind">
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

              <Field>
                <FieldLabel htmlFor="phone">Teléfono</FieldLabel>
                <Input
                  id="phone"
                  value={datos.phone ?? ''}
                  onChange={(e) => set('phone', e.target.value)}
                />
              </Field>
            </div>

            <Field orientation="horizontal">
              <Switch
                id="isActive"
                checked={datos.isActive ?? true}
                onCheckedChange={(v) => set('isActive', v)}
              />
              <FieldLabel htmlFor="isActive">Cuenta activa</FieldLabel>
            </Field>

            <Field>
              <FieldLabel htmlFor="password">
                {editando ? 'Nueva contraseña (opcional)' : 'Contraseña inicial'}
              </FieldLabel>
              <PasswordInput
                id="password"
                autoComplete="new-password"
                value={datos.password ?? ''}
                onChange={(e) => set('password', e.target.value)}
              />
              <FieldDescription>
                {editando
                  ? 'Déjala vacía para no cambiarla.'
                  : 'Si la dejas vacía se genera una aleatoria.'}
              </FieldDescription>
            </Field>

            <Separator />

            <Casillas
              titulo="Aplicaciones"
              descripcion="A qué áreas de la plataforma puede entrar."
              opciones={apps.map((a) => ({ id: a.id, label: a.name }))}
              seleccionadas={datos.applications ?? []}
              onToggle={(id) => alternar('applications', id)}
            />

            <Casillas
              titulo="Roles"
              descripcion="Paquetes de permisos que se suman a los accesos directos."
              opciones={roles.map((r) => ({ id: r.id, label: r.name }))}
              seleccionadas={datos.roles ?? []}
              onToggle={(id) => alternar('roles', id)}
              vacio="Todavía no hay roles creados."
            />
          </FieldGroup>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="user-form" disabled={guardar.isPending}>
            {guardar.isPending && <Spinner data-icon="inline-start" />}
            {editando ? 'Guardar cambios' : 'Crear usuario'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface CasillasProps {
  titulo: string;
  descripcion: string;
  opciones: Array<{ id: number; label: string }>;
  seleccionadas: number[];
  onToggle: (id: number) => void;
  vacio?: string;
}

function Casillas({
  titulo,
  descripcion,
  opciones,
  seleccionadas,
  onToggle,
  vacio = 'No hay opciones disponibles.',
}: CasillasProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-medium">{titulo}</h3>
        <p className="text-xs text-muted-foreground">{descripcion}</p>
      </div>
      {opciones.length === 0 ? (
        <p className="text-sm text-muted-foreground">{vacio}</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {opciones.map((opcion) => (
            <label
              key={opcion.id}
              className="flex cursor-pointer items-center gap-2 rounded-md border p-2.5 text-sm"
            >
              <Checkbox
                checked={seleccionadas.includes(opcion.id)}
                onCheckedChange={() => onToggle(opcion.id)}
              />
              {opcion.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
