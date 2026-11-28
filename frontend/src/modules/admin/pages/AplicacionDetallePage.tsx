import { useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftIcon,
  BuildingIcon,
  CheckIcon,
  ChevronRightIcon,
  GripVerticalIcon,
  InfoIcon,
  KeyRoundIcon,
  SearchIcon,
  ShieldCheckIcon,
  UserPlusIcon,
  UsersIcon,
  UsersRoundIcon,
  XIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { urlFotoDe } from '@/core/auth';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Spinner,
} from '@/shared/components/ui';
import { EsqueletoPagina } from '@/shared/components/feedback';
import { useDebounced } from '@/shared/hooks';
import { iconoDeApp } from '@/shared/lib/appIcons';
import { cn } from '@/shared/lib/utils';
import {
  adminApi,
  nombreDePermiso,
  type AccesoPersona,
  type AdminPermission,
  type AdminRole,
  type CambioDeAcceso,
} from '../api';
import { AYUDA_PERMISOS, AYUDA_ROLES, ayudaDe } from '../ayudas';
import { AyudaAcceso } from '../components/AyudaAcceso';
import {
  adminKeys,
  mensajeDeError,
  useAccesosApp,
  useAdminMutation,
  useAdminUsers,
  useApplications,
  useAreas,
  useRoles,
} from '../hooks';
import { usePermisosAdmin } from '../permisos';

const BASE = '/inicio/admin';
/** Lo que viaja al arrastrar a una persona: solo lo que hace falta para avisar. */
const TIPO_ARRASTRE = 'application/x-supli-persona';

interface PersonaArrastrada {
  id: number;
  fullName: string;
  isAdmin: boolean;
}

type Destino =
  | { tipo: 'app' }
  | { tipo: 'rol'; id: number; nombre: string }
  | { tipo: 'permiso'; id: number; nombre: string };

/** Lo que cada zona necesita para recibir personas y quitarlas. */
interface Reparto {
  /** Solo el administrador da y quita accesos. */
  puedeDar: boolean;
  /** Tocada en el panel: para dar sin arrastrar (celular, teclado). */
  seleccionada: PersonaArrastrada | null;
  dar: (persona: PersonaArrastrada, destino: Destino) => void;
  quitar: (persona: AccesoPersona, destino: Destino) => void;
  /** Si el nombre lleva al detalle de la persona. */
  enlaceAPersona: boolean;
}

/**
 * El detalle de una app: sus roles, sus permisos y quién tiene cada cosa. Es
 * la ficha de la persona al revés: aquí se parte de la app.
 *
 * El administrador arrastra a alguien del panel de personas a la app (se la
 * asigna), a un rol o a un permiso, y se lo da; la X de cada persona se lo
 * quita. Quien solo puede ver aplicaciones ve lo mismo, sin poder cambiarlo.
 */
