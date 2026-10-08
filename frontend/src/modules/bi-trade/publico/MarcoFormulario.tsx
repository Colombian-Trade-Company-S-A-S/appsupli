import type { ComponentType, ReactNode } from 'react';
import {
  ClipboardListIcon,
  LightbulbIcon,
  Link2OffIcon,
  LockIcon,
  ShieldCheckIcon,
  TimerIcon,
} from 'lucide-react';
import {
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
} from '@/shared/components/ui';
import { Cuadricula } from '@/app/layouts/Marca';
import { env } from '@/shared/config/env';
import { ApiError } from '@/shared/api/http-client';

export const mensajeDeError = (error: unknown) => {
  if (error instanceof ApiError) {
    const porCampo = error.errors && Object.values(error.errors)[0]?.[0];
    return porCampo ?? error.message;
  }
  return 'No se pudo guardar. Intenta de nuevo.';
};

export interface Consejo {
  icono: ComponentType;
  titulo: string;
  texto: string;
}

/** Revocado, vencido o inventado: todos responden igual, no hay nada detrás. */
export function FormularioNoDisponible() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardContent>
          <Empty className="py-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Link2OffIcon />
              </EmptyMedia>
              <EmptyTitle>Este formulario ya no está disponible</EmptyTitle>
              <EmptyDescription>
                Lo cerraron o venció. Pide un enlace nuevo a quien te lo compartió.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * La página de un formulario abierto por enlace: portada, el formulario y lo
 * que conviene tener a mano. Cada plan pone sus textos y su formulario; el
 * marco es el mismo para que se vean y se comporten igual.
 */
export function MarcoFormulario({
  plan,
  intro,
  descripcion,
  antesDeEmpezar,
  pie,
  children,
}: {
  plan: string;
  intro: string;
  /** Lo que dice la tarjeta del formulario, debajo de su título. */
  descripcion: string;
  antesDeEmpezar: Consejo[];
  /** La última nota de la columna lateral: a quién preguntar. */
  pie: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col bg-muted/30">
      {/* Portada: dice de qué es el formulario antes de pedir el primer dato. */}
      <header className="relative isolate overflow-hidden border-b bg-background">
        <Cuadricula />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-56 w-[min(42rem,100%)] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
        />
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 sm:px-6 sm:py-10">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground [&_svg]:size-5">
              <ClipboardListIcon />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {env.appName} · Trade Marketing
              </span>
              <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{plan}</h1>
            </div>
          </div>

          <p className="max-w-2xl text-sm text-muted-foreground text-pretty">{intro}</p>

          <ul className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="gap-1.5">
              <ShieldCheckIcon className="size-3.5" />
              No necesitas cuenta ni contraseña
            </Badge>
            <Badge variant="secondary" className="gap-1.5">
              <TimerIcon className="size-3.5" />
              Menos de un minuto
            </Badge>
            <Badge variant="secondary" className="gap-1.5">
              <LockIcon className="size-3.5" />
              Solo se registra, no se consulta
            </Badge>
          </ul>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-3 py-6 sm:px-6 sm:py-8">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
          <Card>
            <CardHeader>
              <CardTitle>Nueva recomendación</CardTitle>
              <CardDescription>{descripcion}</CardDescription>
            </CardHeader>
            <CardContent>{children}</CardContent>
          </Card>

          {/* En el móvil queda debajo del formulario: primero lo que se llena. */}
          <Card className="order-last lg:sticky lg:top-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <LightbulbIcon className="size-4 text-muted-foreground" />
                Antes de empezar
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {antesDeEmpezar.map(({ icono: Icono, titulo, texto }) => (
                <div key={titulo} className="flex gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-3.5">
                    <Icono />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{titulo}</p>
                    <p className="text-xs text-muted-foreground text-pretty">{texto}</p>
                  </div>
                </div>
              ))}
              <p className="border-t pt-3 text-xs text-muted-foreground text-pretty">{pie}</p>
            </CardContent>
          </Card>
        </div>
      </main>

      <footer className="border-t bg-background">
        <div className="mx-auto max-w-5xl px-4 py-4 text-xs text-muted-foreground sm:px-6">
          {env.appName} · Colombian Trade Company
        </div>
      </footer>
    </div>
  );
}
