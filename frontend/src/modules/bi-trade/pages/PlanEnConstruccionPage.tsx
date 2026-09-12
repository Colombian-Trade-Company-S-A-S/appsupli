import { Link } from 'react-router-dom';
import { ArrowLeftIcon, ClipboardListIcon, ConstructionIcon } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/shared/components/ui';
import { Encabezado } from '@/shared/components/layout';
import { PLANES, type ClavePlan } from '../planes';

/** La página de un plan que todavía no tiene informe. */
export default function PlanEnConstruccionPage({ plan }: { plan: ClavePlan }) {
  const { titulo, formulario } = PLANES[plan];

  return (
    <div className="flex flex-col gap-6">
      <Encabezado titulo={titulo} descripcion="Este informe todavía no está disponible.">
        <Button variant="outline" render={<Link to="/inicio/bi-trade" />}>
          <ArrowLeftIcon data-icon="inline-start" />
          Volver a BI Trade
        </Button>
        {/* El informe no está, pero la carga de datos sí puede estar abierta. */}
        {formulario && (
          <Button render={<Link to={formulario} />}>
            <ClipboardListIcon data-icon="inline-start" />
            Formulario
          </Button>
        )}
      </Encabezado>

      <Card>
        <CardContent>
          <Empty className="py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ConstructionIcon />
              </EmptyMedia>
              <EmptyTitle>En construcción</EmptyTitle>
              <EmptyDescription>
                Estamos armando el informe del {titulo}. Muy pronto vas a poder verlo aquí.
              </EmptyDescription>
            </EmptyHeader>
            {formulario && (
              <Button render={<Link to={formulario} />}>
                <ClipboardListIcon data-icon="inline-start" />
                Ir al formulario
              </Button>
            )}
          </Empty>
        </CardContent>
      </Card>
    </div>
  );
}
