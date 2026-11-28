import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftIcon, CheckCircle2Icon, RefreshCwIcon, SaveIcon, XIcon } from 'lucide-react';
import { urlFotoDe } from '@/core/auth';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  PasswordInput,
  Spinner,
  Switch,
} from '@/shared/components/ui';
import { EsqueletoPagina } from '@/shared/components/feedback';
import { formatoFechaHora } from '@/shared/lib/formato';
import { cn } from '@/shared/lib/utils';
import { adminApi, type AdminUser, type AdminUserPayload } from '../api';
import { AccesosPorApp } from '../components/AccesosPorApp';
import { useAdminMutation, useAdminUser, useApplications, useRoles } from '../hooks';
import { usePermisosAdmin } from '../permisos';
import { planIdDeUrl } from '../planner';

const BASE = '/inicio/admin';
const TIPOS = { admin: 'Administrador', lider: 'Líder', colaborador: 'Colaborador' } as const;

/** Lo que el formulario arranca mostrando: los datos actuales de la persona. */
const datosDe = (usuario: AdminUser): AdminUserPayload => ({
  email: usuario.email,
  username: usuario.username,
  firstName: usuario.firstName,
  lastName: usuario.lastName,
  kind: usuario.kind,
  phone: usuario.phone,
  isActive: usuario.isActive,
  medirPlanner: usuario.medirPlanner,
  plannerUrl: usuario.plannerUrl,
  applications: usuario.applications,
  roles: usuario.roles,
  extraPermissions: usuario.extraPermissions,
  password: '',
});

/**
 * Editar un usuario, en su propia página (antes era una ventana).
 *
 * Las personas se crean con la sincronización de Odoo: aquí solo se edita.
 * Nombre, cargo, área y jefe de quien viene de Odoo se cambian allá; aquí se
 * deciden sus accesos, su estado y si se mide en Planner. Al guardar o
 * cancelar se vuelve a donde se venía (la lista o el detalle).
 */
