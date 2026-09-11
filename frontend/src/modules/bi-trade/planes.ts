import { HandshakeIcon, MegaphoneIcon } from 'lucide-react';

/**
 * Los planes que todavía no tienen informe. La portada los muestra como
 * tarjetas y cada uno tiene su página, por ahora «en construcción»: así la
 * ruta ya existe y, cuando el informe esté, solo cambia lo que hay adentro.
 */
export const PLANES = {
  belkin: {
    titulo: 'Plan Recomiéndame Belkin',
    ruta: '/inicio/bi-trade/plan-recomiendame-belkin',
    icono: MegaphoneIcon,
  },
  partners: {
    titulo: 'Plan Partners',
    ruta: '/inicio/bi-trade/plan-partners',
    icono: HandshakeIcon,
  },
} as const;

export type ClavePlan = keyof typeof PLANES;

export const CLAVES_PLANES = Object.keys(PLANES) as ClavePlan[];
