import { Navigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ClipboardListIcon,
  LightbulbIcon,
  Link2OffIcon,
  LockIcon,
  ScanBarcodeIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  TimerIcon,
} from 'lucide-react';
import { toast } from 'sonner';
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
import { FullPageLoader } from '@/shared/components/feedback';
import { Cuadricula } from '@/app/layouts/Marca';
import { useForceLightTheme } from '@/shared/hooks';
import { env } from '@/shared/config/env';
import { ApiError } from '@/shared/api/http-client';
import type { RegistroPartnerPayload } from '../api';
import { FormularioRecomendacion } from '../components/FormularioRecomendacion';
import { formularioPublico } from './api';

const mensajeDeError = (error: unknown) => {
  if (error instanceof ApiError) {
    const porCampo = error.errors && Object.values(error.errors)[0]?.[0];
    return porCampo ?? error.message;
  }
  return 'No se pudo guardar. Intenta de nuevo.';
};

/** Lo que conviene tener a mano antes de empezar. Son tres, a propósito. */
const ANTES_DE_EMPEZAR = [
  {
    icono: SmartphoneIcon,
    titulo: 'El equipo del cliente',
    texto: 'Necesitas la marca y el protector que quedó instalado.',
  },
  {
    icono: ScanBarcodeIcon,
    titulo: 'El serial',
    texto: 'Cópialo completo, tal como aparece. Cada serial se registra una sola vez.',
  },
  {
    icono: ClipboardListIcon,
    titulo: 'La factura y tu documento',
    texto: 'Con eso se valida el registro cuando se liquida el plan.',
  },
];

/**
 * El formulario del plan Partners abierto por enlace, sin cuenta y sin clave.
 *
 * Quien entra solo puede diligenciar: es el mismo componente de formulario de
 * la app, pero sin nada alrededor —ni registros cargados, ni listas, ni
 * tableros—, porque esta página no tiene con qué pedirlos. Va en tema claro,
 * como el resto de lo público.
 */
export default function FormularioPublico() {
  useForceLightTheme();
  const { token = '' } = useParams();

  const opciones = useQuery({
    queryKey: ['formulario-publico', token, 'opciones'],
    queryFn: () => formularioPublico.opciones(token),
    retry: false,
    enabled: !!token,
  });

  const guardar = useMutation({
    mutationFn: (payload: RegistroPartnerPayload) => formularioPublico.registrar(token, payload),
    onSuccess: (registro) => toast.success(registro.message ?? 'Registro guardado'),
    onError: (error) => toast.error(mensajeDeError(error)),
  });

  if (!token) return <Navigate to="/" replace />;
  if (opciones.isLoading) return <FullPageLoader label="Abriendo el formulario…" />;

  // Revocado, vencido o inventado: todos responden igual, no hay nada detrás.
  if (opciones.error) {
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
              <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
                Plan Partners
              </h1>
            </div>
          </div>

          <p className="max-w-2xl text-sm text-muted-foreground text-pretty">
            Registra aquí cada protector recomendado. Toma menos de un minuto y al guardar puedes
            seguir de una con el siguiente equipo.
          </p>

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
              <CardDescription>
                Son tres pasos cortos. Todos los campos son obligatorios.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormularioRecomendacion
                opciones={opciones.data}
                guardando={guardar.isPending}
                onEnviar={(payload) => guardar.mutateAsync(payload)}
              />
            </CardContent>
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
              {ANTES_DE_EMPEZAR.map(({ icono: Icono, titulo, texto }) => (
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
              <p className="border-t pt-3 text-xs text-muted-foreground text-pretty">
                ¿Algo no cuadra —tu punto de venta no aparece, el serial ya estaba registrado—?
                Escríbele a quien te compartió el enlace.
              </p>
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