export default function UsuarioEditarPage() {
  const { id } = useParams();
  const idUsuario = Number(id);
  const navigate = useNavigate();
  // Quien edita usuarios sin ser administrador cambia la cuenta, no el poder:
  // ni el interruptor de administrador ni los accesos.
  const { esAdmin: yoSoyAdmin } = usePermisosAdmin();
  const { data: usuario, isLoading, isError } = useAdminUser(idUsuario);
  const { data: apps = [] } = useApplications();
  const { data: roles = [] } = useRoles();
  const [datos, setDatos] = useState<AdminUserPayload | null>(null);
  const cargado = useRef<number | null>(null);

  // Se llena una sola vez: si la consulta se refresca, no borra lo que se editó.
  useEffect(() => {
    if (usuario && cargado.current !== usuario.id) {
      cargado.current = usuario.id;
      setDatos(datosDe(usuario));
    }
  }, [usuario]);

  const guardar = useAdminMutation(
    (payload: AdminUserPayload) => adminApi.users.update(idUsuario, payload),
    'Usuario actualizado',
  );

  const detalle = `${BASE}/usuarios/${idUsuario}`;
  // A donde se venía; si se abrió la página directo, al detalle del usuario.
  const volver = () => {
    const historia = window.history.state as { idx?: number } | null;
    if ((historia?.idx ?? 0) > 0) navigate(-1);
    else navigate(detalle, { replace: true });
  };

  if (isLoading || (usuario && !datos)) {
    return <EsqueletoPagina label="Abriendo el usuario…" />;
  }
  if (isError || !usuario || !datos) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <Button variant="ghost" size="sm" className="self-start" render={<Link to={BASE} />}>
          <ArrowLeftIcon data-icon="inline-start" />
          Volver a usuarios
        </Button>
        <p className="text-sm text-muted-foreground">No se encontró este usuario.</p>
      </div>
    );
  }

  if (usuario.isAdmin && !yoSoyAdmin) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <Button variant="ghost" size="sm" className="self-start" render={<Link to={detalle} />}>
          <ArrowLeftIcon data-icon="inline-start" />
          Volver al detalle
        </Button>
        <p className="text-sm text-muted-foreground">
          {usuario.fullName} es administrador: su cuenta solo la edita otro administrador.
        </p>
      </div>
    );
  }

  const deOdoo = !!usuario.odooId;
  // Sin correo corporativo en Odoo, aquí se le pone el personal.
  const correoPersonal = deOdoo && usuario.correoEditable;
  // Ejecución Planner solo mide a quien tiene correo corporativo.
  const correoSupli = (usuario.email ?? '').toLowerCase().endsWith('@supli.tech');

  const set = <K extends keyof AdminUserPayload>(campo: K, valor: AdminUserPayload[K]) =>
    setDatos((prev) => (prev ? { ...prev, [campo]: valor } : prev));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const payload = { ...datos };
    if (!payload.password) delete payload.password;
    if (!yoSoyAdmin) {
      // No los cambia: no se mandan (el backend igual rechaza un cambio).
      delete payload.password;
      delete payload.kind;
      delete payload.applications;
      delete payload.roles;
      delete payload.extraPermissions;
    }
    guardar.mutate(payload, { onSuccess: volver });
  };

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="mx-auto flex w-full max-w-5xl animate-entrada-pagina flex-col gap-6"
    >
      <Button variant="ghost" size="sm" className="self-start" render={<Link to={detalle} />}>
        <ArrowLeftIcon data-icon="inline-start" />
        Volver al detalle
      </Button>

      {/* A quién se está editando. */}
      <Card>
        <CardContent className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          <Avatar className="size-16">
            <AvatarImage src={urlFotoDe(usuario)} alt={`Foto de ${usuario.fullName}`} />
            <AvatarFallback className="text-xl">
              {(usuario.firstName || usuario.fullName).charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h1 className="font-heading text-xl font-semibold tracking-tight">
              Editar a {usuario.fullName}
            </h1>
            <p className="truncate text-sm text-muted-foreground">
              {[usuario.position, usuario.areaName, usuario.email].filter(Boolean).join(' · ')}
            </p>
          </div>
          <Badge variant="outline">{deOdoo ? 'Viene de Odoo' : 'Fuera de Odoo'}</Badge>
        </CardContent>
      </Card>

      <Seccion
        titulo="Cuenta"
        descripcion={
          deOdoo
            ? 'Nombre y correo vienen de Odoo y se cambian allá.'
            : 'Esta cuenta no viene de Odoo: todo se edita aquí.'
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
            <FieldLabel htmlFor="username">Usuario</FieldLabel>
            <Input
              id="username"
              value={datos.username ?? ''}
              onChange={(e) => set('username', e.target.value)}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="email">
              {correoPersonal ? 'Correo personal' : 'Correo corporativo'}
            </FieldLabel>
            <Input
              id="email"
              type="email"
              disabled={deOdoo && !correoPersonal}
              value={datos.email ?? ''}
              onChange={(e) => set('email', e.target.value)}
              required
            />
            {correoPersonal && (
              <FieldDescription>
                Sin correo corporativo: con este y una contraseña entra.
              </FieldDescription>
            )}
          </Field>
          <Field>
            <FieldLabel htmlFor="phone">Teléfono</FieldLabel>
            <Input
              id="phone"
              value={datos.phone ?? ''}
              onChange={(e) => set('phone', e.target.value)}
            />
          </Field>
          {/* Con la clave de otro se entra como él: la cambia solo un administrador. */}
          {yoSoyAdmin && (
            <Field>
              <FieldLabel htmlFor="password">Nueva contraseña</FieldLabel>
              <PasswordInput
                id="password"
                autoComplete="new-password"
                placeholder="Vacía para no cambiarla"
                value={datos.password ?? ''}
                onChange={(e) => set('password', e.target.value)}
              />
            </Field>
          )}
        </div>
      </Seccion>

      <DatosOdoo usuario={usuario} />

      <Seccion titulo="Estado y medición" descripcion="Qué puede hacer y si se mide en Planner.">
        <div className="grid gap-3 sm:grid-cols-3">
          <Interruptor
            id="isAdmin"
            titulo="Administrador"
            descripcion={
              yoSoyAdmin
                ? 'Acceso total a la plataforma.'
                : 'Solo un administrador vuelve administrador a alguien.'
            }
            activo={datos.kind === 'admin'}
            deshabilitado={!yoSoyAdmin}
            // Al quitarle el admin, el backend decide si es líder o colaborador
            // según tenga personas a cargo en Odoo.
            onCambio={(v) => set('kind', v ? 'admin' : 'colaborador')}
          />
          <Interruptor
            id="isActive"
            titulo="Cuenta activa"
            descripcion="Apagada, no puede entrar."
            activo={datos.isActive ?? true}
            onCambio={(v) => set('isActive', v)}
          />
          <Interruptor
            id="medirPlanner"
            titulo="Se mide en Planner"
            descripcion={
              correoSupli
                ? 'Su plan entra en la medición semanal.'
                : 'Solo para correos @supli.tech.'
            }
            activo={datos.medirPlanner ?? false}
            deshabilitado={!correoSupli}
            onCambio={(v) => set('medirPlanner', v)}
          />
        </div>
        {correoSupli && (
          <CampoUrlPlanner
            original={usuario.plannerUrl}
            valor={datos.plannerUrl ?? ''}
            onCambio={(valor) => set('plannerUrl', valor)}
          />
        )}
      </Seccion>

      <Seccion
        titulo="Aplicaciones y permisos"
        descripcion={
          yoSoyAdmin
            ? 'Marca la app a la que entra y, dentro de ella, qué puede hacer: un rol (un paquete de permisos ya armado) o permisos sueltos. Si desmarcas un permiso que da un rol, el rol se quita y lo demás que daba queda como permisos sueltos.'
            : 'A qué entra y qué puede hacer. Solo un administrador da o quita accesos.'
        }
        total={datos.applications?.length ?? 0}
      >
        <AccesosPorApp
          apps={apps}
          roles={roles}
          esAdmin={datos.kind === 'admin'}
          soloLectura={!yoSoyAdmin}
          accesos={{
            applications: datos.applications ?? [],
            roles: datos.roles ?? [],
            extraPermissions: datos.extraPermissions ?? [],
          }}
          onCambio={(accesos) =>
            setDatos((prev) =>
              prev
                ? {
                    ...prev,
                    applications: accesos.applications,
                    // Desmarcar un permiso que daba un rol quita ese rol.
                    roles: accesos.roles,
                    extraPermissions: accesos.extraPermissions,
                  }
                : prev,
            )
          }
        />
      </Seccion>

      {/* Los botones quedan a la vista mientras se baja por la página. */}
      <div className="sticky bottom-0 z-10 -mx-1 flex justify-end gap-2 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <Button type="button" variant="outline" onClick={volver} disabled={guardar.isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={guardar.isPending}>
          {guardar.isPending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <SaveIcon data-icon="inline-start" />
          )}
          Guardar cambios
        </Button>
      </div>
    </form>
  );
}

