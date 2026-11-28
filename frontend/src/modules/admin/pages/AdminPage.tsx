import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BuildingIcon, DatabaseIcon, KeyRoundIcon, LayoutGridIcon, UsersIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui';
import { ApplicationsTab } from '../components/ApplicationsTab';
import { AreasTab } from '../components/AreasTab';
import { OdooTab } from '../components/OdooTab';
import { RolesTab } from '../components/RolesTab';
import { UsersTab } from '../components/UsersTab';
import { usePermisosAdmin } from '../permisos';

interface Pestana {
  valor: string;
  titulo: string;
  icono: LucideIcon;
  contenido: ReactNode;
  visible: boolean;
}

/**
 * Módulo de Administración: usuarios, áreas, aplicaciones, roles y la
 * integración con Odoo. El administrador ve todo; los demás, solo las
 * pestañas de los permisos que tienen.
 */
export default function AdminPage() {
  const puede = usePermisosAdmin();
  // `?pestana=aplicaciones`: al volver de un detalle se abre donde se estaba.
  const [params] = useSearchParams();

  const pestanas: Pestana[] = [
    {
      valor: 'usuarios',
      titulo: 'Usuarios',
      icono: UsersIcon,
      contenido: <UsersTab />,
      visible: puede.verUsuarios,
    },
    {
      valor: 'areas',
      titulo: 'Áreas',
      icono: BuildingIcon,
      contenido: <AreasTab />,
      visible: puede.verAreas,
    },
    {
      valor: 'aplicaciones',
      titulo: 'Aplicaciones',
      icono: LayoutGridIcon,
      contenido: <ApplicationsTab />,
      visible: puede.verApps,
    },
    {
      valor: 'roles',
      titulo: 'Roles',
      icono: KeyRoundIcon,
      contenido: <RolesTab />,
      visible: puede.verRoles,
    },
    {
      valor: 'odoo',
      titulo: 'Odoo',
      icono: DatabaseIcon,
      contenido: <OdooTab />,
      visible: puede.odoo,
    },
  ].filter((p) => p.visible);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Administración</h1>
        <p className="text-sm text-muted-foreground">
          {puede.esAdmin
            ? 'Gestiona las personas de la compañía y qué puede hacer cada una.'
            : 'Ves las secciones que te dieron. Dar accesos o volver administrador a alguien es solo de los administradores.'}
        </p>
      </header>

      {pestanas.length === 1 ? (
        pestanas[0].contenido
      ) : (
        <Tabs
          defaultValue={
            pestanas.find((p) => p.valor === params.get('pestana'))?.valor ?? pestanas[0]?.valor
          }
        >
          <TabsList>
            {pestanas.map(({ valor, titulo, icono: Icono }) => (
              <TabsTrigger key={valor} value={valor}>
                <Icono data-icon="inline-start" />
                {titulo}
              </TabsTrigger>
            ))}
          </TabsList>
          {pestanas.map(({ valor, contenido }) => (
            <TabsContent key={valor} value={valor}>
              {contenido}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
