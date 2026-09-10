import { Suspense, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRightIcon,
  AtSignIcon,
  BuildingIcon,
  LayoutGridIcon,
  PhoneIcon,
  ShieldCheckIcon,
  UserIcon,
  UserRoundIcon,
  UsersIcon,
} from 'lucide-react';
import { useAuth } from '@/core/auth';
import { iconoDeApp } from '@/shared/lib/appIcons';
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
  Skeleton,
} from '@/shared/components/ui';
import { cn } from '@/shared/lib/utils';
import { WIDGETS_POR_APP } from './widgets';

const saludo = (hora: number) => {
  if (hora < 12) return 'Buenos días';
  if (hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
};

const TIPOS = { admin: 'Admin', lider: 'Líder', colaborador: 'Colaborador' } as const;

export default function HomePage() {
  const { user } = useAuth();
  if (!user) return null;

  const aplicaciones = user.applications;
  // Cada módulo aporta su propia tarjeta; el home solo pide las que
  // corresponden a las apps que esta persona tiene asignadas.
  const widgets = aplicaciones
    .map((app) => ({ code: app.code, Widget: WIDGETS_POR_APP[app.code] }))
    .filter((entrada): entrada is { code: string; Widget: NonNullable<typeof entrada.Widget> } =>
      Boolean(entrada.Widget),
    );

  return (
    <div className="flex flex-col gap-6">
      <Bienvenida usuario={user} />

      {/*
        Dos mitades iguales que ocupan todo el ancho, y las apps debajo. Al ser
        hermanas del mismo grid, las dos tarjetas quedan a la misma altura sin
        tener que forzar nada.
      */}
      <div className="grid gap-6 lg:grid-cols-2">
        {widgets.length > 0 && (
          <div className="grid min-w-0 gap-6 [grid-auto-rows:minmax(min-content,1fr)]">
            {widgets.map(({ code, Widget }) => (
              <Suspense key={code} fallback={<Skeleton className="h-full min-h-56 w-full" />}>
                <Widget />
              </Suspense>
            ))}
          </div>
        )}

        {/* Sin widgets la ficha se quedaría sola en media pantalla: ahí toma
            todo el ancho y reparte sus datos en columnas. */}
        <TuCuenta usuario={user} ancha={widgets.length === 0} />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Tus aplicaciones</h2>

        {aplicaciones.length === 0 ? (
          <Card>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <LayoutGridIcon />
                </EmptyMedia>
                <EmptyTitle>Todavía no hay aplicaciones</EmptyTitle>
                <EmptyDescription>
                  {user.isAdmin
                    ? 'Créalas desde Administración y asígnalas a cada persona.'
                    : 'Cuando te asignen acceso a un área, aparecerá aquí y en el menú lateral.'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </Card>
        ) : (
          // `auto-fit` en vez de un número fijo de columnas: sean dos apps o
          // siete, siempre reparten el ancho completo en partes iguales.
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(16rem,1fr))]">
            {aplicaciones.map((app) => {
              const Icono = iconoDeApp(app.icon);
              return (
                <Link key={app.code} to={app.basePath} className="group rounded-xl">
                  <Card className="h-full transition-shadow hover:ring-primary/30">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <Icono className="size-4" />
                        </span>
                        <span className="flex-1">{app.name}</span>
                        <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </CardTitle>
                      <CardDescription>{app.description}</CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

/** Saludo, reloj y quién eres: la primera cosa que se ve al entrar. */
function Bienvenida({ usuario }: { usuario: NonNullable<ReturnType<typeof useAuth>['user']> }) {
  const ahora = useReloj();

  const fecha = ahora.toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const horaMinuto = ahora.toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const segundos = String(ahora.getSeconds()).padStart(2, '0');

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-6">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar className="size-12 shrink-0">
            <AvatarFallback className="text-base font-semibold">
              {usuario.firstName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-col">
              <h1 className="truncate text-2xl font-semibold tracking-tight">
                {saludo(ahora.getHours())}, {usuario.firstName.split(' ')[0]}
              </h1>
              <p className="text-sm text-muted-foreground first-letter:uppercase">{fecha}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {usuario.position && <Badge variant="outline">{usuario.position}</Badge>}
              {usuario.area && <Badge variant="outline">{usuario.area}</Badge>}
              {usuario.isAdmin ? (
                <Badge variant="secondary">
                  <ShieldCheckIcon data-icon="inline-start" />
                  Admin
                </Badge>
              ) : (
                <Badge variant="secondary">{TIPOS[usuario.kind]}</Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end">
          <span className="flex items-baseline gap-1 font-semibold tabular-nums">
            <span className="text-4xl leading-none">{horaMinuto}</span>
            <span className="text-lg leading-none text-muted-foreground">:{segundos}</span>
          </span>
          <span className="text-xs text-muted-foreground">Hora local</span>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * La hora, al segundo.
 *
 * Vive en su propio componente para que el tic no vuelva a renderizar el resto
 * del home cada segundo.
 */
function useReloj() {
  const [ahora, setAhora] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return ahora;
}

function TuCuenta({
  usuario,
  ancha,
}: {
  usuario: NonNullable<ReturnType<typeof useAuth>['user']>;
  ancha: boolean;
}) {
  return (
    <Card className={cn('h-full', ancha && 'lg:col-span-2')}>
      <CardHeader>
        <CardTitle>Tu cuenta</CardTitle>
        <CardDescription>Si algo está desactualizado, avísale al área de People.</CardDescription>
      </CardHeader>
      {/* `justify-between` reparte el sobrante: el enlace baja al pie de la
          tarjeta en vez de dejar un hueco debajo. */}
      <CardContent className="flex flex-1 flex-col justify-between gap-4">
        <div className={cn('grid gap-3 sm:grid-cols-2', ancha && 'lg:grid-cols-3')}>
          <Dato icono={<AtSignIcon />} etiqueta="Correo" valor={usuario.email} />
          <Dato icono={<BuildingIcon />} etiqueta="Área" valor={usuario.area || '—'} />
          <Dato icono={<UserRoundIcon />} etiqueta="Cargo" valor={usuario.position || '—'} />
          <Dato
            icono={<UsersIcon />}
            etiqueta="Jefe directo"
            valor={usuario.managerName || 'Sin jefe asignado'}
          />
          {usuario.teamCount > 0 && (
            <Dato
              icono={<UsersIcon />}
              etiqueta="A tu cargo"
              valor={`${usuario.teamCount} persona${usuario.teamCount === 1 ? '' : 's'}`}
            />
          )}
          {usuario.phone && (
            <Dato icono={<PhoneIcon />} etiqueta="Teléfono" valor={usuario.phone} />
          )}
        </div>

        <div className="flex flex-col gap-3">
          <Separator />
          <Link
            to="/inicio/perfil"
            className="inline-flex items-center gap-2 text-sm font-medium hover:underline"
          >
            <UserIcon className="size-4" />
            Editar mi perfil y apariencia
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function Dato({
  icono,
  etiqueta,
  valor,
}: {
  icono: React.ReactNode;
  etiqueta: string;
  valor: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-muted-foreground [&>svg]:size-4">{icono}</span>
      <div className="flex min-w-0 flex-col">
        <span className="text-xs text-muted-foreground">{etiqueta}</span>
        <span className="truncate text-sm">{valor}</span>
      </div>
    </div>
  );
}
