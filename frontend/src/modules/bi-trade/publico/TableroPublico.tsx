import { Suspense, useMemo, useState, type FormEvent } from 'react';
import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LayoutDashboardIcon, Link2OffIcon, LockIcon, LogOutIcon } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  Button,
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
  Field,
  FieldGroup,
  FieldLabel,
  PasswordInput,
  Skeleton,
  Spinner,
} from '@/shared/components/ui';
import { ErrorBoundary, FullPageLoader } from '@/shared/components/feedback';
import { useForceLightTheme } from '@/shared/hooks';
import { ApiError } from '@/shared/api/http-client';
import { FuenteDatosProvider } from '../fuente';
import { crearFuentePublica, sesionPublica, tableroPublico, type SesionPublica } from './api';

/** Por qué se volvió a la puerta con una sesión que ya estaba abierta. */
type Aviso = 'vencido' | 'revocado' | null;

/**
 * El tablero compartido por enlace: sin sesión, sin sidebar y sin navbar.
 *
 * Sin contraseña muestra la puerta; con ella, las mismas tres hojas de la app
 * dentro de una fuente de datos de solo lectura. Si el servidor rechaza el
 * acceso a mitad de camino —venció, cambiaron la contraseña o revocaron el
 * enlace— se vuelve a la puerta diciendo por qué, en vez de dejar la pantalla
 * con datos viejos o un error suelto.
 *
 * Va siempre en tema claro, como el resto del sitio público: quien abre el
 * enlace no tiene una preferencia guardada.
 */
export default function TableroPublicoLayout() {
  useForceLightTheme();
  const { token = '' } = useParams();
  const queryClient = useQueryClient();
  const [sesion, setSesion] = useState<SesionPublica | null>(() => sesionPublica.leer(token));
  const [aviso, setAviso] = useState<Aviso>(null);
  const { pathname } = useLocation();

  // Un enlace del formulario no abre tableros: vive en su propia página, con
  // su propia ruta en el servidor. Si llega uno por aquí, se manda para allá.
  const esFormulario = sesion?.canal === 'partners';

  const fuente = useMemo(() => {
    if (!sesion || sesion.canal === 'partners') return null;
    return crearFuentePublica(token, sesion.acceso, sesion.canal ?? 'claro', (estado) => {
      sesionPublica.borrar(token);
      queryClient.removeQueries({ queryKey: ['publico', `publico:${token}`] });
      setAviso(estado === 404 ? 'revocado' : 'vencido');
      setSesion(null);
    });
  }, [token, sesion, queryClient]);

  if (!token) return <Navigate to="/" replace />;

  if (esFormulario) return <Navigate to={`/formulario/${encodeURIComponent(token)}`} replace />;

  if (!sesion || !fuente) {
    return (
      <PuertaClave
        token={token}
        aviso={aviso}
        onIngreso={(nueva) => {
          sesionPublica.guardar(token, nueva);
          setAviso(null);
          setSesion(nueva);
        }}
      />
    );
  }

  // Homecenter y Falabella no tienen concurso: si alguien llega a /tickets
  // con un enlace de esos canales, va a la primera hoja en vez de ver un error.
  if (!fuente.hojas.includes('tickets') && pathname.endsWith('/tickets')) {
    return <Navigate to={fuente.base} replace />;
  }

  const salir = () => {
    sesionPublica.borrar(token);
    queryClient.removeQueries({ queryKey: ['publico', fuente.clave] });
    setAviso(null);
    setSesion(null);
  };

  return (
    <FuenteDatosProvider fuente={fuente}>
      <div className="min-h-svh bg-background" data-canal={fuente.canal}>
        <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-2.5 sm:px-6">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground [&_svg]:size-4">
                <LayoutDashboardIcon />
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold">{sesion.nombre}</span>
                <span className="text-xs text-muted-foreground">
                  {fuente.nombreCanal} · solo lectura
                </span>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={salir}>
              <LogOutIcon data-icon="inline-start" />
              Salir
            </Button>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
          <ErrorBoundary>
            <Suspense fallback={<CargandoHoja />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </FuenteDatosProvider>
  );
}

function CargandoHoja() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-10 w-full" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    </div>
  );
}

