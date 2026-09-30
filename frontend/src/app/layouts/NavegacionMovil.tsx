import { Link, useLocation } from 'react-router-dom';
import { HomeIcon, LayoutGridIcon, SearchIcon, UserIcon, type LucideIcon } from 'lucide-react';
import { useSidebar } from '@/shared/components/ui';
import { cn } from '@/shared/lib/utils';

/**
 * Barra inferior en celular, como una app nativa: el pulgar llega a todo sin
 * abrir el menú. En pantallas medianas en adelante no aparece.
 */
export function NavegacionMovil({ onBuscar }: { onBuscar: () => void }) {
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg md:hidden"
    >
      <div className="mx-auto grid h-16 max-w-md grid-cols-4">
        <Destino to="/inicio" icono={HomeIcon} activo={pathname === '/inicio'}>
          Inicio
        </Destino>
        <Accion icono={LayoutGridIcon} onClick={() => setOpenMobile(true)}>
          Apps
        </Accion>
        <Accion icono={SearchIcon} onClick={onBuscar}>
          Buscar
        </Accion>
        <Destino to="/inicio/perfil" icono={UserIcon} activo={pathname === '/inicio/perfil'}>
          Perfil
        </Destino>
      </div>
    </nav>
  );
}

const ESTILO =
  'flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors';

function Icono({ icono: Icon, activo }: { icono: LucideIcon; activo: boolean }) {
  return (
    <span
      className={cn(
        'flex h-7 w-12 items-center justify-center rounded-full transition-colors',
        activo && 'bg-brand-gradient text-white shadow-md shadow-[#5932d7]/30',
      )}
    >
      <Icon className="size-[18px]" />
    </span>
  );
}

function Destino({
  to,
  icono,
  activo,
  children,
}: {
  to: string;
  icono: LucideIcon;
  activo: boolean;
  children: string;
}) {
  return (
    <Link
      to={to}
      aria-current={activo ? 'page' : undefined}
      className={cn(ESTILO, activo ? 'text-foreground' : 'text-muted-foreground')}
    >
      <Icono icono={icono} activo={activo} />
      {children}
    </Link>
  );
}

function Accion({
  icono,
  onClick,
  children,
}: {
  icono: LucideIcon;
  onClick: () => void;
  children: string;
}) {
  return (
    <button type="button" onClick={onClick} className={cn(ESTILO, 'text-muted-foreground')}>
      <Icono icono={icono} activo={false} />
      {children}
    </button>
  );
}