function Seccion({
  titulo,
  descripcion,
  total,
  children,
}: {
  titulo: string;
  descripcion: string;
  total?: number;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {titulo}
          {total !== undefined && <Badge variant="secondary">{total}</Badge>}
        </CardTitle>
        <CardDescription>{descripcion}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/**
 * La URL de Planner. Si ya tiene una, se muestra como cargada con
 * «Reemplazar» y «Quitar»; el campo solo aparece al reemplazarla (o si no
 * tiene). Antes de guardar avisa si el enlace no parece de un plan.
 */
function CampoUrlPlanner({
  original,
  valor,
  onCambio,
}: {
  original: string;
  valor: string;
  onCambio: (valor: string) => void;
}) {
  const [editando, setEditando] = useState(!original);
  const entrada = useRef<HTMLInputElement>(null);
  const planId = planIdDeUrl(valor);

  useEffect(() => {
    if (editando && original) entrada.current?.focus();
  }, [editando, original]);

  // Cargada y sin tocar: la URL actual, con sus acciones.
  if (!editando && valor) {
    return (
      <div className="mt-4 flex flex-col gap-2">
        <span className="text-sm font-medium">URL de Planner</span>
        <div className="flex flex-col gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 sm:flex-row sm:items-center">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
            <CheckCircle2Icon className="size-4" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-medium">
              {valor === original ? 'URL cargada' : 'URL nueva, sin guardar'}
            </span>
            <a
              href={valor}
              target="_blank"
              rel="noreferrer"
              className="truncate text-xs text-primary hover:underline"
              title={valor}
            >
              {valor}
            </a>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onCambio('');
                setEditando(true);
              }}
            >
              <RefreshCwIcon data-icon="inline-start" />
              Reemplazar
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => onCambio('')}>
              <XIcon data-icon="inline-start" />
              Quitar
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Sin URL: si la quitaron, se puede deshacer; si no, el campo para pegarla.
  if (!editando && !valor) {
    return (
      <div className="mt-4 flex flex-col gap-3 rounded-lg border border-dashed p-3 sm:flex-row sm:items-center">
        <p className="flex-1 text-sm text-muted-foreground">
          Se quitará la URL al guardar: queda sin plan que medir.
        </p>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setEditando(true)}>
            Pegar otra
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => onCambio(original)}>
            Deshacer
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Field className="mt-4" data-invalid={(!!valor && !planId) || undefined}>
      <FieldLabel htmlFor="plannerUrl">
        {original ? 'Nueva URL de Planner' : 'URL de Planner'}
      </FieldLabel>
      <div className="flex gap-2">
        <Input
          ref={entrada}
          id="plannerUrl"
          type="url"
          inputMode="url"
          placeholder="https://planner.cloud.microsoft/…/plan/…"
          value={valor}
          onChange={(e) => onCambio(e.target.value)}
          aria-invalid={(!!valor && !planId) || undefined}
        />
        {original && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              onCambio(original);
              setEditando(false);
            }}
          >
            Cancelar
          </Button>
        )}
      </div>
      <FieldDescription>
        {valor && !planId
          ? 'No parece el enlace de un plan. Abre el plan en Planner y copia la dirección del navegador.'
          : 'Abre su plan en Planner y pega la dirección del navegador. Es el plan que se mide; sin enlace, queda sin plan.'}
      </FieldDescription>
    </Field>
  );
}

