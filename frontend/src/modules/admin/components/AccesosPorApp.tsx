import { useState, type ReactNode } from 'react';
import { ChevronDownIcon, InfoIcon, TriangleAlertIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Checkbox } from '@/shared/components/ui';
import { cn } from '@/shared/lib/utils';
import type { AdminApplication, AdminPermission, AdminRole } from '../api';
import { AYUDA_APPS, AYUDA_PERMISOS, AYUDA_ROLES, ayudaDe } from '../ayudas';
import { AyudaAcceso } from './AyudaAcceso';

/** Lo que se edita de los accesos de una persona. */
export interface Accesos {
  applications: number[];
  roles: number[];
  extraPermissions: number[];
}

/**
 * El permiso que ya da todo lo de su app: con él marcado, lo demás sobra.
 * Se avisa para que nadie se ponga a marcar informes uno por uno.
 */
const TODO_EN_LA_APP: Record<string, string> = {
  'bi-trade': 'bi-trade:data:manage',
};

/**
 * Los accesos de una persona, de lo general a lo particular:
 *
 *   App → (sub-módulo) → permiso → lo que va dentro del permiso
 *
 * Cada app es una tarjeta: al marcarla se despliegan sus roles y sus permisos,
 * agrupados y cada uno con lo que permite. Un permiso con otros adentro —en BI
 * Trade, cada informe— es un recuadro propio: al marcarlo aparece lo que la
 * persona puede hacer en él (cargar ventas, compartir…), y solo ahí.
 *
 * Un rol va en la app de sus permisos. Si da permisos en varios sub-módulos
 * de la misma app (los de Supli Performance dan en Objetivos y en Planner),
 * va en esa app, arriba de los sub-módulos. Si no da permisos o los da en
 * apps distintas, va al final, en «Otros roles».
 *
 * Lo marcado es lo que la persona tiene de verdad, venga de donde venga:
 *
 * - La casilla de la app dice si entra. Como en el backend, entra si la tiene
 *   asignada o si tiene alguno de sus permisos (suelto o por un rol), y a un
 *   contenedor si entra a alguno de sus sub-módulos. Desmarcarla le quita
 *   todo lo de esa app, también lo que le daba un rol.
 * - Desmarcar un permiso le quita también los de adentro. Marcar uno de
 *   adentro marca el de afuera: solos no valen.
 * - Los permisos que da un rol salen marcados con el nombre del rol y se
 *   pueden desmarcar: el rol se deshace en sus permisos sueltos, menos los
 *   que se desmarcaron, así la persona pierde solo eso. Se avisa qué rol se
 *   quitó.
 */