export default function AplicacionDetallePage() {
  const { id } = useParams();
  const appId = Number(id);
  const puede = usePermisosAdmin();
  const { data: apps = [], isLoading: cargandoApps } = useApplications();
  const { data: roles = [] } = useRoles();
  const { data: personas = [], isLoading: cargandoAccesos } = useAccesosApp(appId);
  const [seleccionada, setSeleccionada] = useState<PersonaArrastrada | null>(null);
  const [porQuitarTodo, setPorQuitarTodo] = useState<AccesoPersona | null>(null);

  const darAcceso = useAdminMutation(
    (cambio: CambioDeAcceso) => adminApi.applications.darAcceso(appId, cambio),
    'Acceso dado',
  );
  const quitarAcceso = useAdminMutation(
    (cambio: CambioDeAcceso) => adminApi.applications.quitarAcceso(appId, cambio),
    'Acceso quitado',
  );

  const app = apps.find((a) => a.id === appId);
  if (cargandoApps) return <EsqueletoPagina label="Abriendo la aplicación…" />;
  if (!app) {
    return (
      <div className="flex flex-col gap-4">
        <VolverAAplicaciones />
        <p className="text-sm text-muted-foreground">No se encontró esta aplicación.</p>
      </div>
    );
  }

  const hijas = apps.filter((a) => a.parent === app.id).sort((a, b) => a.order - b.order);
  const padre = apps.find((a) => a.id === app.parent);
  const idsPermisos = new Set(app.permissions.map((p) => p.id));
  const rolesApp = roles
    .filter((rol) => rol.permissions.some((idPermiso) => idsPermisos.has(idPermiso)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const rolPorId = new Map(rolesApp.map((rol) => [rol.id, rol]));

  /** Quién tiene un permiso: suelto (se puede quitar) o por un rol (se quita el rol). */
  const conPermiso = (idPermiso: number) =>
    personas.flatMap((persona) => {
      if (persona.permisos.includes(idPermiso)) return [{ persona }];
      const rol = persona.roles
        .map((idRol) => rolPorId.get(idRol))
        .find((r) => r?.permissions.includes(idPermiso));
      return rol ? [{ persona, porRol: rol.name }] : [];
    });

  const yaLoTiene = (persona: AccesoPersona, destino: Destino) =>
    destino.tipo === 'app'
      ? persona.asignada
      : destino.tipo === 'rol'
        ? persona.roles.includes(destino.id)
        : conPermiso(destino.id).some((c) => c.persona.id === persona.id);

  const reparto: Reparto = {
    puedeDar: puede.esAdmin,
    seleccionada,
    enlaceAPersona: puede.verUsuarios,
    dar: (persona, destino) => {
      const actual = personas.find((p) => p.id === persona.id);
      if (persona.isAdmin) {
        toast.info(`${persona.fullName} es administrador: ya tiene todo.`);
      } else if (actual && yaLoTiene(actual, destino)) {
        toast.info(`${persona.fullName} ya lo tiene.`);
      } else {
        darAcceso.mutate({
          usuario: persona.id,
          tipo: destino.tipo,
          id: destino.tipo === 'app' ? undefined : destino.id,
        });
      }
      setSeleccionada(null);
    },
    quitar: (persona, destino) => {
      // Quitar la app es quitarle todo lo de aquí: se confirma.
      if (destino.tipo === 'app') setPorQuitarTodo(persona);
      else quitarAcceso.mutate({ usuario: persona.id, tipo: destino.tipo, id: destino.id });
    },
  };

  const Icono = iconoDeApp(app.icon);
  const asignadas = personas.filter((p) => p.asignada);

  return (
    <div className="flex animate-entrada-pagina flex-col gap-6">
      <VolverAAplicaciones />

      <Card>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-md">
            <Icono className="size-7" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-xl font-semibold tracking-tight">{app.name}</h1>
              <Badge variant={app.isActive ? 'success' : 'outline'}>
                {app.isActive ? 'Activa' : 'Inactiva'}
              </Badge>
            </div>
            <p className="font-mono text-xs text-muted-foreground">
              {app.code} · {app.basePath}
            </p>
            {app.description && (
              <p className="text-sm text-muted-foreground text-pretty">{app.description}</p>
            )}
            {padre && (
              <p className="text-xs text-muted-foreground">
                Va dentro de{' '}
                <Link
                  to={`${BASE}/aplicaciones/${padre.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {padre.name}
                </Link>
              </p>
            )}
          </div>
          <dl className="grid shrink-0 grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border text-center">
            <Cifra rotulo="Personas" valor={cargandoAccesos ? '…' : personas.length} />
            <Cifra rotulo="Roles" valor={rolesApp.length} />
            <Cifra rotulo="Permisos" valor={app.permissions.length} />
          </dl>
        </CardContent>
      </Card>

      {hijas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Sub-módulos</CardTitle>
            <CardDescription>
              Cada uno tiene sus propios roles y permisos. Quien entra a uno, ve esta app en el
              menú.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {hijas.map((hija) => (
                <li key={hija.id}>
                  <Link
                    to={`${BASE}/aplicaciones/${hija.id}`}
                    className="group flex items-center gap-3 rounded-lg border p-3 transition-colors hover:border-primary/40 hover:bg-muted/40"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">{hija.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {hija.permissions.length} permisos · {hija.userCount} asignadas
                      </span>
                    </span>
                    <ChevronRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {cargandoAccesos ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full" />
              ))}
            </div>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Quién entra</CardTitle>
                  <CardDescription>
                    {personas.length === 0
                      ? 'Nadie entra todavía, fuera de los administradores, que entran a todo.'
                      : `${personas.length} ${personas.length === 1 ? 'persona entra' : 'personas entran'}: con la app asignada o con alguno de sus roles o permisos. Los administradores entran a todo.`}
                  </CardDescription>
                  {puede.esAdmin && (
                    <CardAction>
                      <AgregarMuchos appId={app.id} appNombre={app.name} />
                    </CardAction>
                  )}
                </CardHeader>
                <CardContent>
                  <Zona
                    titulo="Con la app asignada"
                    descripcion="Entra a la app; lo que puede hacer adentro lo dan los roles y permisos de abajo."
                    destino={{ tipo: 'app' }}
                    personas={asignadas.map((persona) => ({ persona }))}
                    reparto={reparto}
                  />
                </CardContent>
              </Card>

              {rolesApp.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <KeyRoundIcon className="size-4" /> Roles
                    </CardTitle>
                    <CardDescription>
                      Paquetes de permisos ya armados. Quitar un rol le quita todo lo que daba,
                      también en otras apps.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 xl:grid-cols-2">
                    {rolesApp.map((rol) => (
                      <ZonaRol
                        key={rol.id}
                        rol={rol}
                        permisos={app.permissions.filter((p) => rol.permissions.includes(p.id))}
                        personas={personas.filter((p) => p.roles.includes(rol.id))}
                        reparto={reparto}
                      />
                    ))}
                  </CardContent>
                </Card>
              )}

              {app.permissions.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ShieldCheckIcon className="size-4" /> Permisos
                    </CardTitle>
                    <CardDescription>
                      Quién tiene cada uno. Los que vienen de un rol dicen «por rol» y se quitan
                      quitando el rol.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-5">
                    {agrupar(
                      app.permissions.filter((p) => !p.parent || !idsPermisos.has(p.parent)),
                    ).map((grupo) => (
                      <div key={grupo.nombre} className="flex flex-col gap-2">
                        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                          {grupo.nombre}
                        </p>
                        <div className="flex flex-col gap-2">
                          {grupo.permisos.map((permiso) => (
                            <Zona
                              key={permiso.id}
                              titulo={permiso.name}
                              descripcion={permiso.description}
                              ayuda={AYUDA_PERMISOS[permiso.code]?.ojo}
                              destino={{ tipo: 'permiso', id: permiso.id, nombre: permiso.name }}
                              personas={conPermiso(permiso.id)}
                              reparto={reparto}
                            >
                              {app.permissions.some((p) => p.parent === permiso.id) && (
                                <div className="mt-3 grid gap-2 border-t pt-3 md:grid-cols-2">
                                  {app.permissions
                                    .filter((p) => p.parent === permiso.id)
                                    .sort((a, b) => a.order - b.order)
                                    .map((hijo) => (
                                      <Zona
                                        key={hijo.id}
                                        compacta
                                        titulo={hijo.name}
                                        destino={{
                                          tipo: 'permiso',
                                          id: hijo.id,
                                          nombre: nombreDePermiso(hijo),
                                        }}
                                        personas={conPermiso(hijo.id)}
                                        reparto={reparto}
                                      />
                                    ))}
                                </div>
                              )}
                            </Zona>
                          ))}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>

        {puede.esAdmin ? (
          <PanelPersonas
            seleccionada={seleccionada}
            onSeleccionar={setSeleccionada}
            conAcceso={new Set(personas.map((p) => p.id))}
          />
        ) : (
          <Card className="lg:self-start">
            <CardContent className="flex items-start gap-2 text-sm text-muted-foreground">
              <InfoIcon className="mt-0.5 size-4 shrink-0" />
              Dar o quitar accesos es solo de los administradores.
            </CardContent>
          </Card>
        )}
      </div>

      <AlertDialog open={!!porQuitarTodo} onOpenChange={(v) => !v && setPorQuitarTodo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Quitarle {app.name} a {porQuitarTodo?.fullName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se le quita todo lo de esta app: la asignación, sus permisos sueltos y los roles que
              dan permisos aquí (con lo que esos roles daban en otras apps). Deja de entrar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (porQuitarTodo) quitarAcceso.mutate({ usuario: porQuitarTodo.id, tipo: 'app' });
                setPorQuitarTodo(null);
              }}
            >
              Quitar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * «Agregar a todos» y «Agregar por área»: le asignan la app a muchos de una
 * vez, solo para que entren (sin roles ni permisos). Solo el administrador.
 */
function AgregarMuchos({ appId, appNombre }: { appId: number; appNombre: string }) {
  const queryClient = useQueryClient();
  const { data: areas = [] } = useAreas();
  const [aTodos, setATodos] = useState(false);
  const [porArea, setPorArea] = useState(false);
  const [area, setArea] = useState('');

  const asignar = useMutation({
    mutationFn: (cuerpo: { todos: true } | { area: number }) =>
      adminApi.applications.asignarA(appId, cuerpo),
    onSuccess: ({ agregadas }) => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.todo });
      if (agregadas === 0) toast.info('Todos ya la tenían: no hubo a quién sumar.');
      else
        toast.success(
          `${appNombre}: se sumaron ${agregadas} ${agregadas === 1 ? 'persona' : 'personas'}.`,
        );
      setATodos(false);
      setPorArea(false);
      setArea('');
    },
    onError: (error) => toast.error(mensajeDeError(error)),
  });

  const activas = areas.filter((a) => a.isActive).sort((a, b) => a.name.localeCompare(b.name));
  const elegida = activas.find((a) => String(a.id) === area);

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={() => setATodos(true)}>
        <UsersRoundIcon data-icon="inline-start" />
        Agregar a todos
      </Button>
      <Button size="sm" variant="outline" onClick={() => setPorArea(true)}>
        <BuildingIcon data-icon="inline-start" />
        Agregar por área
      </Button>

      <AlertDialog open={aTodos} onOpenChange={setATodos}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Darle {appNombre} a todos?</AlertDialogTitle>
            <AlertDialogDescription>
              Se le asigna a todas las personas activas que pueden iniciar sesión. Es solo la app,
              para que entren: sin roles ni permisos. Los administradores ya entran a todo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={asignar.isPending}
              onClick={(evento) => {
                evento.preventDefault();
                asignar.mutate({ todos: true });
              }}
            >
              {asignar.isPending && <Spinner data-icon="inline-start" />}
              Agregar a todos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={porArea} onOpenChange={setPorArea}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Darle {appNombre} a un área</DialogTitle>
            <DialogDescription>
              A las personas activas del área que pueden iniciar sesión. Es solo la app, para que
              entren: sin roles ni permisos.
            </DialogDescription>
          </DialogHeader>
          <Select
            items={activas.map((a) => ({ value: String(a.id), label: a.name }))}
            value={area}
            onValueChange={(valor) => setArea(valor ?? '')}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Elige el área" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {activas.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {elegida && (
            <p className="text-xs text-muted-foreground">
              {elegida.userCount} {elegida.userCount === 1 ? 'persona' : 'personas'} en el área; se
              suma a quien no la tenga y pueda entrar.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPorArea(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!elegida || asignar.isPending}
              onClick={() => elegida && asignar.mutate({ area: elegida.id })}
            >
              {asignar.isPending && <Spinner data-icon="inline-start" />}
              Agregar al área
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VolverAAplicaciones() {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="self-start"
      render={<Link to={`${BASE}?pestana=aplicaciones`} />}
    >
      <ArrowLeftIcon data-icon="inline-start" />
      Volver a aplicaciones
    </Button>
  );
}

function Cifra({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <div className="flex flex-col bg-card px-4 py-2">
      <dd className="font-heading text-lg font-semibold tabular-nums">{valor}</dd>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
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

function ZonaRol({
  rol,
  permisos,
  personas,
  reparto,
}: {
  rol: AdminRole;
  permisos: AdminPermission[];
  personas: AccesoPersona[];
  reparto: Reparto;
}) {
  const ayuda = ayudaDe(AYUDA_ROLES, rol.code, rol.description);
  return (
    <Zona
      titulo={rol.name}
      descripcion={ayuda?.texto}
      ayuda={ayuda?.ojo}
      destino={{ tipo: 'rol', id: rol.id, nombre: rol.name }}
      personas={personas.map((persona) => ({ persona }))}
      reparto={reparto}
      extra={
        <div className="mt-1.5 flex flex-wrap gap-1">
          {permisos.map((p) => (
            <Badge key={p.id} variant="outline" className="font-normal">
              {nombreDePermiso(p)}
            </Badge>
          ))}
        </div>
      }
    />
  );
}

function leerArrastre(evento: DragEvent): PersonaArrastrada | null {
  try {
    const dato = JSON.parse(evento.dataTransfer.getData(TIPO_ARRASTRE)) as PersonaArrastrada;
    return typeof dato.id === 'number' ? dato : null;
  } catch {
    return null;
  }
}

/**
 * Donde se suelta a una persona para darle algo (la app, un rol o un permiso),
 * con quienes ya lo tienen. La X quita lo suelto; lo que viene de un rol no.
 */
function Zona({
  titulo,
  descripcion,
  ayuda,
  extra,
  destino,
  personas,
  reparto,
  compacta = false,
  children,
}: {
  titulo: string;
  descripcion?: string;
  ayuda?: string;
  extra?: ReactNode;
  destino: Destino;
  personas: Array<{ persona: AccesoPersona; porRol?: string }>;
  reparto: Reparto;
  compacta?: boolean;
  children?: ReactNode;
}) {
  const [encima, setEncima] = useState(false);
  const acepta = reparto.puedeDar;

  const alPasar = (evento: DragEvent) => {
    if (!acepta || !evento.dataTransfer.types.includes(TIPO_ARRASTRE)) return;
    // La zona de más adentro (un permiso dentro de otro) es la que recibe.
    evento.preventDefault();
    evento.stopPropagation();
    evento.dataTransfer.dropEffect = 'copy';
    setEncima(true);
  };
  const alSalir = (evento: DragEvent) => {
    if (!evento.currentTarget.contains(evento.relatedTarget as Node | null)) setEncima(false);
  };
  const alSoltar = (evento: DragEvent) => {
    if (!acepta) return;
    evento.preventDefault();
    evento.stopPropagation();
    setEncima(false);
    const persona = leerArrastre(evento);
    if (persona) reparto.dar(persona, destino);
  };

  return (
    <div
      onDragOver={alPasar}
      onDragLeave={alSalir}
      onDrop={alSoltar}
      className={cn(
        'rounded-lg border transition-colors',
        compacta ? 'bg-background p-2.5' : 'p-3',
        encima && 'border-dashed border-primary bg-primary/5 ring-2 ring-primary/20',
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={cn('font-medium', compacta && 'text-sm')}>{titulo}</span>
          {descripcion && (
            <span className="text-xs text-muted-foreground text-pretty">{descripcion}</span>
          )}
          {extra}
        </div>
        {ayuda && <AyudaAcceso titulo={titulo} ayuda={{ texto: ayuda }} />}
        <Badge variant="secondary" className="tabular-nums">
          <UsersIcon data-icon="inline-start" />
          {personas.length}
        </Badge>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {personas.length === 0 ? (
          <span className="text-xs text-muted-foreground">
            {acepta ? 'Nadie todavía. Arrastra a alguien aquí.' : 'Nadie todavía.'}
          </span>
        ) : (
          personas.map(({ persona, porRol }) => (
            <ChipPersona
              key={persona.id}
              persona={persona}
              porRol={porRol}
              enlace={reparto.enlaceAPersona}
              onQuitar={acepta && !porRol ? () => reparto.quitar(persona, destino) : undefined}
            />
          ))
        )}
      </div>

      {acepta && reparto.seleccionada && (
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="mt-2"
          onClick={() => reparto.seleccionada && reparto.dar(reparto.seleccionada, destino)}
        >
          <UserPlusIcon data-icon="inline-start" />
          Dar a {reparto.seleccionada.fullName.split(' ')[0]}
        </Button>
      )}

      {children}
    </div>
  );
}

function ChipPersona({
  persona,
  porRol,
  enlace,
  onQuitar,
}: {
  persona: AccesoPersona;
  porRol?: string;
  enlace: boolean;
  onQuitar?: () => void;
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full border bg-background py-0.5 pl-0.5 text-xs',
        onQuitar ? 'pr-0.5' : 'pr-2',
      )}
      title={porRol ? `Por el rol ${porRol}` : undefined}
    >
      <Avatar className={cn('size-5', persona.destacado && 'hilo-socio')}>
        <AvatarImage src={urlFotoDe(persona)} alt="" />
        <AvatarFallback className="text-[0.6rem]">
          {persona.firstName.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      {enlace ? (
        <Link to={`${BASE}/usuarios/${persona.id}`} className="truncate hover:underline">
          {persona.fullName}
        </Link>
      ) : (
        <span className="truncate">{persona.fullName}</span>
      )}
      {porRol && <span className="shrink-0 text-muted-foreground">· por rol</span>}
      {onQuitar && (
        <button
          type="button"
          aria-label={`Quitárselo a ${persona.fullName}`}
          onClick={onQuitar}
          className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <XIcon className="size-3" />
        </button>
      )}
    </span>
  );
}

/**
 * Las personas, para arrastrarlas a donde se les quiere dar acceso. Tocar una
 * la deja elegida y cada zona ofrece «Dar a…»: así se puede sin arrastrar.
 */
function PanelPersonas({
  seleccionada,
  onSeleccionar,
  conAcceso,
}: {
  seleccionada: PersonaArrastrada | null;
  onSeleccionar: (persona: PersonaArrastrada | null) => void;
  conAcceso: Set<number>;
}) {
  const [busqueda, setBusqueda] = useState('');
  const estable = useDebounced(busqueda.trim());
  const { data: filas = [], isLoading } = useAdminUsers({
    search: estable || undefined,
    is_active: true,
  });

  return (
    <Card className="lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:self-start">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UsersIcon className="size-4" /> Personas
        </CardTitle>
        <CardDescription>
          Arrastra a alguien a la app, a un rol o a un permiso para dárselo. Sin arrastrar: tócala y
          luego «Dar a…» donde quieras.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-col gap-3">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar persona…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        {seleccionada && (
          <p className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2 text-xs">
            <span className="min-w-0 flex-1">
              Elegida: <span className="font-medium">{seleccionada.fullName}</span>
            </span>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => onSeleccionar(null)}
            >
              Soltar
            </button>
          </p>
        )}
        <ul className="-mx-1 flex max-h-[55vh] flex-col gap-1 overflow-y-auto px-1 lg:max-h-none">
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => (
                <li key={i}>
                  <Skeleton className="h-12 w-full" />
                </li>
              ))
            : filas.map((fila) => {
                const persona = { id: fila.id, fullName: fila.fullName, isAdmin: fila.isAdmin };
                const elegida = seleccionada?.id === fila.id;
                const alternar = () => onSeleccionar(elegida ? null : persona);
                return (
                  <li key={fila.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      aria-pressed={elegida}
                      draggable
                      onDragStart={(evento) => {
                        evento.dataTransfer.setData(TIPO_ARRASTRE, JSON.stringify(persona));
                        evento.dataTransfer.setData('text/plain', fila.fullName);
                        evento.dataTransfer.effectAllowed = 'copy';
                      }}
                      onClick={alternar}
                      onKeyDown={(evento: KeyboardEvent) => {
                        if (evento.key === 'Enter' || evento.key === ' ') {
                          evento.preventDefault();
                          alternar();
                        }
                      }}
                      className={cn(
                        'flex cursor-grab items-center gap-2 rounded-lg border p-2 text-sm transition-colors outline-none select-none hover:bg-muted/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:cursor-grabbing',
                        elegida && 'border-primary bg-primary/5 ring-1 ring-primary/30',
                      )}
                    >
                      <GripVerticalIcon className="size-4 shrink-0 text-muted-foreground" />
                      <Avatar className={cn('size-7', fila.destacado && 'hilo-socio')}>
                        <AvatarImage src={urlFotoDe(fila)} alt="" />
                        <AvatarFallback className="text-xs">
                          {fila.firstName.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium">{fila.fullName}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {fila.position || fila.areaName || fila.email}
                        </span>
                      </span>
                      {fila.isAdmin ? (
                        <Badge variant="secondary" className="shrink-0">
                          Admin
                        </Badge>
                      ) : (
                        conAcceso.has(fila.id) && (
                          <CheckIcon
                            className="size-4 shrink-0 text-emerald-600"
                            aria-label="Ya entra a esta app"
                          />
                        )
                      )}
                    </div>
                  </li>
                );
              })}
        </ul>
      </CardContent>
    </Card>
  );
}
