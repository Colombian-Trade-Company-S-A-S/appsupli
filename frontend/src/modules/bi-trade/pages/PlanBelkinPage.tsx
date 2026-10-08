import { Link } from 'react-router-dom';
import { ArrowLeftIcon, ClipboardListIcon } from 'lucide-react';
import { Button } from '@/shared/components/ui';
import { fuenteBelkinApp } from '../api';
import { CompartirTablero } from '../components/CompartirTablero';
import { TableroBelkin } from '../components/TableroBelkin';
import { LISTAS_BELKIN, ORDEN_LISTAS_BELKIN } from '../listasBelkin';
import { PLANES } from '../planes';

const BASE = PLANES.belkin.ruta;

/**
 * La portada del plan Recomiéndame Belkin: el tablero, con los accesos que
 * solo tiene quien entra con cuenta —el formulario, las listas y compartir—.
 * El enlace público muestra el mismo tablero sin nada de esto.
 */
export default function PlanBelkinPage() {
  return (
    <TableroBelkin
      fuente={fuenteBelkinApp}
      acciones={
        <>
          <Button variant="outline" render={<Link to="/inicio/bi-trade" />}>
            <ArrowLeftIcon data-icon="inline-start" />
            BI Trade
          </Button>
          <Button render={<Link to={`${BASE}/formulario`} />}>
            <ClipboardListIcon data-icon="inline-start" />
            Formulario
          </Button>
          <CompartirTablero
            canal="belkin_bi"
            descripcion="Un enlace de solo lectura con contraseña. Quien lo abra ve este tablero sin cuenta: sin el formulario, sin las listas del plan y sin descargar nada."
          />
          {ORDEN_LISTAS_BELKIN.map((lista) => {
            const { titulo, icono: Icono, ruta } = LISTAS_BELKIN[lista];
            return (
              <Button key={lista} variant="outline" render={<Link to={`${BASE}/listas/${ruta}`} />}>
                <Icono data-icon="inline-start" />
                {titulo}
              </Button>
            );
          })}
        </>
      }
    />
  );
}
