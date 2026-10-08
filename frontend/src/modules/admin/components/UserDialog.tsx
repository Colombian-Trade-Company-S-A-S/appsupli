import { useEffect, useState, type FormEvent } from 'react';
import { adminApi, type AdminUser, type AdminUserPayload } from '../api';
import { useAdminMutation, useApplications, useRoles } from '../hooks';
import { AYUDA_APPS, AYUDA_ROLES, ayudaDe, type Ayuda } from '../ayudas';
import { AyudaAcceso } from './AyudaAcceso';
import { formatoFechaHora } from '@/shared/lib/formato';
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
  Separator,
  Spinner,
  Switch,
} from '@/shared/components/ui';

const VACIO: AdminUserPayload = {
  email: '',
  username: '',
  firstName: '',
  lastName: '',
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
  /** Solo se edita: las personas se crean con la sincronización de Odoo. */
  usuario: AdminUser | null;
}

export function UserDialog({ abierto, onOpenChange, usuario }: UserDialogProps) {
  // Nombre y correo de quien viene de Odoo se cambian allá, no aquí.
  const deOdoo = !!usuario?.odooId;
  const [datos, setDatos] = useState<AdminUserPayload>(VACIO);

  const { data: apps = [] } = useApplications();
  const { data: roles = [] } = useRoles();

  const guardar = useAdminMutation(
    (payload: AdminUserPayload) => adminApi.users.update(usuario!.id, payload),
    'Usuario actualizado',
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
        [campo]: actuales.includes(id) ? actuales.filter((x) => x !== id) : [...actuales, id],
      };
    });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!usuario) return;
    const payload = { ...datos };
    if (!payload.password) delete payload.password;
    guardar.mutate(payload, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar usuario</DialogTitle>
          <DialogDescription>
            Define a qué aplicaciones entra. Su información de la organización viene de Odoo.
          </DialogDescription>
        </DialogHeader>

        {usuario && <DatosOdoo usuario={usuario} />}

        <form onSubmit={onSubmit} id="user-form" noValidate>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="firstName">Nombres</FieldLabel>
                <Input
                  id="firstName"
                  disabled={deOdoo}
                  value={datos.firstName ?? ''}
                  onChange={(e) => set('firstName', e.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="lastName">Apellidos</FieldLabel>
                <Input
                  id="lastName"
                  disabled={deOdoo}
                  value={datos.lastName ?? ''}
                  onChange={(e) => set('lastName', e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="email">Correo corporativo</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  disabled={deOdoo}
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
                id="isAdmin"
                checked={datos.kind === 'admin'}
                onCheckedChange={(v) =>
                  // Al quitarle el admin, el backend decide si es líder o
                  // colaborador según tenga personas a cargo en Odoo.
                  set('kind', v ? 'admin' : 'colaborador')
                }
              />
              <FieldLabel htmlFor="isAdmin">
                Administrador de la plataforma (acceso total)
              </FieldLabel>
            </Field>

            <Field orientation="horizontal">
              <Switch
                id="isActive"
                checked={datos.isActive ?? true}
                onCheckedChange={(v) => set('isActive', v)}
              />
              <FieldLabel htmlFor="isActive">Cuenta activa</FieldLabel>
            </Field>

            <Field>
              <FieldLabel htmlFor="password">Nueva contraseña (opcional)</FieldLabel>
              <PasswordInput
                id="password"
                autoComplete="new-password"
                value={datos.password ?? ''}
                onChange={(e) => set('password', e.target.value)}
              />
              <FieldDescription>Déjala vacía para no cambiarla.</FieldDescription>
            </Field>

            <Separator />

            <Casillas
              titulo="Aplicaciones"
              descripcion="A qué áreas de la plataforma puede entrar."
              opciones={apps.map((a) => ({
                id: a.id,
                label: a.name,
                ayuda: ayudaDe(AYUDA_APPS, a.code, a.description),
              }))}
              seleccionadas={datos.applications ?? []}
              onToggle={(id) => alternar('applications', id)}
            />

            <Casillas
              titulo="Roles"
              descripcion="Paquetes de permisos que se suman a los accesos directos."
              opciones={roles.map((r) => ({
                id: r.id,
                label: r.name,
                ayuda: ayudaDe(AYUDA_ROLES, r.code, r.description),
              }))}
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
            Guardar cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Lo que manda Odoo de esta persona. Aquí solo se muestra. */
function DatosOdoo({ usuario }: { usuario: AdminUser }) {
  if (!usuario.odooId) {
    return (
      <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
        Esta cuenta no viene de Odoo: no tiene área, cargo ni jefe asignados.
      </p>
    );
  }
  const filas: [string, string][] = [
    ['Cargo', usuario.position],
    ['Área', usuario.areaName],
    ['Dirección', usuario.direccion],
    ['Jefe directo', usuario.managerName],
    [
      'Tipo',
      usuario.kind === 'lider' ? 'Líder' : usuario.kind === 'admin' ? 'Admin' : 'Colaborador',
    ],
    ['Regional', usuario.regional],
    ['Cédula', usuario.cedula],
    ['Departamento en Odoo', usuario.departamentoNombre],
  ];
  return (
    <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
      <h3 className="text-sm font-medium">Datos de Odoo</h3>
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {filas.map(([titulo, valor]) => (
          <div key={titulo} className="flex gap-2">
            <dt className="shrink-0 text-muted-foreground">{titulo}:</dt>
            <dd className="font-medium">{valor || '—'}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">
        Se cambian en Odoo y llegan con la siguiente sincronización
        {usuario.sincronizadoOdooAt
          ? ` (última: ${formatoFechaHora(usuario.sincronizadoOdooAt)})`
          : ''}
        .
      </p>
    </div>
  );
}

interface CasillasProps {
  titulo: string;
  descripcion: string;
  opciones: Array<{ id: number; label: string; ayuda?: Ayuda }>;
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
            <div key={opcion.id} className="flex items-center rounded-md border pr-1.5 text-sm">
              <label className="flex flex-1 cursor-pointer items-center gap-2 p-2.5">
                <Checkbox
                  checked={seleccionadas.includes(opcion.id)}
                  onCheckedChange={() => onToggle(opcion.id)}
                />
                {opcion.label}
              </label>
              {opcion.ayuda && <AyudaAcceso titulo={opcion.label} ayuda={opcion.ayuda} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
