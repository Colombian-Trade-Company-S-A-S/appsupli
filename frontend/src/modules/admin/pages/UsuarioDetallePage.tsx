import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AppWindowIcon,
  ArrowLeftIcon,
  AtSignIcon,
  BadgeCheckIcon,
  BriefcaseIcon,
  BuildingIcon,
  ClockIcon,
  CopyIcon,
  FingerprintIcon,
  KeyRoundIcon,
  LayersIcon,
  MailIcon,
  MapPinIcon,
  NetworkIcon,
  PencilIcon,
  PhoneIcon,
  ShieldCheckIcon,
  UserCheckIcon,
  UserIcon,
  UserRoundIcon,
  UserXIcon,
  UsersIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
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
} from '@/shared/components/ui';
import { EsqueletoPagina } from '@/shared/components/feedback';
import { cn } from '@/shared/lib/utils';
import { Cuadricula } from '@/app/layouts/Marca';
import { adminApi, type AdminPermission, type AdminUser } from '../api';
import {
  useAdminMutation,
  useAdminUser,
  useAdminUsers,
  useApplications,
  usePermissions,
  useRoles,
} from '../hooks';
import { UserDialog } from '../components/UserDialog';

const BASE = '/inicio/admin';
const TIPOS = { admin: 'Administrador', lider: 'Líder', colaborador: 'Colaborador' } as const;

const fechaHora = (valor: string | null) =>
  valor
    ? new Date(valor).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
    : 'Nunca';

const fechaCorta = (valor: string | null) =>
  valor ? new Date(valor).toLocaleDateString('es-CO', { dateStyle: 'medium' }) : 'Nunca';

type Persona = Pick<AdminUser, 'foto' | 'fullName' | 'firstName' | 'destacado'>;

