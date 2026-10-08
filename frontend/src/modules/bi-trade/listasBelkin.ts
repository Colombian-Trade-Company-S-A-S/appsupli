import { MapIcon, PackageIcon, StoreIcon, TagsIcon, UsersRoundIcon } from 'lucide-react';
import type { ListaBelkin } from './hooks';

/** Las listas del plan Belkin: su tarjeta en el panel y su ruta. */
export const LISTAS_BELKIN = {
  regionales: {
    titulo: 'Regionales',
    descripcion: 'Agrupan los puntos de venta en el formulario: Zona Norte, Zona Sur…',
    icono: MapIcon,
    ruta: 'regionales',
  },
  puntosVenta: {
    titulo: 'Puntos de venta',
    descripcion:
      'Cada punto con su centro de costos, su regional y su categoría del bono. Sin regional es fuera de Coltrade: lo suyo llega del informe de ventas.',
    icono: StoreIcon,
    ruta: 'puntos-venta',
  },
  asesores: {
    titulo: 'Asesores Apple',
    descripcion: 'Los asesores de cada punto. Un punto puede tener varios.',
    icono: UsersRoundIcon,
    ruta: 'asesores',
  },
  categorias: {
    titulo: 'Categorías',
    descripcion: 'Agrupan los productos: Case Apple, Lámina, Cable, Cargador…',
    icono: TagsIcon,
    ruta: 'categorias',
  },
  productos: {
    titulo: 'Productos',
    descripcion: 'Cada producto con su código y su categoría.',
    icono: PackageIcon,
    ruta: 'productos',
  },
} as const satisfies Record<ListaBelkin, unknown>;

export const ORDEN_LISTAS_BELKIN: ListaBelkin[] = [
  'regionales',
  'puntosVenta',
  'asesores',
  'categorias',
  'productos',
];

/** De la ruta (`puntos-venta`) a la lista (`puntosVenta`). */
export const listaDeRuta = (ruta: string | undefined): ListaBelkin | undefined =>
  ORDEN_LISTAS_BELKIN.find((lista) => LISTAS_BELKIN[lista].ruta === ruta);
