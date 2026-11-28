import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, ChevronDownIcon, LogOutIcon, UserIcon } from 'lucide-react';
import { urlFotoDe, useAuth } from '@/core/auth';
import { useAppearanceEffect } from '@/shared/hooks';
import { ErrorBoundary } from '@/shared/components/feedback';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Separator,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/shared/components/ui';
import { AppSidebar } from './AppSidebar';
import { BotonPaleta, CommandPalette, usePaletaDeComandos } from './CommandPalette';
import { AvisoInstalarApp } from './InstalarApp';
import { NavegacionMovil } from './NavegacionMovil';

/** Layout privado: sidebar + barra superior. Aquí sí se puede cambiar el tema. */
export function AppLayout() {
  useAppearanceEffect();
  const { abierta, setAbierta } = usePaletaDeComandos();
  const { pathname } = useLocation();
  // La entrada se anima al cambiar de app o de pantalla principal, no en cada
  // pestaña: la clave llega hasta el tercer tramo (/inicio/<app>/<sección>).
  const seccion = pathname.split('/').slice(0, 4).join('/');

  return (
    <SidebarProvider>
      <AppSidebar />
      <CommandPalette abierta={abierta} onOpenChange={setAbierta} />
      {/* `min-w-0`: sin él, el inset es un flex item que no se deja encoger y
          cualquier contenido ancho (una tabla, una barra de pestañas) estira
          la página entera y la mete por debajo del sidebar fijo. */}
      <SidebarInset className="min-w-0">
        <AppHeader onBuscar={() => setAbierta(true)} />
        {/* En celular deja aire abajo para la barra de navegación. */}
        <main className="min-w-0 flex-1 p-4 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-6">
          <ErrorBoundary resetKey={pathname}>
            <div key={seccion} className="animate-entrada-pagina">
              <Outlet />
            </div>
          </ErrorBoundary>
        </main>
      </SidebarInset>
      <NavegacionMovil onBuscar={() => setAbierta(true)} />
      <AvisoInstalarApp />
    </SidebarProvider>
  );
}

/** Administración y todo lo que cuelga de ella (detalle de usuarios, de apps…). */
const EN_ADMINISTRACION = /^\/inicio\/admin(\/|$)/;
const DURACION_AVISO_MS = 5000;

/**
 * Administración necesita ancho (tablas, el reparto de accesos): al entrar, el
 * menú se colapsa y, por unos segundos, se señala el botón que lo abre y lo
 * cierra. Al salir vuelve como estaba. En celular el menú ya va cerrado.
 */
function useMenuEnAdministracion() {
  const { pathname } = useLocation();
  const { open, setOpen, isMobile } = useSidebar();
  const [aviso, setAviso] = useState(false);
  // Cómo estaba el menú al entrar; null: fuera de Administración.
  const antesDeEntrar = useRef<boolean | null>(null);
  const enAdmin = EN_ADMINISTRACION.test(pathname);

  const alCambiarDeSeccion = useEffectEvent((dentro: boolean) => {
    if (isMobile) return;
    if (dentro && antesDeEntrar.current === null) {
      antesDeEntrar.current = open;
      if (open) {
        setOpen(false);
        setAviso(true);
      }
    } else if (!dentro && antesDeEntrar.current !== null) {
      if (antesDeEntrar.current) setOpen(true);
      antesDeEntrar.current = null;
      setAviso(false);
    }
  });

  // Solo al entrar o salir de Administración, no al moverse dentro de ella.
  // Un `useEffectEvent` no va en las dependencias; el plugin de lint instalado
  // todavía no lo reconoce.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => alCambiarDeSeccion(enAdmin), [enAdmin]);

  useEffect(() => {
    if (!aviso) return;
    const temporizador = window.setTimeout(() => setAviso(false), DURACION_AVISO_MS);
    return () => window.clearTimeout(temporizador);
  }, [aviso]);

  return { aviso, cerrarAviso: () => setAviso(false) };
}

function AppHeader({ onBuscar }: { onBuscar: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { aviso, cerrarAviso } = useMenuEnAdministracion();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur">
      <span className="relative flex">
        <SidebarTrigger onClick={cerrarAviso} />
        {aviso && (
          <>
            {/* Un aro que late sobre el botón… */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 animate-ping rounded-md ring-2 ring-primary motion-reduce:animate-none"
            />
            {/* …y un globo que dice para qué sirve. */}
            <span
              role="status"
              className="absolute top-1/2 left-full z-20 ml-3 flex -translate-y-1/2 animate-in items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium whitespace-nowrap text-primary-foreground shadow-lg duration-300 fade-in-0 slide-in-from-left-2"
            >
              <span
                aria-hidden
                className="absolute top-1/2 -left-1 size-2 -translate-y-1/2 rotate-45 bg-primary"
              />
              <ArrowLeftIcon className="size-3.5 motion-safe:animate-pulse" />
              Con este botón abres y cierras el menú
            </span>
          </>
        )}
      </span>
      <Separator orientation="vertical" className="mr-1 h-4" />
      <span className="hidden text-sm text-muted-foreground sm:inline">{user?.area}</span>

      <div className="ml-auto flex items-center gap-2">
        <BotonPaleta onClick={onBuscar} />
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" className="h-auto gap-2 py-1.5">
                <Avatar className="size-7">
                  <AvatarImage src={urlFotoDe(user)} alt="" />
                  <AvatarFallback>{user?.fullName.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="hidden text-left leading-tight sm:grid">
                  <span className="truncate text-sm font-medium">{user?.fullName}</span>
                  <span className="truncate text-xs text-muted-foreground">{user?.position}</span>
                </span>
                <ChevronDownIcon data-icon="inline-end" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-56">
            {/* Base UI exige que el label viva dentro de su propio grupo. */}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex items-center gap-3 py-2">
                <Avatar className="size-9">
                  <AvatarImage src={urlFotoDe(user)} alt="" />
                  <AvatarFallback>{user?.fullName.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="grid min-w-0 leading-tight">
                  <span className="truncate text-sm font-medium text-foreground">
                    {user?.fullName}
                  </span>
                  <span className="truncate text-xs font-normal">{user?.email}</span>
                </span>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => navigate('/inicio/perfil')}>
                <UserIcon />
                Mi perfil
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={handleLogout}>
                <LogOutIcon />
                Cerrar sesión
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