/**
 * La puerta: la contraseña del enlace antes de ver cualquier dato.
 *
 * El campo desactiva mayúscula automática y autocorrección: en el celular el
 * teclado le pondría mayúscula a la primera letra, y la contraseña distingue
 * mayúsculas. Los guiones son opcionales; el servidor los ignora.
 */
function PuertaClave({
  token,
  aviso,
  onIngreso,
}: {
  token: string;
  aviso: Aviso;
  onIngreso: (sesion: SesionPublica) => void;
}) {
  const [clave, setClave] = useState('');

  const info = useQuery({
    queryKey: ['publico', 'info', token],
    queryFn: () => tableroPublico.info(token),
    retry: false,
  });

  const entrar = useMutation({
    mutationFn: () => tableroPublico.acceso(token, clave),
    onSuccess: (datos) =>
      onIngreso({ acceso: datos.acceso, nombre: datos.nombre, canal: datos.canal }),
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (clave.trim()) entrar.mutate();
  };

  if (info.isLoading) return <FullPageLoader label="Abriendo el tablero…" />;

  // Un enlace revocado o vencido no pide contraseña: no hay nada detrás.
  const noDisponible =
    aviso === 'revocado' ||
    (info.error instanceof ApiError && info.error.status === 404) ||
    (entrar.error instanceof ApiError && entrar.error.status === 404);

  return (
    <div
      className="flex min-h-svh items-center justify-center bg-muted/40 p-4"
      data-canal={info.data?.canal}
    >
      <Card className="w-full max-w-sm">
        {noDisponible ? (
          <CardContent>
            <Empty className="py-6">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Link2OffIcon />
                </EmptyMedia>
                <EmptyTitle>Este enlace ya no está disponible</EmptyTitle>
                <EmptyDescription>
                  Lo revocaron o venció. Pide un enlace nuevo a quien te lo compartió.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        ) : (
          <>
            <CardHeader>
              <span className="mb-2 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-5">
                <LockIcon />
              </span>
              <CardTitle>{info.data?.nombre ?? 'Tablero compartido'}</CardTitle>
              <CardDescription>
                Escribe la contraseña que te enviaron junto con el enlace.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} noValidate>
                <FieldGroup>
                  {aviso === 'vencido' && (
                    <Alert>
                      <AlertDescription>
                        Tu acceso venció o cambiaron la contraseña. Escríbela de nuevo.
                      </AlertDescription>
                    </Alert>
                  )}
                  <Field data-invalid={entrar.isError || undefined}>
                    <FieldLabel htmlFor="clave-tablero">Contraseña</FieldLabel>
                    <PasswordInput
                      id="clave-tablero"
                      value={clave}
                      onChange={(e) => setClave(e.target.value)}
                      placeholder="Ej. Kf7m-Qx2p-Rt9w"
                      autoComplete="off"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      autoFocus
                      aria-invalid={entrar.isError || undefined}
                    />
                    {entrar.isError && (
                      <p className="text-sm text-destructive">{mensajeDeIngreso(entrar.error)}</p>
                    )}
                  </Field>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={!clave.trim() || entrar.isPending}
                  >
                    {entrar.isPending && <Spinner data-icon="inline-start" />}
                    Ver el tablero
                  </Button>
                </FieldGroup>
              </form>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}

/** El error de la contraseña, dicho para quien la está escribiendo. */
function mensajeDeIngreso(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 403) return 'La contraseña no es correcta.';
    if (error.status === 429) return 'Demasiados intentos. Espera un minuto y vuelve a probar.';
    if (error.status === 0) return 'No hay conexión con el servidor.';
  }
  return 'No se pudo abrir el tablero. Intenta de nuevo.';
}
