import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRightIcon,
  AtSignIcon,
  BriefcaseIcon,
  BuildingIcon,
  ChevronRightIcon,
  KeyRoundIcon,
  LayoutGridIcon,
  PhoneIcon,
  ShieldCheckIcon,
  UserRoundIcon,
  UsersIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { BotonInstalarApp } from '@/app/layouts/InstalarApp';
import { authApi, urlFotoDe, useAuth } from '@/core/auth';
import type { Application, MiembroEquipo } from '@/core/auth/types';
import { PARA_VER_USUARIOS } from '@/modules/admin/permisos';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Skeleton,
} from '@/shared/components/ui';
import { iconoDeApp } from '@/shared/lib/appIcons';
import { cn } from '@/shared/lib/utils';
import { AppearanceCard } from './AppearanceCard';
import { CambiarFoto } from './CambiarFoto';
import { ChangePasswordForm } from './ChangePasswordForm';

const TIPOS = { admin: 'Administrador', lider: 'Líder', colaborador: 'Colaborador' } as const;

/**
 * Mi perfil: quién eres, tus datos, a qué apps entras y cómo se ve la
 * plataforma. Todo va a lo ancho, en retículas parejas: nada de columnas de
 * alto distinto. Los permisos técnicos no se muestran: son de la plataforma,
 * no de la persona.
 */
