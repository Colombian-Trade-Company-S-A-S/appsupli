import { Outlet } from 'react-router-dom';
import { HammerIcon, HeadsetIcon, ShoppingBagIcon } from 'lucide-react';
import type { Canal } from '../api';
import {
  FuenteDatosProvider,
  fuenteFalabella,
  fuenteHc,
  fuenteTmk,
  type FuenteDatos,
} from '../fuente';

/** Los canales que tienen su propio informe aparte del de Claro. */
type CanalAparte = Exclude<Canal, 'claro'>;

const CANALES: Record<CanalAparte, { fuente: FuenteDatos; icono: typeof HammerIcon }> = {
  hc: { fuente: fuenteHc, icono: HammerIcon },
  falabella: { fuente: fuenteFalabella, icono: ShoppingBagIcon },
  tmk: { fuente: fuenteTmk, icono: HeadsetIcon },
};

/**
 * Todo lo de un canal aparte —Homecenter, Falabella o Tmk Ecommerce Claro—:
 * el tablero y sus CRUD, con su propia fuente de datos.
 *
 * Las páginas son las mismas de Claro; lo que las vuelve de otro canal es la
 * fuente —otras tablas, otras rutas— y `data-canal`, que cambia el acento de
 * botones, pestañas y gráficas (ver `index.css`). La franja de arriba deja
 * claro en qué canal se está, que es fácil de confundir cuando las pantallas
 * se ven iguales.
 */
export default function CanalLayout({ canal }: { canal: CanalAparte }) {
  const { fuente, icono: Icono } = CANALES[canal];

  return (
    <FuenteDatosProvider fuente={fuente}>
      <div data-canal={canal} className="flex flex-col gap-4">
        <div className="flex items-center gap-2.5 rounded-lg border-l-4 border-primary bg-primary/5 px-3 py-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground [&_svg]:size-3.5">
            <Icono />
          </span>
          <span className="text-sm font-semibold">{fuente.nombreCanal}</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Canal independiente: sus propias tiendas, productos, ventas y metas.
          </span>
        </div>
        <Outlet />
      </div>
    </FuenteDatosProvider>
  );
}
