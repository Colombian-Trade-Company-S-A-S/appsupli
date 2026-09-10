import {
  AtSignIcon,
  BadgeCheckIcon,
  BriefcaseIcon,
  BuildingIcon,
  KeyRoundIcon,
  LayoutGridIcon,
  PhoneIcon,
  ShieldCheckIcon,
  UserRoundIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/core/auth';
import {
  Avatar,
  AvatarFallback,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Separator,
} from '@/shared/components/ui';
import { AppearanceCard } from './AppearanceCard';
import { ChangePasswordForm } from './ChangePasswordForm';

const KIND_LABELS = { admin: 'Admin', lider: 'Líder', colaborador: 'Colaborador' } as const;

export default function ProfilePage() {
  const { user } = useAuth();
  if (!user) return null;

  const datos = [
    { icon: AtSignIcon, label: 'Correo', valor: user.email },
    { icon: BuildingIcon, label: 'Área', valor: user.area || '—' },
    { icon: BriefcaseIcon, label: 'Cargo', valor: user.position || '—' },
    { icon: PhoneIcon, label: 'Teléfono', valor: user.phone || '—' },
    { icon: UserRoundIcon, label: 'Usuario', valor: user.username },
    { icon: BadgeCheckIcon, label: 'Tipo de usuario', valor: KIND_LABELS[user.kind] },
  ];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      {/* Identidad: una franja horizontal a todo el ancho. */}
      <Card>
        <CardContent className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
          <Avatar className="size-20 shrink-0">
            <AvatarFallback className="text-2xl">
              {user.firstName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">{user.fullName}</h1>
            <p className="text-sm text-muted-foreground">
              {user.position || '—'} · {user.area || '—'}
            </p>
          </div>
          <Badge variant={user.isAdmin ? 'default' : 'secondary'} className="sm:ml-auto">
            {user.isAdmin && <ShieldCheckIcon data-icon="inline-start" />}
            {KIND_LABELS[user.kind]}
          </Badge>
        </CardContent>

        <Separator />

        {/* 6 datos en una retícula pareja: 3 × 2 en escritorio. */}
        <CardContent className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          {datos.map((dato) => (
            <Dato key={dato.label} {...dato} />
          ))}
        </CardContent>
      </Card>

      {/* Dos tarjetas del mismo ancho y la misma altura. */}
      <div className="grid items-stretch gap-6 lg:grid-cols-2">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Accesos</CardTitle>
            <CardDescription>
              {user.isAdmin
                ? 'Eres administrador: entras a todas las aplicaciones con todos los permisos.'
                : 'Lo que te habilitó el administrador de la plataforma.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <Seccion titulo="Aplicaciones" total={user.applications.length}>
              {user.applications.length === 0 ? (
                <Vacio
                  icon={LayoutGridIcon}
                  titulo="Sin aplicaciones"
                  descripcion="Cuando te asignen un área, aparecerá aquí y en el menú lateral."
                />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {user.applications.map((app) => (
                    <Badge key={app.code} variant="secondary">
                      {app.name}
                    </Badge>
                  ))}
                </div>
              )}
            </Seccion>

            <Seccion titulo="Permisos" total={user.permissions.length}>
              {user.permissions.length === 0 ? (
                <Vacio
                  icon={KeyRoundIcon}
                  titulo="Sin permisos"
                  descripcion="Los permisos definen qué acciones puedes hacer dentro de cada app."
                />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {user.permissions.map((permission) => (
                    <Badge key={permission} variant="outline" className="font-mono">
                      {permission}
                    </Badge>
                  ))}
                </div>
              )}
            </Seccion>
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader>
            <CardTitle>Cambiar contraseña</CardTitle>
            <CardDescription>
              Por seguridad, primero validamos tu contraseña actual.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>
      </div>

      <AppearanceCard />
    </div>
  );
}

function Dato({ icon: Icon, label, valor }: { icon: LucideIcon; label: string; valor: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-col">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="truncate text-sm font-medium" title={valor}>
          {valor}
        </span>
      </div>
    </div>
  );
}

function Seccion({
  titulo,
  total,
  children,
}: {
  titulo: string;
  total: number;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {titulo}
        </h3>
        <Badge variant="outline">{total}</Badge>
      </header>
      {children}
    </section>
  );
}

function Vacio({
  icon: Icon,
  titulo,
  descripcion,
}: {
  icon: LucideIcon;
  titulo: string;
  descripcion: string;
}) {
  return (
    <Empty className="rounded-lg border border-dashed p-6">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle className="text-sm">{titulo}</EmptyTitle>
        <EmptyDescription className="text-xs">{descripcion}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
