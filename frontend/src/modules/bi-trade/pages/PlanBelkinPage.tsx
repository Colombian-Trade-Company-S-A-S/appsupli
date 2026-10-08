import { Link } from 'react-router-dom';
import { ArrowLeftIcon, ClipboardListIcon, MegaphoneIcon } from 'lucide-react';
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
import { LISTAS_BELKIN, ORDEN_LISTAS_BELKIN } from '../listasBelkin';
import { PLANES } from '../planes';

const BASE = PLANES.belkin.ruta;

/**
 * La portada del plan Recomiéndame Belkin. Arriba, como en los tableros de los
 * canales, los accesos: el formulario y cada lista que lo alimenta. Todavía no
 * tiene tablero; cuando lo tenga, va aquí abajo.
 */
export default function PlanBelkinPage() {
  return (
    <div className="flex flex-col gap-6">
      <Encabezado titulo={PLANES.belkin.titulo} descripcion={PLANES.belkin.descripcion}>
        <Button variant="outline" render={<Link to="/inicio/bi-trade" />}>
          <ArrowLeftIcon data-icon="inline-start" />
          BI Trade
        </Button>
        <Button render={<Link to={`${BASE}/formulario`} />}>
          <ClipboardListIcon data-icon="inline-start" />
          Formulario
        </Button>
        {ORDEN_LISTAS_BELKIN.map((lista) => {
          const { titulo, icono: Icono, ruta } = LISTAS_BELKIN[lista];
          return (
            <Button key={lista} variant="outline" render={<Link to={`${BASE}/listas/${ruta}`} />}>
              <Icono data-icon="inline-start" />
              {titulo}
            </Button>
          );
        })}
      </Encabezado>

      <Card>
        <CardContent>
          <Empty className="py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MegaphoneIcon />
              </EmptyMedia>
              <EmptyTitle>El tablero del plan llega pronto</EmptyTitle>
              <EmptyDescription>
                Mientras tanto, registra recomendaciones en el formulario y mantén las listas al día
                con los botones de arriba.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    </div>
  );
}
