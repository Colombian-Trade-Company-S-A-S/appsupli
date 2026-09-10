import { BuildingIcon, KeyRoundIcon, LayoutGridIcon, UsersIcon } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui';
import { ApplicationsTab } from '../components/ApplicationsTab';
import { AreasTab } from '../components/AreasTab';
import { RolesTab } from '../components/RolesTab';
import { UsersTab } from '../components/UsersTab';

/** Módulo de Administración: usuarios, áreas, aplicaciones y roles. */
export default function AdminPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Administración</h1>
        <p className="text-sm text-muted-foreground">
          Gestiona las personas de la compañía y qué puede hacer cada una.
        </p>
      </header>

      <Tabs defaultValue="usuarios">
        <TabsList>
          <TabsTrigger value="usuarios">
            <UsersIcon data-icon="inline-start" />
            Usuarios
          </TabsTrigger>
          <TabsTrigger value="areas">
            <BuildingIcon data-icon="inline-start" />
            Áreas
          </TabsTrigger>
          <TabsTrigger value="aplicaciones">
            <LayoutGridIcon data-icon="inline-start" />
            Aplicaciones
          </TabsTrigger>
          <TabsTrigger value="roles">
            <KeyRoundIcon data-icon="inline-start" />
            Roles
          </TabsTrigger>
        </TabsList>

        <TabsContent value="usuarios">
          <UsersTab />
        </TabsContent>
        <TabsContent value="areas">
          <AreasTab />
        </TabsContent>
        <TabsContent value="aplicaciones">
          <ApplicationsTab />
        </TabsContent>
        <TabsContent value="roles">
          <RolesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
