import { api } from '@/shared/api/http-client';

export type RegionalPdv = 'Zona Sur' | 'Zona Norte' | 'Plaza Claro' | 'Nacional';
export type MaterialesPdv = 'Todos los materiales' | 'Sin todos los materiales';

export interface PuntoVenta {
  idPuntoVenta: string;
  nombrePdv: string;
  regional: RegionalPdv | null;
  materiales: MaterialesPdv | null;
  ventasCount: number;
}

export interface Producto {
  idProducto: string;
  nombreProducto: string;
  marca: string;
  precioVentaClaro: number;
  precioVentaColtrade: number;
  puntaje: number | null;
  ventasCount: number;
}

export interface Venta {
  idVenta: number;
  idProducto: string;
  nombreProducto: string;
  marca: string;
  idPuntoVenta: string;
  nombrePdv: string;
  regional: string;
  fechaVenta: string;
  cantidadVendida: number;
  precioVentaColtrade: number;
  totalColtrade: number;
}

/** Una fila de cualquiera de los cortes del tablero. */
export interface Corte {
  key: string;
  label: string;
  unidades: number;
  ingresos: number;
  operaciones: number;
  participacion: number;
}

export interface Dashboard {
  filtros: { regional: string; marca: string };
  totales: {
    unidades: number;
    ingresos: number;
    operaciones: number;
    ticketPromedio: number;
    puntosVenta: number;
    productos: number;
  };
  porRegional: Corte[];
  porMarca: Corte[];
  topProductos: Corte[];
  topPuntosVenta: Corte[];
  materiales: Corte[];
  evolucion: Array<{ mes: string | null; unidades: number; ingresos: number }>;
}

export interface Opciones {
  regionales: Array<{ value: RegionalPdv; label: string }>;
  materiales: Array<{ value: MaterialesPdv; label: string }>;
  marcas: string[];
}

export interface FiltrosDashboard {
  regional?: string;
  marca?: string;
}

const RUTA = '/bi-trade';

const recurso = <T, P>(ruta: string) => ({
  list: (params?: Record<string, unknown>) => api.getList<T>(`${RUTA}${ruta}`, params),
  create: (payload: P) => api.post<T>(`${RUTA}${ruta}`, payload),
  update: (id: string | number, payload: P) => api.patch<T>(`${RUTA}${ruta}/${id}`, payload),
  remove: (id: string | number) => api.delete<void>(`${RUTA}${ruta}/${id}`),
});

export type PuntoVentaPayload = Omit<PuntoVenta, 'ventasCount'>;
export type ProductoPayload = Omit<Producto, 'ventasCount'>;
export type VentaPayload = Pick<
  Venta,
  'idProducto' | 'idPuntoVenta' | 'fechaVenta' | 'cantidadVendida'
>;

export const biTradeApi = {
  opciones: () => api.get<Opciones>(`${RUTA}/opciones`),
  dashboard: (filtros: FiltrosDashboard) =>
    api.get<Dashboard>(`${RUTA}/dashboard`, filtros as Record<string, unknown>),

  puntosVenta: recurso<PuntoVenta, Partial<PuntoVentaPayload>>('/puntos-venta'),
  productos: recurso<Producto, Partial<ProductoPayload>>('/productos'),
  ventas: recurso<Venta, Partial<VentaPayload>>('/ventas'),
};
