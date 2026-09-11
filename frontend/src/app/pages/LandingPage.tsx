import { Link } from 'react-router-dom';
import {
  ArrowRightIcon,
  CheckIcon,
  ChevronRightIcon,
  ShieldCheckIcon,
  UserIcon,
} from 'lucide-react';
import { env } from '@/shared/config/env';
import {
  Avatar,
  AvatarFallback,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
  Separator,
  buttonVariants,
} from '@/shared/components/ui';
import { Cuadricula } from '@/app/layouts/Marca';
import { MODULOS, VENTAJAS } from './modulosPublicos';

export default function LandingPage() {
  return (
    <>
      <Portada />
      <Modulos />
      <ComoFunciona />
      <Llamado />
    </>
  );
}

function Portada() {
  return (
    <section className="relative isolate overflow-hidden">
      <Cuadricula />
      {/* Un halo suave detrás del título: da profundidad sin meter otro color. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 left-1/2 -z-10 h-80 w-[min(56rem,100%)] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
      />

      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 py-20 sm:px-6 md:py-28 lg:grid-cols-[1.15fr_1fr]">
        <div className="flex flex-col items-start gap-6">
          <Badge variant="outline" className="gap-1.5 bg-background">
            <span className="size-1.5 rounded-full bg-primary" />
            Plataforma interna · {env.appName}
          </Badge>

          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Una sola plataforma para <span className="text-muted-foreground">todas las áreas</span>{' '}
            de la compañía.
          </h1>

          <p className="max-w-xl text-lg text-muted-foreground text-pretty">
            Evaluaciones de desempeño, tableros comerciales y administración de accesos. Con tu
            cuenta corporativa y en un solo lugar.
          </p>

          <div className="flex flex-wrap gap-3">
            <Link to="/login" className={buttonVariants({ size: 'lg' })}>
              Iniciar sesión
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
            <a href="#modulos" className={buttonVariants({ size: 'lg', variant: 'outline' })}>
              Conocer los módulos
            </a>
          </div>

          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {['Acceso por rol', 'Tu cuenta corporativa', 'Nada que instalar'].map((texto) => (
              <li key={texto} className="flex items-center gap-2">
                <CheckIcon className="size-4 text-foreground" />
                {texto}
              </li>
            ))}
          </ul>
        </div>

        <VistaPrevia />
      </div>
    </section>
  );
}

/**
 * Cómo se ve el inicio por dentro: las mismas piezas de la app (tarjeta,
 * avatar, ítems) con los módulos reales. Es ilustrativa, así que no se lee.
 */
function VistaPrevia() {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-md lg:mx-0 lg:justify-self-end">
      <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-linear-to-tr from-primary/15 via-transparent to-primary/5 blur-2xl" />

      <Card className="shadow-xl">
        <CardHeader className="flex flex-row items-center gap-3">
          <div className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-border" />
            <span className="size-2.5 rounded-full bg-border" />
            <span className="size-2.5 rounded-full bg-border" />
          </div>
          <span className="flex-1 truncate rounded-md bg-muted px-3 py-1 text-center text-xs text-muted-foreground">
            {env.appName.toLowerCase()} / inicio
          </span>
        </CardHeader>
        <Separator />
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarFallback>
                <UserIcon />
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="text-sm font-medium">Buenos días</span>
              <span className="text-xs text-muted-foreground">Estas son tus aplicaciones</span>
            </div>
          </div>

          <ItemGroup className="gap-2">
            {MODULOS.map(({ icono: Icono, titulo, corto }) => (
              <Item key={titulo} variant="outline" size="sm">
                <ItemMedia variant="icon">
                  <Icono />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{titulo}</ItemTitle>
                  <ItemDescription>{corto}</ItemDescription>
                </ItemContent>
                <ChevronRightIcon className="size-4 text-muted-foreground" />
              </Item>
            ))}
          </ItemGroup>
        </CardContent>
      </Card>

      <Card
        size="sm"
        className="absolute -bottom-6 -left-4 hidden flex-row items-center gap-3 px-4 shadow-lg sm:flex"
      >
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <ShieldCheckIcon className="size-4" />
        </span>
        <div className="flex flex-col pr-2">
          <span className="text-sm font-medium">Acceso por rol</span>
          <span className="text-xs text-muted-foreground">Cada quien ve lo suyo</span>
        </div>
      </Card>
    </div>
  );
}

function Titular({
  etiqueta,
  titulo,
  descripcion,
}: {
  etiqueta: string;
  titulo: string;
  descripcion: string;
}) {
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <span className="text-sm font-medium text-muted-foreground">{etiqueta}</span>
      <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{titulo}</h2>
      <p className="text-muted-foreground text-pretty">{descripcion}</p>
    </div>
  );
}

function Modulos() {
  return (
    <section id="modulos" className="scroll-mt-16 border-t bg-muted/40">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-20 sm:px-6">
        <Titular
          etiqueta="Módulos"
          titulo="Cada área, con su propia aplicación."
          descripcion="Entras una vez y ves solo las aplicaciones que te asignaron. Cuando una nueva área llega a la plataforma, aparece aquí."
        />

        <div className="grid gap-4 md:grid-cols-3">
          {MODULOS.map(({ icono: Icono, titulo, descripcion, puntos }) => (
            <Card key={titulo} className="transition-shadow hover:shadow-md">
              <CardHeader>
                <span className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Icono className="size-5" />
                </span>
                <CardTitle>{titulo}</CardTitle>
                <CardDescription>{descripcion}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto">
                <Separator className="mb-4" />
                <ul className="flex flex-col gap-2 text-sm">
                  {puntos.map((punto) => (
                    <li key={punto} className="flex items-center gap-2">
                      <CheckIcon className="size-4 shrink-0 text-muted-foreground" />
                      {punto}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function ComoFunciona() {
  return (
    <section id="como-funciona" className="scroll-mt-16">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.4fr]">
        <Titular
          etiqueta="Cómo funciona"
          titulo="Pensada para el día a día."
          descripcion="Lo que hace falta para trabajar con datos de la compañía sin depender de hojas sueltas ni de pedir accesos cada vez."
        />

        <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2">
          {VENTAJAS.map(({ icono: Icono, titulo, descripcion }) => (
            <div key={titulo} className="flex gap-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-background shadow-xs">
                <Icono className="size-5" />
              </span>
              <div className="flex flex-col gap-1">
                <h3 className="font-medium">{titulo}</h3>
                <p className="text-sm text-muted-foreground text-pretty">{descripcion}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Llamado() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
      <div className="relative isolate flex flex-col items-start gap-6 overflow-hidden rounded-2xl bg-primary px-6 py-12 text-primary-foreground sm:px-12 md:flex-row md:items-center md:justify-between">
        <Cuadricula invertida />
        <div className="flex max-w-xl flex-col gap-2">
          <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            ¿Ya tienes tu cuenta?
          </h2>
          <p className="text-primary-foreground/75 text-pretty">
            Entra con tu correo corporativo y la contraseña que te entregaron.
          </p>
        </div>
        <Link to="/login" className={buttonVariants({ size: 'lg', variant: 'secondary' })}>
          Iniciar sesión
          <ArrowRightIcon data-icon="inline-end" />
        </Link>
      </div>
    </section>
  );
}