export default function ProfilePage() {
  const { user } = useAuth();
  if (!user) return null;

  // Seis datos: una retícula de 3 × 2 en escritorio y 2 × 3 en tableta.
  const datos: Array<{ icon: LucideIcon; label: string; valor: string; accion?: ReactNode }> = [
    { icon: AtSignIcon, label: 'Correo', valor: user.email },
    { icon: PhoneIcon, label: 'Teléfono', valor: user.phone },
    { icon: BuildingIcon, label: 'Área', valor: user.area },
    { icon: BriefcaseIcon, label: 'Cargo', valor: user.position },
    { icon: UserRoundIcon, label: 'Jefe directo', valor: user.managerName },
    {
      icon: KeyRoundIcon,
      label: 'Inicio de sesión',
      valor: user.usaContrasena ? 'Correo y contraseña' : 'Cuenta Microsoft de Supli',
      // Solo quien entra con contraseña puede cambiarla; el resto entra con Microsoft.
      accion: user.usaContrasena ? <CambiarContrasena /> : undefined,
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      {/* Quién eres: foto, nombre y lo esencial, centrados en la misma línea. */}
      <Card className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-linear-to-br from-primary/15 via-primary/5 to-transparent"
        />
        <CardContent className="relative flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
          <CambiarFoto />
          <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 sm:items-start">
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-balance">
              {user.fullName}
            </h1>
            <p className="text-sm text-muted-foreground">
              {[user.position, user.area].filter(Boolean).join(' · ') || 'Sin cargo asignado'}
            </p>
            <div className="mt-1 flex flex-wrap justify-center gap-2 sm:justify-start">
              <Badge variant={user.isAdmin ? 'default' : 'secondary'}>
                {user.isAdmin && <ShieldCheckIcon data-icon="inline-start" />}
                {user.isAdmin ? TIPOS.admin : TIPOS[user.kind]}
              </Badge>
              {user.teamCount > 0 && <MiEquipo cantidad={user.teamCount} />}
            </div>
          </div>
          <BotonInstalarApp variante="perfil" className="shrink-0" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tu información</CardTitle>
          <CardDescription>
            Viene de Odoo. Si algo no está bien, pídele a People que lo corrija.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Celdas iguales separadas por líneas finas. */}
          <dl className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {datos.map((dato) => (
              <Dato key={dato.label} {...dato} />
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tus aplicaciones</CardTitle>
          <CardDescription>
            {user.isAdmin
              ? 'Eres administrador: entras a todas. Toca una para abrirla.'
              : 'A las que te dieron acceso. Toca una para abrirla.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {user.applications.length === 0 ? (
            <Empty className="rounded-lg border border-dashed p-6">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <LayoutGridIcon />
                </EmptyMedia>
                <EmptyTitle className="text-sm">Todavía no tienes aplicaciones</EmptyTitle>
                <EmptyDescription className="text-xs">
                  Cuando te den acceso, aparecen aquí y en el menú lateral.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            // `auto-fit`: sean dos apps o seis, reparten el ancho en partes iguales.
            <ul className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(13rem,1fr))]">
              {user.applications.map((app) => (
                <TarjetaApp key={app.code} app={app} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AppearanceCard />
    </div>
  );
}

/**
 * Una celda de la retícula: ícono, rótulo y valor, y a la derecha una acción
 * si la tiene. Lo vacío se dice, no se esconde.
 */
function Dato({
  icon: Icon,
  label,
  valor,
  accion,
}: {
  icon: LucideIcon;
  label: string;
  valor: string;
  accion?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 bg-card p-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd
          className={valor ? 'truncate text-sm font-medium' : 'text-sm text-muted-foreground'}
          title={valor || undefined}
        >
          {valor || 'Sin registrar'}
        </dd>
      </div>
      {accion}
    </div>
  );
}

/** «Cambiar» la contraseña: el formulario va en una ventana, no ocupa la página. */
function CambiarContrasena() {
  const [abierto, setAbierto] = useState(false);
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <Button variant="outline" size="sm" className="shrink-0" onClick={() => setAbierto(true)}>
        Cambiar
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cambiar contraseña</DialogTitle>
          <DialogDescription>
            Por seguridad, primero validamos tu contraseña actual.
          </DialogDescription>
        </DialogHeader>
        <ChangePasswordForm onTerminar={() => setAbierto(false)} />
      </DialogContent>
    </Dialog>
  );
}

/**
 * «N personas a cargo»: se ve como botón (borde, flecha que se mueve al pasar
 * el cursor y «Ver») y abre la lista del equipo. Quien puede ver usuarios en
 * Administración entra desde ahí al detalle de cada persona; los demás ven
 * su cargo y cómo contactarla.
 */
function MiEquipo({ cantidad }: { cantidad: number }) {
  const [abierto, setAbierto] = useState(false);
  const { can } = useAuth();
  const puedeVerDetalle = PARA_VER_USUARIOS.some(can);
  const { data: equipo = [], isLoading } = useQuery({
    queryKey: ['auth', 'mi-equipo'],
    queryFn: authApi.miEquipo,
    enabled: abierto,
  });

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="group inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/5 py-0.5 pr-1.5 pl-2.5 text-xs font-medium text-primary transition-colors outline-none hover:border-primary hover:bg-primary/10 focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <UsersIcon className="size-3.5" />
        {cantidad} persona{cantidad === 1 ? '' : 's'} a cargo
        <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 text-[0.7rem]">
          Ver
          <ChevronRightIcon className="size-3 transition-transform group-hover:translate-x-0.5" />
        </span>
      </button>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tu equipo</DialogTitle>
          <DialogDescription>
            Las personas que tienes a cargo directo, según Odoo.
            {puedeVerDetalle && ' Toca una para ver su detalle.'}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: Math.min(cantidad, 4) }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : (
          <ul className="-mx-1 flex max-h-[60vh] flex-col gap-1 overflow-y-auto px-1">
            {equipo.map((persona) => (
              <li key={persona.id}>
                <FilaEquipo persona={persona} enlace={puedeVerDetalle} />
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FilaEquipo({ persona, enlace }: { persona: MiembroEquipo; enlace: boolean }) {
  const contenido = (
    <>
      <Avatar className={cn('size-10 shrink-0', persona.destacado && 'hilo-socio')}>
        <AvatarImage src={urlFotoDe(persona)} alt="" />
        <AvatarFallback>{persona.firstName.charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{persona.fullName}</span>
        <span className="truncate text-xs text-muted-foreground">
          {[persona.position, persona.areaName].filter(Boolean).join(' · ') || 'Sin cargo'}
        </span>
      </span>
    </>
  );

  if (enlace) {
    return (
      <Link
        to={`/inicio/admin/usuarios/${persona.id}`}
        className="group flex items-center gap-3 rounded-lg border p-2.5 transition-colors outline-none hover:border-primary/40 hover:bg-muted/40 focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {contenido}
        <span className="flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground group-hover:text-primary">
          Ver detalle
          <ChevronRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-lg border p-2.5">
      {contenido}
      <span className="flex shrink-0 gap-1">
        {persona.email && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Escribirle a ${persona.fullName}`}
            render={<a href={`mailto:${persona.email}`} />}
          >
            <AtSignIcon />
          </Button>
        )}
        {persona.phone && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Llamar a ${persona.fullName}`}
            render={<a href={`tel:${persona.phone}`} />}
          >
            <PhoneIcon />
          </Button>
        )}
      </span>
    </div>
  );
}

/**
 * Una app, todas del mismo alto: ícono, nombre y una sola línea debajo (sus
 * módulos, o su descripción si no tiene). Los módulos se abren desde el menú.
 */
function TarjetaApp({ app }: { app: Application }) {
  const Icono = iconoDeApp(app.icon);
  const hijas = app.children ?? [];
  const detalle = hijas.length ? hijas.map((h) => h.name).join(' · ') : app.description;
  return (
    <li>
      <Link
        to={app.basePath}
        className="group flex h-full items-center gap-3 rounded-lg border p-3 transition-colors outline-none hover:border-primary/40 hover:bg-muted/40 focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-gradient text-white shadow-sm">
          <Icono className="size-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{app.name}</span>
          <span className="truncate text-xs text-muted-foreground" title={detalle || undefined}>
            {detalle || 'Abrir'}
          </span>
        </span>
        <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
      </Link>
    </li>
  );
}
