import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDownIcon, LogOutIcon, UserIcon } from 'lucide-react';
import { useAuth } from '@/core/auth';
import { useAppearanceEffect } from '@/shared/hooks';
import { ErrorBoundary } from '@/shared/components/feedback';
import {
  Avatar,
  AvatarFallback,
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
          <ErrorBoundary>
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

function AppHeader({ onBuscar }: { onBuscar: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur">
      <SidebarTrigger />
      <Separator orientation="vertical" className="mr-1 h-4" />
      <span className="hidden text-sm text-muted-foreground sm:inline">{user?.area}</span>

      <div className="ml-auto flex items-center gap-2">
        <BotonPaleta onClick={onBuscar} />
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" className="h-auto gap-2 py-1.5">
                <Avatar className="size-7">
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
              <DropdownMenuLabel>{user?.email}</DropdownMenuLabel>
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
