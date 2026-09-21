import { Link, useLocation } from 'react-router-dom';
import { ChevronDownIcon, HomeIcon, UserIcon } from 'lucide-react';
import { useAuth } from '@/core/auth';
import { env } from '@/shared/config/env';
import { iconoDeApp } from '@/shared/lib/appIcons';
import {
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

const GENERAL = [
  { label: 'Inicio', to: '/inicio', icon: HomeIcon },
  { label: 'Mi perfil', to: '/inicio/perfil', icon: UserIcon },
];

export function AppSidebar() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const applications = user?.applications ?? [];

  const close = () => isMobile && setOpenMobile(false);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link to="/inicio" />}>
              <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
                S
              </span>
              <span className="grid flex-1 text-left leading-tight">
                <span className="truncate font-semibold">{env.appName}</span>
                <span className="truncate text-xs text-muted-foreground">
                  Plataforma corporativa
                </span>
              </span>
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
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {applications.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Aplicaciones</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {applications.map((app) => {
                  const Icon = iconoDeApp(app.icon);
                  const hijos = app.children ?? [];
                  return (
                    <SidebarMenuItem key={app.code}>
                      <SidebarMenuButton
                        isActive={pathname === app.basePath}
                        tooltip={app.name}
                        onClick={close}
                        render={<Link to={app.basePath} />}
                      >
                        <Icon />
                        <span>{app.name}</span>
                        {hijos.length > 0 && (
                          <ChevronDownIcon className="ml-auto size-4 text-muted-foreground" />
                        )}
                      </SidebarMenuButton>

                      {/* Un contenedor —Supli Performance— muestra adentro sus
                          sub-módulos. Van siempre desplegados: son dos o tres y
                          esconderlos solo agrega un clic. */}
                      {hijos.length > 0 && (
                        <SidebarMenuSub>
                          {hijos.map((hijo) => (
                            <SidebarMenuSubItem key={hijo.code}>
                              <SidebarMenuSubButton
                                isActive={pathname.startsWith(hijo.basePath)}
                                onClick={close}
                                render={<Link to={hijo.basePath} />}
                              >
                                <span>{hijo.name}</span>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <span className="px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
          {applications.length} aplicaci{applications.length === 1 ? 'ón' : 'ones'}
        </span>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
