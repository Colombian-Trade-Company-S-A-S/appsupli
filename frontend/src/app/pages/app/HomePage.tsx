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
import { aplanarApps, useAuth } from '@/core/auth';
import { iconoDeApp } from '@/shared/lib/appIcons';
import {
  Avatar,
  AvatarFallback,
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
import { Kpi } from '@/shared/components/layout';
import { cn } from '@/shared/lib/utils';
import { BotonInstalarApp } from '@/app/layouts/InstalarApp';
import { Cuadricula } from '@/app/layouts/Marca';
import { KPIS_POR_APP, WIDGETS_POR_APP } from './widgets';

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
  // Contenedores y sub-módulos: una tarjeta o un indicador puede venir de
  // cualquiera de los dos (la de Valoración vive dentro de Supli Performance).
  const todas = aplanarApps(aplicaciones);
  // Cada módulo aporta su propia tarjeta; el home solo pide las que
  // corresponden a las apps que esta persona tiene asignadas.
  const widgets = todas
    .map((app) => ({ code: app.code, Widget: WIDGETS_POR_APP[app.code] }))
    .filter((entrada): entrada is { code: string; Widget: NonNullable<typeof entrada.Widget> } =>
      Boolean(entrada.Widget),
    );

  const kpis = todas
    .map(({ code }) => ({ code, Kpis: KPIS_POR_APP[code] }))
    .filter((entrada): entrada is { code: string; Kpis: NonNullable<typeof entrada.Kpis> } =>
      Boolean(entrada.Kpis),
    );

  return (
    <div className="flex flex-col gap-6">
      <Bienvenida usuario={user} />

      <section
        aria-label="Tus indicadores"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <Kpi
          label="Tus aplicaciones"
          value={aplicaciones.length}
          hint="Las que tienes asignadas"
          extra={<LayoutGridIcon className="size-4 text-muted-foreground" />}
        />
        {user.teamCount > 0 && (
          <Kpi
            label="A tu cargo"
            value={user.teamCount}
            hint={`Persona${user.teamCount === 1 ? '' : 's'} en tu equipo`}
            extra={<UsersIcon className="size-4 text-muted-foreground" />}
          />
        )}
        {kpis.map(({ code, Kpis }) => (
          <Suspense key={code} fallback={<Skeleton className="h-28 w-full rounded-xl" />}>
            <Kpis />
          </Suspense>
        ))}
      </section>

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
                  <Card className="relative h-full overflow-hidden transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-lg group-hover:shadow-primary/15 group-hover:ring-primary/40 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
                    {/* Línea de luz celeste que se enciende al pasar el mouse. */}
                    <span
                      aria-hidden
                      className="absolute inset-x-6 top-0 h-px bg-linear-to-r from-transparent via-[#83e6ff] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    />
                    <CardHeader>
                      <CardTitle className="flex items-center gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-md shadow-[#5932d7]/30 transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none">
                          <Icono className="size-5" />
                        </span>
                        <span className="flex-1">{app.name}</span>
                        <ArrowRightIcon className="size-4 shrink-0 -translate-x-1 text-primary opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
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
    // El hero va siempre en azul noche, en claro y en oscuro: es la portada
    // de la app y lleva la firma visual del brandbook.
    <section className="relative isolate overflow-hidden rounded-2xl bg-[#0a0818] px-6 py-7 text-white ring-1 ring-white/10 sm:px-8">
      <Cuadricula invertida />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 -z-10 size-72 rounded-full bg-[#3b6dff]/35 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-28 -left-20 -z-10 size-72 rounded-full bg-[#5932d7]/45 blur-3xl"
      />

      <div className="flex flex-wrap items-center justify-between gap-6">
        <div className="flex min-w-0 items-center gap-4">
          <span className="hidden shrink-0 rounded-full bg-brand-gradient p-0.5 shadow-lg shadow-[#5932d7]/40 sm:inline-flex">
            <Avatar className="size-14 shrink-0 ring-2 ring-[#0a0818]">
              <AvatarFallback className="bg-[#14102e] font-heading text-lg font-bold text-white">
                {usuario.firstName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </span>

          <div className="flex min-w-0 flex-col gap-2.5">
            <div className="flex flex-col gap-0.5">
              <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">
                {saludo(ahora.getHours())},{' '}
                <span className="bg-linear-to-r from-[#a66bff] to-[#83e6ff] bg-clip-text text-transparent">
                  {usuario.firstName.split(' ')[0]}
                </span>
              </h1>
              <p className="text-sm text-white/65 first-letter:uppercase">{fecha}</p>
            </div>

            <BotonInstalarApp variante="inicio" className="self-start" />

            <div className="flex flex-wrap items-center gap-2">
              {usuario.position && <Chip>{usuario.position}</Chip>}
              {usuario.area && <Chip>{usuario.area}</Chip>}
              {usuario.isAdmin ? (
                <Chip destacado>
                  <ShieldCheckIcon className="size-3" />
                  Admin
                </Chip>
              ) : (
                <Chip destacado>{TIPOS[usuario.kind]}</Chip>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end">
          <span className="flex items-baseline gap-1 font-heading font-semibold tabular-nums">
            <span className="text-4xl leading-none sm:text-5xl">{horaMinuto}</span>
            <span className="text-lg leading-none text-[#83e6ff]">:{segundos}</span>
          </span>
          <span className="mt-1 text-xs text-white/55">Hora local</span>
        </div>
      </div>
    </section>
  );
}

/** Insignia del hero: translúcida sobre el azul noche. */
function Chip({ children, destacado = false }: { children: React.ReactNode; destacado?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        destacado
          ? 'border-[#a66bff]/40 bg-[#a66bff]/15 text-[#d9c2ff]'
          : 'border-white/15 bg-white/5 text-white/85',
      )}
    >
      {children}
    </span>
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
