import { Link, useLocation } from 'react-router-dom';
import { ChevronRightIcon, HomeIcon, UserIcon } from 'lucide-react';
import { useAuth } from '@/core/auth';
import type { Application } from '@/core/auth/types';
import { iconoDeApp } from '@/shared/lib/appIcons';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from '@/shared/components/ui';
import { BotonInstalar } from './BotonInstalar';
import { IconoMarca, Logo } from './Marca';

const GENERAL = [
  { label: 'Inicio', to: '/inicio', icon: HomeIcon },
  { label: 'Mi perfil', to: '/inicio/perfil', icon: UserIcon },
];

/**
 * En qué grupo del menú va cada app, por su código y en este orden. Lo que no
 * esté aquí cae en «Aplicaciones», así una app nueva aparece sin tocar esto.
 */
const APPS_GENERALES = ['admin'];
const TRAMITES = ['supli-performance', 'supli-challenge'];

const ordenarPor = (codigos: string[]) => (a: Application, b: Application) =>
  codigos.indexOf(a.code) - codigos.indexOf(b.code);

export function AppSidebar() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();

  const close = () => isMobile && setOpenMobile(false);

  // Un sub-módulo va dentro de su app: si además llegara suelto, no se repite.
  const todas = user?.applications ?? [];
  const hijos = new Set(todas.flatMap((app) => (app.children ?? []).map((hijo) => hijo.code)));
  const apps = todas.filter((app) => !hijos.has(app.code));

  const generales = apps
    .filter((app) => APPS_GENERALES.includes(app.code))
    .sort(ordenarPor(APPS_GENERALES));
  const tramites = apps.filter((app) => TRAMITES.includes(app.code)).sort(ordenarPor(TRAMITES));
  const aplicaciones = apps.filter(
    (app) => !APPS_GENERALES.includes(app.code) && !TRAMITES.includes(app.code),
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link to="/inicio" />}>
              <IconoMarca />
              <Logo className="text-lg" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>General</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {GENERAL.map(({ label, to, icon: Icon }) => (
                <SidebarMenuItem key={to}>
                  <SidebarMenuButton
                    isActive={pathname === to}
                    tooltip={label}
                    onClick={close}
                    render={<Link to={to} />}
                  >
                    <Icon />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {generales.map((app) => (
                <ItemApp key={app.code} app={app} pathname={pathname} onNavegar={close} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <GrupoApps titulo="Trámites" apps={tramites} pathname={pathname} onNavegar={close} />
        <GrupoApps
          titulo="Aplicaciones"
          apps={aplicaciones}
          pathname={pathname}
          onNavegar={close}
        />
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <BotonInstalar />
        </SidebarMenu>
        <span className="px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
          {todas.length} aplicaci{todas.length === 1 ? 'ón' : 'ones'}
        </span>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

interface PropsItem {
  pathname: string;
  onNavegar: () => void;
}

function GrupoApps({ titulo, apps, ...props }: PropsItem & { titulo: string; apps: Application[] }) {
  if (apps.length === 0) return null;
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{titulo}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {apps.map((app) => (
            <ItemApp key={app.code} app={app} {...props} />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/**
 * Una app del menú. Si tiene sub-módulos —Supli Performance— toda la fila es
 * el botón que despliega y recoge, con la flecha a la derecha: no hay que
 * atinarle a un ícono pequeño. Arranca abierta cuando se está dentro de ella.
 *
 * Con el sidebar recogido en íconos no hay dónde desplegar, así que ahí la
 * fila vuelve a ser un enlace a la portada de la app.
 */
function ItemApp({ app, pathname, onNavegar }: PropsItem & { app: Application }) {
  const { state, isMobile } = useSidebar();
  const Icon = iconoDeApp(app.icon);
  const hijos = app.children ?? [];
  // Un sub-módulo puede vivir fuera de la ruta de su app (Valoración).
  const dentro = [app, ...hijos].some((a) => pathname.startsWith(a.basePath));
  const soloIconos = state === 'collapsed' && !isMobile;

  if (hijos.length === 0 || soloIconos) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={hijos.length === 0 ? pathname === app.basePath : dentro}
          tooltip={app.name}
          onClick={onNavegar}
          render={<Link to={app.basePath} />}
        >
          <Icon />
          <span>{app.name}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <Collapsible defaultOpen={dentro} render={<SidebarMenuItem />}>
      <CollapsibleTrigger
        render={<SidebarMenuButton tooltip={app.name} className="group/despliegue" />}
      >
        <Icon />
        <span>{app.name}</span>
        <ChevronRightIcon className="ml-auto transition-transform duration-200 group-data-[panel-open]/despliegue:rotate-90 motion-reduce:transition-none" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <SidebarMenuSub>
          {hijos.map((hijo) => (
            <SidebarMenuSubItem key={hijo.code}>
              <SidebarMenuSubButton
                isActive={pathname.startsWith(hijo.basePath)}
                onClick={onNavegar}
                render={<Link to={hijo.basePath} />}
              >
                <span>{hijo.name}</span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  );
}
