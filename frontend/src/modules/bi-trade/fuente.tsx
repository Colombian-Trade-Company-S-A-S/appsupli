import { createContext, useContext, type ReactNode } from 'react';
import {
  biTradeApi,
  biTradeApiFalabella,
  biTradeApiHc,
  biTradeApiTmk,
  type AvanceMensual,
  type Campana,
  type Canal,
  type Concurso,
  type CorteDia,
  type CumplimientoDiario,
  type FiltrosAvance,
  type FiltrosConcurso,
  type FiltrosDia,
  type HojaAvance,
  type Opciones,
  type Producto,
  type PuntoVenta,
} from './api';

/** Una hoja del tablero. El orden de la lista es el de las pestañas. */
export type HojaTablero = 'mes' | 'dia' | 'tickets';

/** Los CRUD de un canal: los mismos recursos, cada canal con sus tablas. */
export type RecursosCanal = Pick<
  typeof biTradeApi,
  'ventas' | 'productos' | 'puntosVenta' | 'inventario' | 'metas'
>;

/**
 * Lo que distingue a un canal en pantalla. Lo usan la app y el enlace
 * público, para que el mismo tablero se llame igual en los dos lados.
 */
export const PERFILES: Record<
  Canal,
  { titulo: string; nombreCanal: string; hojas: HojaTablero[]; conPuntos: boolean }
> = {
  claro: {
    titulo: 'BI Claro punto de venta',
    nombreCanal: 'Claro',
    hojas: ['mes', 'dia', 'tickets'],
    conPuntos: true,
  },
  // Los canales aparte no tienen concurso de tickets ni puntos: solo el mes y
  // el día, en dinero y unidades.
  hc: {
    titulo: 'Informe de Ventas HC',
    nombreCanal: 'Homecenter',
    hojas: ['mes', 'dia'],
    conPuntos: false,
  },
  falabella: {
    titulo: 'Informe de Ventas Falabella',
    nombreCanal: 'Falabella',
    hojas: ['mes', 'dia'],
    conPuntos: false,
  },
  tmk: {
    titulo: 'Informe Tmk Ecommerce Claro',
    nombreCanal: 'Tmk Ecommerce Claro',
    hojas: ['mes', 'dia'],
    conPuntos: false,
  },
};

/**
 * De dónde salen los datos del tablero, y qué se puede hacer con ellos.
 *
 * Las hojas y los CRUD son los mismos para Claro, Homecenter, Falabella, Tmk
 * Ecommerce Claro y el enlace público: lo único que cambia es a quién le piden los datos, cómo se
 * llama el canal y si se puede sacar o editar información. Con esto las
 * páginas no se duplican; cada canal solo cambia la fuente.
 */
export interface FuenteDatos {
  /** Identifica la fuente en la caché de consultas. */
  clave: string;
  /** Sin exportar, importar, editar ni ir a los CRUD. */
  soloLectura: boolean;
  /** Ruta de la primera hoja; las otras hojas y los CRUD cuelgan de ella. */
  base: string;
  canal: Canal;
  /** Título de la primera hoja. */
  titulo: string;
  /** Cómo se nombra el canal en pantalla: «Precio Claro», «Precio Homecenter». */
  nombreCanal: string;
  hojas: HojaTablero[];
  /** Si el canal mide en puntos. Solo Claro: los demás van en dinero y unidades. */
  conPuntos: boolean;
  avanceMensual: (filtros: FiltrosAvance) => Promise<AvanceMensual>;
  cumplimientoDiario: (filtros: FiltrosDia) => Promise<CumplimientoDiario>;
  tickets: (filtros: FiltrosConcurso) => Promise<Concurso>;
  opciones: () => Promise<Opciones>;
  productos: (filtros?: Record<string, unknown>) => Promise<Producto[]>;
  puntosVenta: (filtros?: Record<string, unknown>) => Promise<PuntoVenta[]>;
  campanas: () => Promise<Campana[]>;
  exportarAvance: (filtros: FiltrosAvance, hoja?: HojaAvance) => Promise<unknown>;
  exportarDia: (filtros: FiltrosDia, corte?: CorteDia) => Promise<unknown>;
  /** Los CRUD del canal. Solo en la app: el tablero público no edita. */
  recursos?: RecursosCanal;
  /** El importador del informe del ERP. Solo Claro y Tmk Ecommerce Claro. */
  importarInforme?: typeof biTradeApi.importarInforme;
}

/** Claro, con sesión: todo habilitado. */
export const fuenteApp: FuenteDatos = {
  clave: 'app',
  soloLectura: false,
  base: '/inicio/bi-trade/claro',
  canal: 'claro',
  ...PERFILES.claro,
  avanceMensual: biTradeApi.avanceMensual,
  cumplimientoDiario: biTradeApi.cumplimientoDiario,
  tickets: biTradeApi.tickets,
  opciones: biTradeApi.opciones,
  productos: (filtros) => biTradeApi.productos.list(filtros),
  puntosVenta: (filtros) => biTradeApi.puntosVenta.list(filtros),
  campanas: () => biTradeApi.campanas.list(),
  exportarAvance: biTradeApi.avanceMensualExportar,
  exportarDia: biTradeApi.cumplimientoDiarioExportar,
  recursos: biTradeApi,
  importarInforme: biTradeApi.importarInforme,
};

/**
 * Un canal aparte, con sesión: sus propias tablas, las mismas pantallas. Sin
 * concurso de tickets: la hoja no existe, así que `tickets` nunca se pide.
 */
function fuenteDeCanal(
  canal: Exclude<Canal, 'claro'>,
  base: string,
  recursos: typeof biTradeApiHc,
): FuenteDatos {
  return {
    clave: `app-${canal}`,
    soloLectura: false,
    base,
    canal,
    ...PERFILES[canal],
    avanceMensual: recursos.avanceMensual,
    cumplimientoDiario: recursos.cumplimientoDiario,
    tickets: () => Promise.reject(new Error(`${PERFILES[canal].nombreCanal} no tiene concurso.`)),
    opciones: recursos.opciones,
    productos: (filtros) => recursos.productos.list(filtros),
    puntosVenta: (filtros) => recursos.puntosVenta.list(filtros),
    campanas: () => Promise.resolve([]),
    exportarAvance: recursos.avanceMensualExportar,
    exportarDia: recursos.cumplimientoDiarioExportar,
    recursos,
  };
}

export const fuenteHc = fuenteDeCanal('hc', '/inicio/bi-trade/ventas-hc', biTradeApiHc);

export const fuenteFalabella = fuenteDeCanal(
  'falabella',
  '/inicio/bi-trade/ventas-falabella',
  biTradeApiFalabella,
);

export const fuenteTmk: FuenteDatos = {
  ...fuenteDeCanal('tmk', '/inicio/bi-trade/ventas-tmk', biTradeApiTmk),
  importarInforme: biTradeApiTmk.importarInforme,
};

// El valor por defecto es Claro en la app: las páginas que no están dentro de
// un proveedor siguen funcionando igual que antes.
const Contexto = createContext<FuenteDatos>(fuenteApp);

export function FuenteDatosProvider({
  fuente,
  children,
}: {
  fuente: FuenteDatos;
  children: ReactNode;
}) {
  return <Contexto.Provider value={fuente}>{children}</Contexto.Provider>;
}

export const useFuente = () => useContext(Contexto);