/** La foto de alguien, o la inicial de su nombre si no tiene. */
function Foto({
  usuario,
  className,
  claseLetra,
}: {
  usuario: Persona;
  className?: string;
  claseLetra?: string;
}) {
  return (
    <Avatar className={className}>
      <AvatarImage src={urlFotoDe(usuario)} alt={`Foto de ${usuario.fullName}`} />
      <AvatarFallback className={claseLetra}>
        {(usuario.firstName || usuario.fullName).charAt(0).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

/** Una tarjeta del detalle. Todas iguales, para que los pares queden parejos. */
function Seccion({
  icono: Icono,
  titulo,
  descripcion,
  children,
}: {
  icono: LucideIcon;
  titulo: string;
  descripcion?: string;
  children: ReactNode;
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icono className="size-4" />
          </span>
          {titulo}
        </CardTitle>
        {descripcion && <CardDescription>{descripcion}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** Filas de rótulo y valor, con su ícono, alineadas en dos columnas. */
function Datos({ filas }: { filas: Array<[LucideIcon, string, ReactNode]> }) {
  return (
    <dl className="divide-y">
      {filas.map(([Icono, rotulo, valor]) => (
        <div
          key={rotulo}
          className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center gap-4 py-2.5"
        >
          <dt className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icono className="size-3.5 shrink-0" />
            {rotulo}
          </dt>
          <dd className="truncate text-right text-sm font-medium">{valor || '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Una cifra de la franja de la ficha: las cuatro miden lo mismo. */
function Cifra({
  icono: Icono,
  valor,
  rotulo,
}: {
  icono: LucideIcon;
  valor: ReactNode;
  rotulo: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 px-3 py-4 text-center">
      <Icono className="size-4 text-muted-foreground" />
      <span className="font-heading text-lg leading-tight font-semibold tabular-nums">{valor}</span>
      <span className="text-xs text-muted-foreground">{rotulo}</span>
    </div>
  );
}

function Rotulo({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
      {children}
    </span>
  );
}

function Vacio({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

/** Una persona en una lista: foto, nombre y cargo, con enlace a su detalle. */
function FilaPersona({ usuario }: { usuario: AdminUser }) {
  return (
    <Link
      to={`${BASE}/usuarios/${usuario.id}`}
      className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60"
    >
      <Foto usuario={usuario} className={cn('size-9', usuario.destacado && 'hilo-socio')} />
      <span className="grid min-w-0 leading-tight">
        <span className="truncate text-sm font-medium">{usuario.fullName}</span>
        <span className="truncate text-xs text-muted-foreground">{usuario.position || '—'}</span>
      </span>
    </Link>
  );
}

/**
 * El detalle de una persona en Administración: su ficha, su organización, sus
 * accesos y sus permisos efectivos (los de sus roles más los adicionales).
 *
 * Es simétrica a propósito: una ficha centrada con cuatro cifras iguales y
 * tarjetas en pares del mismo alto. La ficha de los socios no dice nada
 * distinto; se nota en los efectos: aro que gira, halo, hilo dorado y brillo.
 */
export default function UsuarioDetallePage() {
  const { id } = useParams();
  const usuarioId = Number(id);
  const { data: usuario, isLoading, isError } = useAdminUser(usuarioId);
  const { data: jefe } = useAdminUser(usuario?.manager ?? 0);
  const { data: equipo = [] } = useAdminUsers({ manager: usuarioId, is_active: true });
  const { data: apps = [] } = useApplications();
  const { data: roles = [] } = useRoles();
  const { data: permisos = [] } = usePermissions();
  const [editando, setEditando] = useState(false);

  const alternarActivo = useAdminMutation(
    (pk: number) => adminApi.users.toggleActive(pk),
    'Estado actualizado',
  );

  // Permisos efectivos: los de sus roles más los adicionales, por aplicación.
  const { porAplicacion, totalPermisos, appsConAcceso, susRoles } = useMemo(() => {
    if (!usuario) {
      return { porAplicacion: [], totalPermisos: 0, appsConAcceso: [], susRoles: [] };
    }
    const deRoles = roles.filter((rol) => usuario.roles.includes(rol.id));
    const idsDeRoles = new Set(deRoles.flatMap((rol) => rol.permissions));
    const extra = new Set(usuario.extraPermissions);
    const efectivos = permisos.filter((p) => idsDeRoles.has(p.id) || extra.has(p.id));

    const grupos = new Map<string, Array<AdminPermission & { adicional: boolean }>>();
    for (const permiso of efectivos) {
      const lista = grupos.get(permiso.applicationName) ?? [];
      lista.push({ ...permiso, adicional: extra.has(permiso.id) && !idsDeRoles.has(permiso.id) });
      grupos.set(permiso.applicationName, lista);
    }

    // Entra a una app si la tiene asignada o si tiene alguno de sus permisos.
    const idsApps = new Set([...usuario.applications, ...efectivos.map((p) => p.application)]);
    return {
      porAplicacion: [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b)),
      totalPermisos: efectivos.length,
      appsConAcceso: apps
        .filter((app) => usuario.isAdmin || idsApps.has(app.id))
        .sort((a, b) => a.name.localeCompare(b.name)),
      susRoles: deRoles,
    };
  }, [usuario, roles, permisos, apps]);

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">No encontramos a esa persona.</p>
        <Button variant="outline" render={<Link to={BASE} />}>
          <ArrowLeftIcon data-icon="inline-start" />
          Volver a Administración
        </Button>
      </div>
    );
  }
  if (isLoading || !usuario) {
    return <EsqueletoPagina forma="detalle" label="Abriendo el detalle de la persona…" />;
  }

  const socio = usuario.destacado;
  const copiarCorreo = () => {
    void navigator.clipboard
      .writeText(usuario.email)
      .then(() => toast.success('Correo copiado'))
      .catch(() => toast.error('No se pudo copiar el correo'));
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl animate-entrada-pagina flex-col gap-6">
      <Button variant="ghost" size="sm" className="self-start" render={<Link to={BASE} />}>
        <ArrowLeftIcon data-icon="inline-start" />
        Volver a usuarios
      </Button>

      {/* Ficha: portada, foto sobre la portada y todo centrado sobre el eje. */}
      <Card className={cn('gap-0 overflow-hidden py-0', socio && 'borde-socio destello-socio')}>
        <div
          aria-hidden
          className={cn(
            'relative isolate h-32 sm:h-36',
            socio
              ? 'bg-[radial-gradient(ellipse_60%_120%_at_50%_120%,rgb(214_170_80/0.45),transparent),linear-gradient(135deg,#14102e,#2b1c63_55%,#14102e)]'
              : 'bg-brand-gradient',
          )}
        >
          <Cuadricula invertida />
        </div>

        <CardContent className="flex flex-col items-center gap-4 px-6 pb-6 text-center">
          <div className={cn('-mt-16 sm:-mt-[4.5rem]', socio ? 'aro-socio' : 'rounded-full')}>
            <Foto
              usuario={usuario}
              className="size-28 bg-card ring-4 ring-card sm:size-32"
              claseLetra="text-4xl"
            />
          </div>

          <div className="flex flex-col gap-1">
            <h1
              className={cn(
                'text-2xl font-semibold tracking-tight sm:text-3xl',
                socio &&
                  'bg-[linear-gradient(90deg,var(--foreground),#b8862e_50%,var(--foreground))] bg-clip-text text-transparent',
              )}
            >
              {usuario.fullName}
            </h1>
            <p className="text-sm text-muted-foreground">
              {usuario.position || 'Sin cargo'} · {usuario.areaName || 'Sin área'}
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            <Badge variant={usuario.isAdmin ? 'default' : 'secondary'}>
              {usuario.isAdmin && <ShieldCheckIcon data-icon="inline-start" />}
              {TIPOS[usuario.kind]}
            </Badge>
            <Badge variant={usuario.isActive ? 'secondary' : 'destructive'}>
              {usuario.isActive ? 'Activo' : 'Inactivo'}
            </Badge>
            <Badge variant="outline">{usuario.odooId ? 'Viene de Odoo' : 'Fuera de Odoo'}</Badge>
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            {usuario.email && (
              <>
                <Button variant="outline" size="sm" render={<a href={`mailto:${usuario.email}`} />}>
                  <MailIcon data-icon="inline-start" />
                  {usuario.email}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Copiar el correo"
                  onClick={copiarCorreo}
                >
                  <CopyIcon />
                </Button>
              </>
            )}
            {usuario.phone && (
              <Button variant="outline" size="sm" render={<a href={`tel:${usuario.phone}`} />}>
                <PhoneIcon data-icon="inline-start" />
                {usuario.phone}
              </Button>
            )}
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => setEditando(true)}>
              <PencilIcon data-icon="inline-start" />
              Editar accesos
            </Button>
            <Button
              variant="outline"
              disabled={alternarActivo.isPending}
              onClick={() => alternarActivo.mutate(usuario.id)}
            >
              {usuario.isActive ? (
                <UserXIcon data-icon="inline-start" />
              ) : (
                <UserCheckIcon data-icon="inline-start" />
              )}
              {usuario.isActive ? 'Inactivar' : 'Activar'}
            </Button>
          </div>
        </CardContent>

        {/* Cuatro cifras del mismo ancho, separadas por líneas finas. */}
        <div className="grid grid-cols-2 divide-x divide-y border-t sm:grid-cols-4 sm:divide-y-0">
          <Cifra
            icono={AppWindowIcon}
            valor={usuario.isAdmin ? 'Todas' : appsConAcceso.length}
            rotulo="Aplicaciones"
          />
          <Cifra icono={LayersIcon} valor={susRoles.length} rotulo="Roles" />
          <Cifra
            icono={KeyRoundIcon}
            valor={usuario.isAdmin ? 'Todos' : totalPermisos}
            rotulo="Permisos"
          />
          <Cifra
            icono={ClockIcon}
            valor={fechaCorta(usuario.lastLoginAt)}
            rotulo="Último ingreso"
          />
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Seccion icono={UserIcon} titulo="Información personal">
          <Datos
            filas={[
              [UserRoundIcon, 'Nombre', usuario.fullName],
              [AtSignIcon, 'Correo', usuario.email],
              [BadgeCheckIcon, 'Usuario', usuario.username],
              [PhoneIcon, 'Teléfono', usuario.phone],
              [FingerprintIcon, 'Cédula', usuario.cedula],
            ]}
          />
        </Seccion>
        <Seccion icono={BuildingIcon} titulo="Organización" descripcion="Viene de Odoo.">
          <Datos
            filas={[
              [BuildingIcon, 'Área', usuario.areaName],
              [BriefcaseIcon, 'Cargo', usuario.position],
              [NetworkIcon, 'Departamento', usuario.departamentoNombre],
              [MapPinIcon, 'Regional', usuario.regional],
              [ClockIcon, 'Sincronizado', fechaHora(usuario.sincronizadoOdooAt)],
            ]}
          />
        </Seccion>

        <Seccion
          icono={AppWindowIcon}
          titulo="Aplicaciones y roles"
          descripcion="A qué entra y con qué roles."
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Rotulo>Aplicaciones</Rotulo>
              {usuario.isAdmin ? (
                <p className="text-sm">Todas, por ser administrador.</p>
              ) : appsConAcceso.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {appsConAcceso.map((app) => (
                    <Badge key={app.id} variant="secondary">
                      {app.name}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Ninguna asignada.</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Rotulo>Roles</Rotulo>
              {susRoles.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {susRoles.map((rol) => (
                    <Badge key={rol.id} variant="outline">
                      {rol.name}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Sin roles.</p>
              )}
            </div>
          </div>
        </Seccion>
        <Seccion
          icono={KeyRoundIcon}
          titulo="Permisos efectivos"
          descripcion="Los de sus roles más los adicionales."
        >
          {usuario.isAdmin ? (
            <Vacio>Tiene todos los permisos por ser administrador.</Vacio>
          ) : porAplicacion.length ? (
            <div className="flex max-h-72 flex-col gap-4 overflow-y-auto pr-1">
              {porAplicacion.map(([app, lista]) => (
                <div key={app} className="flex flex-col gap-1.5">
                  <Rotulo>{app}</Rotulo>
                  <ul className="flex flex-col gap-1">
                    {lista.map((permiso) => (
                      <li
                        key={permiso.id}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="min-w-0 truncate">{permiso.name}</span>
                        {permiso.adicional && (
                          <Badge variant="outline" className="shrink-0">
                            Adicional
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <Vacio>Sin permisos: solo ve lo que cualquiera ve en sus aplicaciones.</Vacio>
          )}
        </Seccion>

        <Seccion icono={UserIcon} titulo="Jefe directo">
          {jefe ? <FilaPersona usuario={jefe} /> : <Vacio>No tiene jefe registrado.</Vacio>}
        </Seccion>
        <Seccion
          icono={UsersIcon}
          titulo="Equipo a cargo"
          descripcion={equipo.length ? `${equipo.length} persona(s) activas.` : undefined}
        >
          {equipo.length ? (
            <div className="flex max-h-72 flex-col overflow-y-auto">
              {equipo.map((persona) => (
                <FilaPersona key={persona.id} usuario={persona} />
              ))}
            </div>
          ) : (
            <Vacio>No tiene personas a cargo.</Vacio>
          )}
        </Seccion>
      </div>

      <UserDialog abierto={editando} onOpenChange={setEditando} usuario={usuario} />
    </div>
  );
}