/** Un interruptor en su propia celda, todas del mismo tamaño. */
function Interruptor({
  id,
  titulo,
  descripcion,
  activo,
  deshabilitado = false,
  onCambio,
}: {
  id: string;
  titulo: string;
  descripcion: string;
  activo: boolean;
  deshabilitado?: boolean;
  onCambio: (valor: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex items-start justify-between gap-3 rounded-lg border p-3 transition-colors',
        activo && !deshabilitado && 'border-primary/40 bg-primary/5',
        deshabilitado ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
      )}
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium">{titulo}</span>
        <span className="text-xs text-muted-foreground">{descripcion}</span>
      </span>
      <Switch id={id} checked={activo} disabled={deshabilitado} onCheckedChange={onCambio} />
    </label>
  );
}

/** Lo que manda Odoo de esta persona. Aquí solo se muestra. */
function DatosOdoo({ usuario }: { usuario: AdminUser }) {
  if (!usuario.odooId) return null;
  const filas: [string, string][] = [
    ['Cargo', usuario.position],
    ['Área', usuario.areaName],
    ['Dirección', usuario.direccion],
    ['Jefe directo', usuario.managerName],
    ['Tipo', TIPOS[usuario.kind]],
    ['Regional', usuario.regional],
    ['Cédula', usuario.cedula],
    ['Departamento en Odoo', usuario.departamentoNombre],
  ];
  return (
    <Seccion
      titulo="Datos de Odoo"
      descripcion={`Se cambian en Odoo y llegan con la siguiente sincronización${
        usuario.sincronizadoOdooAt
          ? ` (última: ${formatoFechaHora(usuario.sincronizadoOdooAt)})`
          : ''
      }.`}
    >
      {/* Celdas iguales separadas por líneas finas: 4 × 2 en escritorio. */}
      <dl className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {filas.map(([titulo, valor]) => (
          <div key={titulo} className="flex min-w-0 flex-col gap-0.5 bg-card p-3">
            <dt className="text-xs text-muted-foreground">{titulo}</dt>
            <dd className={cn('truncate text-sm', valor ? 'font-medium' : 'text-muted-foreground')}>
              {valor || 'Sin registrar'}
            </dd>
          </div>
        ))}
      </dl>
    </Seccion>
  );
}
