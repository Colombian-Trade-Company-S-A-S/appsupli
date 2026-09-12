import { HandshakeIcon, MegaphoneIcon } from 'lucide-react';

/**
 * Los planes del módulo. La portada los muestra como tarjetas y cada uno tiene
 * su página; los que siguen `enConstruccion` llevan al cartel de «muy pronto»,
 * así la ruta ya existe y después solo cambia lo que hay adentro.
 */
export const PLANES = {
  belkin: {
    titulo: 'Plan Recomiéndame Belkin',
    ruta: '/inicio/bi-trade/plan-recomiendame-belkin',
    icono: MegaphoneIcon,
    enConstruccion: true,
    descripcion: 'Este informe está en construcción. Muy pronto vas a poder verlo aquí.',
    /** Ruta del formulario de carga, si el plan ya tiene uno. */
    formulario: null,
  },
  partners: {
    titulo: 'Plan Partners',
    ruta: '/inicio/bi-trade/plan-partners',
    icono: HandshakeIcon,
    enConstruccion: false,
    descripcion:
      'Lo registrado en el formulario contra la meta del mes: por marca, regional, punto de venta y promotor.',
    formulario: '/inicio/bi-trade/plan-partners/formulario',
  },
} as const;

export type ClavePlan = keyof typeof PLANES;

export const CLAVES_PLANES = Object.keys(PLANES) as ClavePlan[];