export function AccesosPorApp({
  apps,
  roles,
  accesos,
  esAdmin,
  soloLectura = false,
  onCambio,
}: {
  apps: AdminApplication[];
  roles: AdminRole[];
  accesos: Accesos;
  /** La persona que se edita es administradora: lo marcado no le cambia nada. */
  esAdmin: boolean;
  /** Quien edita no es administrador: ve los accesos, pero no los da ni los quita. */
  soloLectura?: boolean;
  onCambio: (accesos: Accesos) => void;
}) {
  const bloqueado = esAdmin || soloLectura;
  const rolesMarcados = roles.filter((rol) => accesos.roles.includes(rol.id));
  // permiso → nombres de los roles marcados que lo dan.
  const porRol = new Map<number, string[]>();
  for (const rol of rolesMarcados) {
    for (const idPermiso of rol.permissions) {
      porRol.set(idPermiso, [...(porRol.get(idPermiso) ?? []), rol.name]);
    }
  }

  const raices = apps.filter((a) => !a.parent).sort((a, b) => a.order - b.order);
  const hijas = (app: AdminApplication) =>
    apps.filter((a) => a.parent === app.id).sort((a, b) => a.order - b.order);

  const tienePermiso = (id: number) => accesos.extraPermissions.includes(id) || porRol.has(id);
  const entra = (app: AdminApplication): boolean =>
    accesos.applications.includes(app.id) ||
    app.permissions.some((p) => tienePermiso(p.id)) ||
    hijas(app).some(entra);

  // Cada rol, en la tarjeta de la app (o sub-módulo) donde da sus permisos.
  const appDePermiso = new Map<number, AdminApplication>();
  for (const app of apps) for (const p of app.permissions) appDePermiso.set(p.id, app);
  const raizDe = (app: AdminApplication) =>
    (app.parent && apps.find((a) => a.id === app.parent)) || app;
  const rolesPorApp = new Map<number, RolEnTarjeta[]>();
  const otrosRoles: RolEnTarjeta[] = [];
  for (const rol of [...roles].sort((a, b) => a.name.localeCompare(b.name))) {
    const suyas = [
      ...new Set(rol.permissions.map((id) => appDePermiso.get(id)).filter((a) => !!a)),
    ].sort((a, b) => a.order - b.order);
    const raicesSuyas = new Set(suyas.map((a) => raizDe(a).id));
    const lugar =
      suyas.length === 1 ? suyas[0] : raicesSuyas.size === 1 ? raizDe(suyas[0]) : undefined;
    // En la app de arriba se dice en cuáles de sus sub-módulos da permisos.
    const enRol = { rol, en: suyas.length > 1 ? suyas.map((a) => a.name) : [] };
    if (lugar) rolesPorApp.set(lugar.id, [...(rolesPorApp.get(lugar.id) ?? []), enRol]);
    else otrosRoles.push(enRol);
  }
  const rolesDe = (app: AdminApplication) => rolesPorApp.get(app.id) ?? [];
  const tieneRol = (id: number) => accesos.roles.includes(id);

  // Con el rol entra a la app: no hace falta marcarla. Al quitarlo pierde lo
  // que daba, salvo lo que tenga marcado aparte.
  const alternarRol = (rol: AdminRole) =>
    onCambio({
      ...accesos,
      roles: tieneRol(rol.id)
        ? accesos.roles.filter((id) => id !== rol.id)
        : [...accesos.roles, rol.id],
    });

  /**
   * Quita estos permisos aunque vengan de un rol: cada rol que dé alguno se
   * deshace en sus permisos sueltos, menos los quitados. Los demás permisos
   * de ese rol —de esta app o de otras— siguen marcados.
   */
  const quitarPermisos = (base: Accesos, ids: Set<number>) => {
    const deshechos = rolesMarcados.filter((rol) => rol.permissions.some((id) => ids.has(id)));
    const sueltos = new Set(base.extraPermissions);
    for (const rol of deshechos) rol.permissions.forEach((id) => sueltos.add(id));
    ids.forEach((id) => sueltos.delete(id));
    onCambio({
      ...base,
      roles: base.roles.filter((id) => !deshechos.some((rol) => rol.id === id)),
      extraPermissions: [...sueltos],
    });
    if (deshechos.length > 0) {
      const nombres = deshechos.map((rol) => `«${rol.name}»`);
      const lista =
        nombres.length === 1
          ? `el rol ${nombres[0]}`
          : `los roles ${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`;
      toast.info(`Se quitó ${lista}`, {
        description:
          'Lo que daba y no desmarcaste sigue marcado, como permisos sueltos. Se aplica al guardar.',
      });
    }
  };

  const alternarApp = (app: AdminApplication) => {
    if (!entra(app)) {
      onCambio({ ...accesos, applications: [...accesos.applications, app.id] });
      return;
    }
    // Quitarla es quitarle todo lo de adentro: la app, sus sub-módulos y sus
    // permisos, sueltos o de un rol. Si no, seguiría entrando por un permiso.
    const todas = [app, ...hijas(app)];
    const fuera = new Set(todas.map((a) => a.id));
    quitarPermisos(
      { ...accesos, applications: accesos.applications.filter((id) => !fuera.has(id)) },
      new Set(todas.flatMap((a) => a.permissions.map((p) => p.id))),
    );
  };

  const alternarPermiso = (app: AdminApplication, permiso: AdminPermission) => {
    if (tienePermiso(permiso.id)) {
      // Con él se van los de adentro: sin el informe no hay dónde usarlos.
      const adentro = app.permissions.filter((p) => p.parent === permiso.id).map((p) => p.id);
      quitarPermisos(accesos, new Set([permiso.id, ...adentro]));
      return;
    }
    // Uno de adentro necesita el de afuera; y cualquier permiso, su app.
    const afuera = permiso.parent;
    const nuevos = [permiso.id, ...(afuera && !tienePermiso(afuera) ? [afuera] : [])];
    onCambio({
      ...accesos,
      applications: accesos.applications.includes(app.id)
        ? accesos.applications
        : [...accesos.applications, app.id],
      extraPermissions: [...accesos.extraPermissions, ...nuevos],
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {esAdmin && (
        <p className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          <InfoIcon className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>
            Es administrador: entra a todas las apps y tiene todos los permisos, así que aquí no hay
            nada que marcar. Para darle accesos uno por uno, apaga «Administrador» en{' '}
            <span className="font-medium">Estado y medición</span>.
          </span>
        </p>
      )}
      {soloLectura && !esAdmin && (
        <p className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          <InfoIcon className="mt-0.5 size-4 shrink-0 text-primary" />
          Así quedan sus accesos. Darlos o quitarlos es solo de los administradores.
        </p>
      )}
      {/* Al administrador no le cambia nada lo marcado, y quien no es
          administrador no da accesos: se ve, pero no se toca. Lo guardado de
          un administrador vuelve a valer si deja de serlo. */}
      <div
        inert={bloqueado}
        aria-disabled={bloqueado || undefined}
        className={cn(
          'flex flex-col gap-3',
          bloqueado && 'select-none',
          esAdmin && 'opacity-50',
          soloLectura && !esAdmin && 'opacity-80',
        )}
      >
        {raices.map((app) => (
          <TarjetaApp
            key={app.id}
            app={app}
            hijas={hijas(app)}
            entra={entra}
            tienePermiso={tienePermiso}
            porRol={porRol}
            onApp={alternarApp}
            onPermiso={alternarPermiso}
            rolesDe={rolesDe}
            tieneRol={tieneRol}
            onRol={alternarRol}
          />
        ))}
        {otrosRoles.length > 0 && (
          <div className="flex flex-col gap-2 rounded-xl border p-3">
            <span className="font-medium">Otros roles</span>
            <span className="text-xs text-muted-foreground">
              No dan permisos en ninguna app, o los dan en apps distintas.
            </span>
            <Roles roles={otrosRoles} tieneRol={tieneRol} onRol={alternarRol} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Un rol y, si va en una app con sub-módulos, en cuáles de ellos da permisos. */
interface RolEnTarjeta {
  rol: AdminRole;
  en: string[];
}

interface PropsRoles {
  rolesDe: (app: AdminApplication) => RolEnTarjeta[];
  tieneRol: (id: number) => boolean;
  onRol: (rol: AdminRole) => void;
}

const lista = (nombres: string[]) =>
  nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}` : nombres[0];

/** Los roles de una app: paquetes de permisos ya armados, antes que los sueltos. */
function Roles({
  roles,
  tieneRol,
  onRol,
}: Omit<PropsRoles, 'rolesDe'> & { roles: RolEnTarjeta[] }) {
  return (
    <div className="flex flex-col gap-2">
      <TituloGrupo>Roles</TituloGrupo>
      <p className="text-xs text-muted-foreground text-pretty">
        Paquetes de permisos ya armados: lo que da queda marcado abajo con el nombre del rol.
      </p>
      <div className="grid gap-2 md:grid-cols-2">
        {roles.map(({ rol, en }) => {
          const marcado = tieneRol(rol.id);
          const ayuda = ayudaDe(AYUDA_ROLES, rol.code, rol.description);
          const cuantos = rol.permissions.length;
          return (
            <div
              key={rol.id}
              className={cn(
                'flex items-start rounded-lg border pr-1.5 text-sm transition-colors',
                marcado && 'border-primary/40 bg-primary/5',
              )}
            >
              <label className="flex min-w-0 flex-1 cursor-pointer gap-3 p-2.5">
                <Checkbox className="mt-0.5" checked={marcado} onCheckedChange={() => onRol(rol)} />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium">{rol.name}</span>
                  <span className="text-xs text-muted-foreground text-pretty">
                    {cuantos === 0
                      ? 'No da ningún permiso.'
                      : `Da ${cuantos} ${cuantos === 1 ? 'permiso' : 'permisos'}${
                          en.length > 0 ? ` en ${lista(en)}` : ''
                        }.`}
                  </span>
                </span>
              </label>
              {ayuda && <AyudaAcceso titulo={rol.name} ayuda={ayuda} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface PropsPermisos {
  tienePermiso: (id: number) => boolean;
  porRol: Map<number, string[]>;
  onPermiso: (app: AdminApplication, permiso: AdminPermission) => void;
}

/**
 * «2 de 6 informes»: en una app con permisos adentro se cuentan los de afuera
 * de su grupo (los informes, las secciones de Administración), no los 35.
 */
function resumen(app: AdminApplication, tienePermiso: (id: number) => boolean) {
  const conAdentro = app.permissions.filter((p) =>
    app.permissions.some((otro) => otro.parent === p.id),
  );
  const grupos = new Set(conAdentro.map((p) => p.group));
  const contados =
    conAdentro.length > 0
      ? app.permissions.filter((p) => !p.parent && grupos.has(p.group))
      : app.permissions;
  const marcados = contados.filter((p) => tienePermiso(p.id)).length;
  const cosa =
    conAdentro.length > 0 ? (conAdentro[0].group || 'Permisos').toLowerCase() : 'permisos';
  return marcados > 0
    ? `${marcados} de ${contados.length} ${cosa}`
    : `${contados.length} ${cosa} para elegir`;
}

function TarjetaApp({
  app,
  hijas,
  entra,
  tienePermiso,
  porRol,
  onApp,
  onPermiso,
  rolesDe,
  tieneRol,
  onRol,
}: PropsPermisos &
  PropsRoles & {
    app: AdminApplication;
    hijas: AdminApplication[];
    entra: (app: AdminApplication) => boolean;
    onApp: (app: AdminApplication) => void;
  }) {
  const todas = [app, ...hijas];
  const activa = entra(app);
  const [abierta, setAbierta] = useState(activa);
  const desplegada = abierta || activa;
  const conPermisos =
    todas.some((a) => a.permissions.length > 0 || rolesDe(a).length > 0) || hijas.length > 0;
  const rolesMarcados = todas.flatMap(rolesDe).filter(({ rol }) => tieneRol(rol.id)).length;
  const detalle = [
    rolesMarcados > 0 && `${rolesMarcados} ${rolesMarcados === 1 ? 'rol' : 'roles'}`,
    hijas.length === 0 && app.permissions.length > 0 && resumen(app, tienePermiso),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className={cn(
        'rounded-xl border transition-colors',
        activa && 'border-primary/40 bg-primary/[0.03]',
      )}
    >
      <div className="flex items-center gap-1 pr-1.5">
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 p-3">
          <Checkbox checked={activa} onCheckedChange={() => onApp(app)} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{app.name}</span>
            {detalle && <span className="text-xs text-muted-foreground">{detalle}</span>}
          </span>
        </label>
        {(() => {
          const ayuda = ayudaDe(AYUDA_APPS, app.code, app.description);
          return ayuda ? <AyudaAcceso titulo={app.name} ayuda={ayuda} /> : null;
        })()}
        {conPermisos && (
          <button
            type="button"
            aria-label={
              desplegada ? `Ocultar los permisos de ${app.name}` : `Ver los permisos de ${app.name}`
            }
            aria-expanded={desplegada}
            disabled={activa}
            onClick={() => setAbierta((v) => !v)}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
          >
            <ChevronDownIcon
              className={cn('size-4 transition-transform', desplegada && 'rotate-180')}
            />
          </button>
        )}
      </div>

      {desplegada && conPermisos && (
        <div className="flex flex-col gap-4 border-t px-3 pt-3 pb-4">
          {rolesDe(app).length > 0 && (
            <Roles roles={rolesDe(app)} tieneRol={tieneRol} onRol={onRol} />
          )}
          {app.permissions.length > 0 && (
            <Permisos
              app={app}
              activa={activa}
              tienePermiso={tienePermiso}
              porRol={porRol}
              onPermiso={onPermiso}
            />
          )}
          {hijas.map((hija) => (
            <div key={hija.id} className="flex flex-col gap-2 rounded-lg border bg-background p-3">
              <div className="flex items-center gap-1">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                  <Checkbox checked={entra(hija)} onCheckedChange={() => onApp(hija)} />
                  <span className="truncate text-sm font-medium">{hija.name}</span>
                </label>
                {(() => {
                  const ayuda = ayudaDe(AYUDA_APPS, hija.code, hija.description);
                  return ayuda ? <AyudaAcceso titulo={hija.name} ayuda={ayuda} /> : null;
                })()}
              </div>
              {rolesDe(hija).length > 0 && (
                <Roles roles={rolesDe(hija)} tieneRol={tieneRol} onRol={onRol} />
              )}
              {hija.permissions.length > 0 && (
                <Permisos
                  app={hija}
                  activa={entra(hija)}
                  tienePermiso={tienePermiso}
                  porRol={porRol}
                  onPermiso={onPermiso}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Agrupa por `group`, en orden. */
function agrupar(permisos: AdminPermission[]) {
  const ordenados = [...permisos].sort((a, b) => a.order - b.order || a.code.localeCompare(b.code));
  const grupos: Array<{ nombre: string; permisos: AdminPermission[] }> = [];
  for (const permiso of ordenados) {
    const nombre = permiso.group || 'Permisos';
    const grupo = grupos.find((g) => g.nombre === nombre);
    if (grupo) grupo.permisos.push(permiso);
    else grupos.push({ nombre, permisos: [permiso] });
  }
  return grupos;
}

function TituloGrupo({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{children}</p>
  );
}

/** Los permisos de una app, por grupo; los que tienen otros adentro, en su recuadro. */
function Permisos({
  app,
  activa,
  tienePermiso,
  porRol,
  onPermiso,
}: PropsPermisos & {
  app: AdminApplication;
  /** Si la persona entra a esta app. */
  activa: boolean;
}) {
  const adentroDe = (permiso: AdminPermission) =>
    app.permissions.filter((p) => p.parent === permiso.id);
  const sueltos = app.permissions.filter(
    (p) => !p.parent || !app.permissions.some((otro) => otro.id === p.parent),
  );

  const codigoTotal = TODO_EN_LA_APP[app.code];
  const total = app.permissions.find((p) => p.code === codigoTotal);
  const tieneTodo = !!total && tienePermiso(total.id);

  // BI Trade: sin ningún informe, la persona entra a la app y no ve nada.
  const sinInformes =
    app.code === 'bi-trade' &&
    activa &&
    !tieneTodo &&
    !app.permissions.some((p) => p.code.startsWith('bi-trade:informe:') && tienePermiso(p.id));

  return (
    <div className="flex flex-col gap-4">
      {sinInformes && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs">
          <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
          Marca al menos un informe: con la app pero sin informes, no verá ningún tablero.
        </p>
      )}
      {agrupar(sueltos).map((grupo) => {
        const conAdentro = grupo.permisos.some((p) => adentroDe(p).length > 0);
        return (
          <div
            key={grupo.nombre}
            className={cn(
              'flex flex-col gap-2',
              // Con «todo» marcado, los informes sobran: se ven, pero apagados.
              tieneTodo && conAdentro && 'opacity-60',
            )}
          >
            <TituloGrupo>{grupo.nombre}</TituloGrupo>
            {tieneTodo && conAdentro && total && (
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
                Con «{total.name}» ya tiene todo esto: no hace falta marcar nada aquí.
              </p>
            )}
            {conAdentro ? (
              <div className="flex flex-col gap-2">
                {grupo.permisos.map((permiso) => (
                  <PermisoConAdentro
                    key={permiso.id}
                    app={app}
                    permiso={permiso}
                    adentro={adentroDe(permiso)}
                    tienePermiso={tienePermiso}
                    porRol={porRol}
                    onPermiso={onPermiso}
                  />
                ))}
              </div>
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {grupo.permisos.map((permiso) => (
                  <CasillaPermiso
                    key={permiso.id}
                    app={app}
                    permiso={permiso}
                    tienePermiso={tienePermiso}
                    porRol={porRol}
                    onPermiso={onPermiso}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Un permiso con otros adentro, como un informe de BI Trade: su casilla y, al
 * marcarlo, lo que la persona puede hacer en él.
 */
function PermisoConAdentro({
  app,
  permiso,
  adentro,
  tienePermiso,
  porRol,
  onPermiso,
}: PropsPermisos & {
  app: AdminApplication;
  permiso: AdminPermission;
  adentro: AdminPermission[];
}) {
  const marcado = tienePermiso(permiso.id);
  const marcadosAdentro = adentro.filter((p) => tienePermiso(p.id)).length;
  const roles = porRol.get(permiso.id);
  const texto = permiso.description || AYUDA_PERMISOS[permiso.code]?.texto;

  return (
    <div
      className={cn(
        'rounded-lg border bg-background transition-colors',
        marcado && 'border-primary/50 ring-1 ring-primary/15',
      )}
    >
      <label className="flex cursor-pointer gap-3 p-3">
        <Checkbox
          className="mt-0.5"
          checked={marcado}
          onCheckedChange={() => onPermiso(app, permiso)}
        />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-1.5 font-medium">
            {permiso.name}
            {roles && (
              <Badge variant="secondary" className="font-normal">
                Por el rol {roles.join(', ')}
              </Badge>
            )}
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {!marcado
                ? 'Sin acceso'
                : adentro.length === 0
                  ? 'Con acceso'
                  : marcadosAdentro > 0
                    ? `Ver y ${marcadosAdentro} de ${adentro.length} permisos`
                    : 'Solo ver'}
            </span>
          </span>
          {texto && <span className="text-xs text-muted-foreground text-pretty">{texto}</span>}
        </span>
      </label>

      {/* Una sección sin nada adentro (Áreas, Odoo) es solo su casilla. */}
      {marcado && adentro.length > 0 && (
        <div className="flex flex-col gap-3 border-t bg-muted/30 px-3 pt-3 pb-3 sm:pl-10">
          <p className="text-xs text-muted-foreground">Además de ver, ¿qué más puede hacer aquí?</p>
          {agrupar(adentro).map((grupo) => (
            <div key={grupo.nombre} className="flex flex-col gap-2">
              <TituloGrupo>{grupo.nombre}</TituloGrupo>
              <div className="grid gap-2 md:grid-cols-2">
                {grupo.permisos.map((hijo) => (
                  <CasillaPermiso
                    key={hijo.id}
                    app={app}
                    permiso={hijo}
                    tienePermiso={tienePermiso}
                    porRol={porRol}
                    onPermiso={onPermiso}
                    compacta
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Un permiso: su casilla, su nombre, de qué rol viene y lo que permite. */
function CasillaPermiso({
  app,
  permiso,
  tienePermiso,
  porRol,
  onPermiso,
  compacta = false,
}: PropsPermisos & {
  app: AdminApplication;
  permiso: AdminPermission;
  /** Dentro de otro permiso: más chica, sobre el fondo del recuadro. */
  compacta?: boolean;
}) {
  const roles = porRol.get(permiso.id);
  const marcado = tienePermiso(permiso.id);
  const ayuda = AYUDA_PERMISOS[permiso.code];
  const texto = permiso.description || ayuda?.texto;
  return (
    <label
      className={cn(
        'flex cursor-pointer gap-3 rounded-lg border text-sm transition-colors',
        compacta ? 'bg-background p-2' : 'p-2.5',
        marcado && 'border-primary/40 bg-primary/5',
      )}
    >
      <Checkbox
        className="mt-0.5"
        checked={marcado}
        onCheckedChange={() => onPermiso(app, permiso)}
      />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-1.5 font-medium">
          {permiso.name}
          {roles && (
            <Badge variant="secondary" className="font-normal">
              Por el rol {roles.join(', ')}
            </Badge>
          )}
        </span>
        {texto && <span className="text-xs text-muted-foreground text-pretty">{texto}</span>}
        {ayuda?.ojo && (
          <span className="flex gap-1.5 text-xs text-muted-foreground text-pretty">
            <InfoIcon className="mt-0.5 size-3 shrink-0" />
            {ayuda.ojo}
          </span>
        )}
      </span>
    </label>
  );
}
