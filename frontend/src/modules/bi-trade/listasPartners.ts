import { MapIcon, PackageIcon, StoreIcon } from 'lucide-react';
import type { ListaPartners } from './hooks';

/** Las listas del plan Partners: su botón en la portada del plan y su ruta. */
export const LISTAS_PARTNERS = {
  regionales: {
    titulo: 'Regionales',
    descripcion: 'Agrupan los puntos de venta en el formulario.',
    icono: MapIcon,
    ruta: 'regionales',
  },
  puntosVenta: {
    titulo: 'Puntos de venta',
    descripcion: 'Cada punto con su centro de costos y su regional.',
    icono: StoreIcon,
    ruta: 'puntos-venta',
  },
  productos: {
    titulo: 'Productos',
    descripcion: 'Los protectores que se pueden recomendar, con su precio.',
    icono: PackageIcon,
    ruta: 'productos',
  },
} as const satisfies Record<ListaPartners, unknown>;

export const ORDEN_LISTAS_PARTNERS: ListaPartners[] = ['regionales', 'puntosVenta', 'productos'];

/** De la ruta (`puntos-venta`) a la lista (`puntosVenta`). */
export const listaPartnersDeRuta = (ruta: string | undefined): ListaPartners | undefined =>
  ORDEN_LISTAS_PARTNERS.find((lista) => LISTAS_PARTNERS[lista].ruta === ruta);
