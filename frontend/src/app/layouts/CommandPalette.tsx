import { Fragment, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HomeIcon, LogOutIcon, SearchIcon, UserIcon } from 'lucide-react';
import { useAuth } from '@/core/auth';
import { iconoDeApp } from '@/shared/lib/appIcons';
import {
  Button,
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/shared/components/ui';
import { COMANDOS_POR_APP } from './comandos';

/** Mac usa ⌘, el resto Ctrl. Se decide una vez, no en cada render. */
const esMac =
  typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform ?? '');

export const TECLA_PALETA = esMac ? '⌘K' : 'Ctrl K';

/**
 * Paleta de comandos (Ctrl/⌘ + K).
 *
 * Reúne la navegación general, las apps de la persona y los atajos que cada
 * app declara en `comandos.ts`. Los atajos con permiso solo aparecen si el
 * usuario lo tiene, así que la paleta nunca ofrece una pantalla que le vaya a
 * responder 403.
 */
export function CommandPalette({
  abierta,
  onOpenChange,
}: {
  abierta: boolean;
  onOpenChange: (abierta: boolean) => void;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const ejecutar = useCallback(
    (accion: () => void) => {
      onOpenChange(false);
      accion();
    },
    [onOpenChange],
  );

  if (!user) return null;

  const puede = (permiso?: string) =>
    !permiso || user.isAdmin || user.permissions.includes(permiso);

  const atajosDeApps = user.applications
    .map((app) => ({
      app,
      comandos: (COMANDOS_POR_APP[app.code] ?? []).filter((c) => puede(c.permiso)),
    }))
    .filter(({ comandos }) => comandos.length > 0);

  return (
    <CommandDialog
      open={abierta}
      onOpenChange={onOpenChange}
      title="Buscar"
      description="Busca una pantalla o una acción."
    >
      <Command>
        <CommandInput placeholder="Buscar una pantalla o una acción…" />
        <CommandList>
          <CommandEmpty>Nada coincide con esa búsqueda.</CommandEmpty>

          <CommandGroup heading="General">
            <CommandItem
              keywords={['home', 'principal', 'tablero']}
              onSelect={() => ejecutar(() => navigate('/inicio'))}
            >
              <HomeIcon />
              Inicio
            </CommandItem>
            <CommandItem
              keywords={['cuenta', 'apariencia', 'tema', 'contraseña']}
              onSelect={() => ejecutar(() => navigate('/inicio/perfil'))}
            >
              <UserIcon />
              Mi perfil
            </CommandItem>
          </CommandGroup>

          {user.applications.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Aplicaciones">
                {user.applications.map((app) => {
                  const Icono = iconoDeApp(app.icon);
                  return (
                    <CommandItem
                      key={app.code}
                      keywords={[app.code, app.description]}
                      onSelect={() => ejecutar(() => navigate(app.basePath))}
                    >
                      <Icono />
                      {app.name}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </>
          )}

          {atajosDeApps.map(({ app, comandos }) => (
            <Fragment key={app.code}>
              <CommandSeparator />
              <CommandGroup heading={app.name}>
                {comandos.map((comando) => {
                  const Icono = iconoDeApp(app.icon);
                  return (
                    <CommandItem
                      key={comando.to}
                      keywords={comando.keywords}
                      onSelect={() => ejecutar(() => navigate(comando.to))}
                    >
                      <Icono />
                      {comando.label}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </Fragment>
          ))}

          <CommandSeparator />
          <CommandGroup heading="Cuenta">
            <CommandItem
              keywords={['salir', 'logout', 'desconectar']}
              onSelect={() =>
                ejecutar(() => {
                  void logout().then(() => navigate('/login', { replace: true }));
                })
              }
            >
              <LogOutIcon />
              Cerrar sesión
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

/** Atajo de teclado global: Ctrl/⌘ + K abre y cierra la paleta. */
export function usePaletaDeComandos() {
  const [abierta, setAbierta] = useState(false);

  useEffect(() => {
    const alPresionar = (evento: KeyboardEvent) => {
      if (evento.key.toLowerCase() !== 'k' || !(evento.metaKey || evento.ctrlKey)) return;
      // Ctrl+K en un navegador salta a la barra de direcciones: hay que ganarle.
      evento.preventDefault();
      setAbierta((actual) => !actual);
    };

    document.addEventListener('keydown', alPresionar);
    return () => document.removeEventListener('keydown', alPresionar);
  }, []);

  return { abierta, setAbierta };
}

/** El botón del topbar: hace visible el atajo para quien no lo conoce. */
export function BotonPaleta({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="outline"
      className="h-8 gap-2 px-2 text-muted-foreground sm:w-56 sm:justify-start"
      onClick={onClick}
      aria-label="Buscar"
    >
      <SearchIcon data-icon="inline-start" />
      <span className="hidden sm:inline">Buscar…</span>
      <CommandShortcut className="ml-auto hidden sm:inline">{TECLA_PALETA}</CommandShortcut>
    </Button>
  );
}
