import { BuildingIcon } from 'lucide-react';
import {
  Badge,
  Card,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui';
import { useAreas } from '../hooks';

/**
 * Áreas de la compañía. Solo lectura: vienen de Odoo y se actualizan con la
 * sincronización de la pestaña Odoo.
 */
export function AreasTab() {
  const { data: areas = [], isLoading } = useAreas();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Las áreas vienen de Odoo: se crean y se actualizan desde la pestaña Odoo con «Sincronizar».
        Las marcadas como «Manual» se crearon antes de la integración.
      </p>

      <Card className="py-0">
        {isLoading ? (
          <div className="flex flex-col gap-3 p-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : areas.length === 0 ? (
          <Empty className="py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BuildingIcon />
              </EmptyMedia>
              <EmptyTitle>Sin áreas</EmptyTitle>
              <EmptyDescription>
                Sincroniza con Odoo para traer las áreas de la compañía.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Área</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead>Personas</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {areas.map((area) => (
                  <TableRow key={area.id}>
                    <TableCell className="font-medium">{area.name}</TableCell>
                    <TableCell>
                      <Badge variant={area.odoo ? 'secondary' : 'outline'}>
                        {area.odoo ? 'Odoo' : 'Manual'}
                      </Badge>
                    </TableCell>
                    <TableCell>{area.userCount}</TableCell>
                    <TableCell>
                      <Badge variant={area.isActive ? 'success' : 'outline'}>
                        {area.isActive ? 'Activa' : 'Inactiva'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
