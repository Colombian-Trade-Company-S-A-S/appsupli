import { ApiError, api, httpClient } from '@/shared/api/http-client';

export type RegionalPdv = 'Zona Sur' | 'Zona Norte' | 'Plaza Claro' | 'Nacional';
export type MaterialesPdv = 'Todos los materiales' | 'Sin todos los materiales';
export type CategoriaHc = 'A' | 'B' | 'C';

export interface PuntoVenta {
  idPuntoVenta: string;
  nombrePdv: string;
  regional: RegionalPdv | null;
  materiales: MaterialesPdv | null;
  /** Solo Homecenter. */
  categoria?: CategoriaHc | null;
  ventasCount: number;
}

export interface Producto {
  idProducto: string;
  /** Solo Homecenter: su catálogo trae EAN y SKU Coltrade. */
  ean?: string | null;
  skuColtrade?: string | null;
  nombreProducto: string;
  /** En Homecenter la marca y los precios pueden faltar. */
  marca: string | null;
  precioVentaClaro: number | null;
  precioVentaColtrade: number | null;
  puntaje: number | null;
  ventasCount: number;
}

export interface Venta {
  idVenta: number;
  idProducto: string;
  nombreProducto: string;
  marca: string | null;
  idPuntoVenta: string;
  nombrePdv: string;
  regional: string;
  fechaVenta: string;
  cantidadVendida: number;
  precioVentaColtrade: number | null;
  totalColtrade: number | null;
}

export interface Inventario {
  idInventario: number;
  idProducto: string;
  nombreProducto: string;
  marca: string | null;
  idPuntoVenta: string;
  nombrePdv: string;
  regional: string;
  cantidadInventario: number;
}

export interface MetaComercial {
  idMeta: number;
  idProducto: string;
  nombreProducto: string;
  marca: string | null;
  idPuntoVenta: string;
  nombrePdv: string;
  regional: string;
  fechaMeta: string;
  metaCantidad: number;
  /** Del producto. Se manda de vuelta para poder mostrar el cálculo. */
  precioVentaColtrade: number | null;
  puntaje: number;
  /** Calculados en el backend: unidades × precio y unidades × puntaje. */
  metaDinero: number | null;
  metaPuntos: number;
}

/** Una fila del cumplimiento: lo real, la meta y el % de cada medida. */
export interface FilaCumplimiento {
  key: string;
  label: string;
  realCantidad: number;
  realDinero: number;
  realPuntos: number;
  metaCantidad: number;
  metaDinero: number;
  metaPuntos: number;
  cumplimientoCantidad: number;
  cumplimientoDinero: number;
  cumplimientoPuntos: number;
  inventario: number;
}

export interface Cumplimiento {
  filtros: { regional: string; marca: string; desde: string; hasta: string };
  totales: {
    realCantidad: number;
    realDinero: number;
    realPuntos: number;
    metaCantidad: number;
    metaDinero: number;
    metaPuntos: number;
    cumplimientoCantidad: number;
    cumplimientoDinero: number;
    cumplimientoPuntos: number;
    inventarioUnidades: number;
    inventarioRegistros: number;
    cobertura: number;
  };
  porPuntoVenta: FilaCumplimiento[];
  porMarca: FilaCumplimiento[];
  porProducto: FilaCumplimiento[];
}

/** Un día del mes en la serie del avance. */
export interface DiaAvance {
  dia: number;
  fecha: string;
  /** Falso en domingos y festivos: esos días no entran en el reparto. */
  habil: boolean;
  metaDiaria: number;
  ventas: number;
  cantidad: number;
  cumplimiento: number;
  ventasAcumuladas: number;
  metaAcumulada: number;
}

/** Una fila de las tablas de avance: la meta del mes contra lo vendido. */
export interface FilaAvance {
  key: string;
  label: string;
  metaMensual: number;
  importe: number;
  cantidad: number;
  inventario: number;
  cumplimiento: number;
}

export interface AvanceMensual {
  periodo: {
    anio: number;
    mes: number;
    /** `AAAA-MM`, el mismo formato de un `<input type="month">`. */
    valor: string;
    diasDelMes: number;
    diasHabiles: number;
    domingos: number;
    festivos: string[];
  };
  filtros: { regional: string; marca: string };
  totales: {
    metaDinero: number;
    metaCantidad: number;
    metaDiaria: number;
    ventasDinero: number;
    ventasCantidad: number;
    cumplimiento: number;
    inventarioUnidades: number;
  };
  serie: DiaAvance[];
  porRegional: FilaAvance[];
  porPuntoVenta: FilaAvance[];
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
  /** Solo Homecenter. */
  categorias?: Array<{ value: CategoriaHc; label: string }>;
}

export interface FiltrosDashboard {
  regional?: string;
  marca?: string;
  /** En snake_case: es un parámetro de la query, no un campo del JSON. */
  id_punto_venta?: string;
}

/** El cumplimiento además se puede acotar a un periodo. */
export interface FiltrosCumplimiento extends FiltrosDashboard {
  desde?: string;
  hasta?: string;
}

/**
 * El avance se mide sobre un mes entero, no sobre un rango.
 *
 * La meta es mensual: un corte de «15 de marzo a 20 de abril» no tendría
 * contra qué medirse, así que aquí se pide año y mes.
 */
export interface FiltrosAvance extends FiltrosDashboard {
  anio: number;
  mes: number;
}

/** Qué bloque del tablero baja en el .xlsx. Sin `hoja`, bajan los tres. */
export type HojaAvance = 'serie' | 'regional' | 'puntos';

/**
 * Qué hacer con las ventas del mes que ya están cargadas.
 *
 * `completar` respeta los días que ya tienen ventas y llena los vacíos;
 * `sobrescribir` borra el mes y deja lo que traiga el archivo.
 */
export type ModoImportacion = 'completar' | 'sobrescribir';

/** Un día del querie de ventas que ya tenía ventas cargadas. */
export interface DiaConVentas {
  fecha: string;
  registros: number;
}

/** Lo que devuelve el querie de ventas de Homecenter cuando carga. */
export interface ResultadoQueryVentas {
  dias: string[];
  filasLeidas: number;
  sinUnidades: number;
  sinTienda: number;
  sinProducto: number;
  sinPuntoVenta: number;
  productosFaltantes: string[];
  puntosFaltantes: string[];
  creadas: number;
  unidades: number;
  eliminadas: number;
  message: string;
}

/**
 * El querie de ventas carga, o se detiene porque algún día ya tenía ventas.
 * Lo segundo no es un error: es la pregunta de si sobrescribir esos días.
 */
export type RespuestaQueryVentas =
  | { conflicto: false; resultado: ResultadoQueryVentas }
  | { conflicto: true; diasConVentas: DiaConVentas[]; message: string };

/** Lo que devuelve el querie de inventario de Homecenter. */
export interface ResultadoQuery {
  /** El día que se cargó: el más reciente del archivo. */
  fecha: string;
  fechasEnArchivo: string[];
  filasDelDia: number;
  deOtrosDias: number;
  sinUnidades: number;
  sinTienda: number;
  sinProducto: number;
  sinPuntoVenta: number;
  productosFaltantes: string[];
  puntosFaltantes: string[];
  creados: number;
  unidades: number;
  eliminados: number;
  message: string;
}

/** Lo que responde la importación del informe del ERP. */
export interface ResultadoInforme {
  periodo: string;
  modo: ModoImportacion;
  ventas: {
    creadas: number;
    unidades: number;
    eliminadas: number;
    filasLeidas: number;
    fueraDelMes: number;
    sinProducto: number;
    sinPuntoVenta: number;
    omitidasPorDia: number;
    diasCargados: string[];
    diasRespetados: string[];
  };
  inventario: {
    creados: number;
    unidades: number;
    eliminados: number;
    filasLeidas: number;
    sinProducto: number;
    sinPuntoVenta: number;
    reemplazado: boolean;
  };
  message: string;
}

/**
 * Totales de un listado.
 *
 * Salen de un endpoint aparte, no de sumar la página en el navegador: la tabla
 * muestra 15 filas y estas cifras tienen que cubrir los miles de registros que
 * pasan el filtro.
 */
export interface ResumenVentas {
  registros: number;
  unidades: number;
  ingresos: number;
  puntos: number;
  productos: number;
  puntosVenta: number;
}

export interface ResumenInventario {
  registros: number;
  unidades: number;
  valorizadoTotal: number;
  agotados: number;
  productos: number;
  puntosVenta: number;
}

export interface ResumenMetas {
  registros: number;
  metaCantidad: number;
  metaDinero: number;
  metaPuntos: number;
  productos: number;
  puntosVenta: number;
}

/** Una fila del cumplimiento de un día: lo real contra la cuota del día. */
export interface FilaDia {
  key: string;
  label: string;
  realDinero: number;
  realCantidad: number;
  realPuntos: number;
  metaDinero: number;
  metaCantidad: number;
  metaPuntos: number;
  /** La meta del mes de donde salió la cuota, para poder rastrearla. */
  metaMensualDinero: number;
  cumplimientoDinero: number;
  cumplimientoCantidad: number;
  cumplimientoPuntos: number;
}

export interface CumplimientoDiario {
  dia: {
    fecha: string;
    anio: number;
    mes: number;
    dia: number;
    /** «martes 8 de septiembre de 2026». */
    nombre: string;
    habil: boolean;
    esDomingo: boolean;
    esFestivo: boolean;
    diasDelMes: number;
    diasHabiles: number;
    /** Los días del mes que no son hábiles, para marcarlos en el selector. */
    diasNoHabiles: number[];
  };
  filtros: { regional: string; marca: string; idProducto: string; idPuntoVenta: string };
  totales: {
    realDinero: number;
    realCantidad: number;
    realPuntos: number;
    operaciones: number;
    metaDinero: number;
    metaCantidad: number;
    metaPuntos: number;
    metaMensualDinero: number;
    metaMensualCantidad: number;
    metaMensualPuntos: number;
    cumplimientoDinero: number;
    cumplimientoCantidad: number;
    cumplimientoPuntos: number;
  };
  porRegional: FilaDia[];
  porPuntoVenta: FilaDia[];
  porMarca: FilaDia[];
  porProducto: FilaDia[];
}

/** Los cortes por los que se puede desglosar el día. */
export type CorteDia = 'regional' | 'puntos' | 'marcas' | 'productos';

/**
 * El cumplimiento diario se mira sobre un día, no sobre un rango.
 *
 * La cuota con la que se compara es la del día, así que un corte de varios
 * días no tendría contra qué medirse.
 */
export interface FiltrosDia {
  fecha: string;
  regional?: string;
  marca?: string;
  id_producto?: string;
  id_punto_venta?: string;
}

/** Un tramo de la escala diaria: tantas ventas, tantos tickets. */
export interface EscalaTicket {
  idEscala?: number;
  ventas: number;
  tickets: number;
}

/** Un tramo del acelerador: al pasar el total, tantos tickets por día cumplido. */
export interface Acelerador {
  idAcelerador?: number;
  ventasTotales: number;
  ticketsPorDia: number;
}

/**
 * Las reglas del concurso.
 *
 * Son datos y no código porque cambian en cada campaña: fechas, escalas,
 * umbrales y qué productos dan premio.
 */
export interface Campana {
  idCampana: number;
  nombre: string;
  desde: string;
  hasta: string;
  activa: boolean;
  ventasMinimas: number;
  ticketsMinimos: number;
  /** Códigos de los productos que dan doble ticket (Bluelight, Privacy…). */
  productosFoco: string[];
  focoMinimo: number;
  productosCargador: string[];
  bonoVentas: number;
  bonoCargadores: number;
  bonoTickets: number;
  escalas: EscalaTicket[];
  aceleradores: Acelerador[];
  /** Días de vigencia, contando los dos extremos. */
  dias: number;
}

export type CampanaPayload = Omit<Campana, 'idCampana' | 'dias'>;

/** Un día de un punto de venta dentro del concurso. */
export interface DiaTicket {
  fecha: string;
  unidades: number;
  foco: number;
  cargador: number;
  ticketsEscala: number;
  ticketsBono: number;
  duplicado: boolean;
  cumplido: boolean;
}

/** El acumulado de un punto de venta en el concurso. */
export interface FilaTicket {
  key: string;
  label: string;
  regional: string;
  unidades: number;
  unidadesFoco: number;
  unidadesCargador: number;
  diasConVenta: number;
  diasCumplidos: number;
  diasDuplicados: number;
  ticketsEscala: number;
  ticketsBono: number;
  ticketsAcelerador: number;
  aceleradorAlcanzado: number;
  tickets: number;
  cumpleVentas: boolean;
  cumpleTickets: boolean;
  participa: boolean;
  faltanVentas: number;
  dias: DiaTicket[];
}

export interface Concurso {
  campana: Campana | null;
  vigente?: boolean;
  totales: {
    puntosVenta?: number;
    participantes?: number;
    tickets?: number;
    ticketsParticipantes?: number;
    unidades?: number;
    diasCumplidos?: number;
  };
  filas: FilaTicket[];
  message?: string;
}

/** El concurso se mira por campaña, con los mismos cortes del resto del BI. */
export interface FiltrosConcurso extends FiltrosDashboard {
  campana?: number;
}

const RUTA = '/bi-trade';

/** Lo que responde el importador cuando todo salió bien. */
export interface ResultadoImportacion {
  created: number;
  updated: number;
  message: string;
}

/**
 * Dispara la descarga de un archivo que devuelve la API.
 *
 * Va por el cliente HTTP y no por un enlace directo: la descarga necesita la
 * cabecera `Authorization`, que un `<a href>` no lleva.
 */
async function descargarArchivo(
  url: string,
  nombrePorDefecto: string,
  params?: Record<string, unknown>,
) {
  const respuesta = await httpClient.get(url, { responseType: 'blob', params });
  const cabecera = String(respuesta.headers['content-disposition'] ?? '');
  const nombre = /filename="?([^"]+)"?/.exec(cabecera)?.[1] ?? nombrePorDefecto;

  const objeto = URL.createObjectURL(respuesta.data as Blob);
  const enlace = document.createElement('a');
  enlace.href = objeto;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(objeto);
}

const recurso = <T, P>(ruta: string) => ({
  list: (params?: Record<string, unknown>) => api.getList<T>(`${RUTA}${ruta}`, params),
  create: (payload: P) => api.post<T>(`${RUTA}${ruta}`, payload),
  update: (id: string | number, payload: P) => api.patch<T>(`${RUTA}${ruta}/${id}`, payload),
  remove: (id: string | number) => api.delete<void>(`${RUTA}${ruta}/${id}`),
  /** Vacía la tabla. El backend la bloquea si algo depende de ella. */
  removeAll: () =>
    api.delete<{ deleted: number; message: string }>(`${RUTA}${ruta}/eliminar-todos`),
  /** Descarga el .xlsx en blanco con los encabezados e instrucciones. */
  descargarPlantilla: () => descargarArchivo(`${RUTA}${ruta}/plantilla`, `plantilla${ruta}.xlsx`),
  /**
   * Página del listado, con el total de lo filtrado.
   *
   * Los parámetros de rango van en snake_case (`cantidad_min`) porque la
   * traducción a camelCase del backend solo aplica al cuerpo JSON, no a la
   * query string.
   */
  listPagina: (params?: Record<string, unknown>) => api.getPage<T>(`${RUTA}${ruta}`, params),
  /** Totales de todo lo filtrado, sin importar la paginación. */
  resumen: <R>(params?: Record<string, unknown>) => api.get<R>(`${RUTA}${ruta}/resumen`, params),
  /** Descarga en .xlsx lo filtrado completo, no solo la página visible. */
  exportar: (params?: Record<string, unknown>) =>
    descargarArchivo(`${RUTA}${ruta}/exportar`, `${ruta.slice(1)}.xlsx`, params),
  /** Sube un .xlsx armado con la plantilla. */
  importar: (archivo: File) => {
    const cuerpo = new FormData();
    cuerpo.append('archivo', archivo);
    // Sin `Content-Type`: el navegador lo pone con el boundary del multipart.
    // Si se fija a mano, el backend no puede separar las partes.
    return httpClient
      .post<ResultadoImportacion>(`${RUTA}${ruta}/importar`, cuerpo, {
        headers: { 'Content-Type': undefined },
        // El mismo margen que el informe y que gunicorn: un archivo grande
        // puede pasar de los 30 s normales.
        timeout: 120_000,
      })
      .then((r) => r.data);
  },
});

export type PuntoVentaPayload = Omit<PuntoVenta, 'ventasCount'>;
export type ProductoPayload = Omit<Producto, 'ventasCount'>;
export type VentaPayload = Pick<
  Venta,
  'idProducto' | 'idPuntoVenta' | 'fechaVenta' | 'cantidadVendida'
>;
export type InventarioPayload = Pick<
  Inventario,
  'idProducto' | 'idPuntoVenta' | 'cantidadInventario'
>;
/**
 * Lo que se guarda de una meta: solo las unidades.
 *
 * El dinero y los puntos no se envían porque no se guardan; el backend los
 * calcula con el precio y el puntaje del producto, igual que el total de una
 * venta.
 */
export type MetaPayload = Pick<
  MetaComercial,
  'idProducto' | 'idPuntoVenta' | 'fechaMeta' | 'metaCantidad'
>;

/**
 * Sube el informe del ERP a un canal: ventas del mes elegido e inventario
 * completo. Lo tienen Claro y Tmk Ecommerce Claro; Homecenter y Falabella no.
 */
const importarInformeEn =
  (ruta: string) => (archivo: File, mes: { anio: number; mes: number }, modo: ModoImportacion) => {
    const cuerpo = new FormData();
    cuerpo.append('archivo', archivo);
    cuerpo.append('anio', String(mes.anio));
    cuerpo.append('mes', String(mes.mes));
    cuerpo.append('modo', modo);
    return httpClient
      .post<ResultadoInforme>(`${RUTA}${ruta}`, cuerpo, {
        headers: { 'Content-Type': undefined },
        // El archivo trae once mil filas: el timeout normal no alcanza.
        timeout: 120_000,
      })
      .then((r) => r.data);
  };

export const biTradeApi = {
  opciones: () => api.get<Opciones>(`${RUTA}/opciones`),
  dashboard: (filtros: FiltrosDashboard) =>
    api.get<Dashboard>(`${RUTA}/dashboard`, filtros as Record<string, unknown>),
  cumplimiento: (filtros: FiltrosCumplimiento) =>
    api.get<Cumplimiento>(`${RUTA}/cumplimiento`, filtros as Record<string, unknown>),
  avanceMensual: (filtros: FiltrosAvance) =>
    api.get<AvanceMensual>(`${RUTA}/avance-mensual`, filtros as unknown as Record<string, unknown>),
  /**
   * Descarga el tablero en .xlsx con los filtros que hay en pantalla.
   *
   * Sin `hoja` baja las tres vistas del mes en un solo archivo; con `hoja`,
   * solo ese bloque, que es lo que pide el botón de cada tarjeta.
   */
  /**
   * Sube el informe del ERP: ventas del mes elegido e inventario completo.
   *
   * Va por `httpClient` y no por `api.post` para poder mandar el archivo como
   * multipart sin fijar el `Content-Type`, que lo pone el navegador con su
   * boundary.
   */
  importarInforme: importarInformeEn('/importar-informe'),
  avanceMensualExportar: (filtros: FiltrosAvance, hoja?: HojaAvance) =>
    descargarArchivo(`${RUTA}/avance-mensual/exportar`, 'avance.xlsx', {
      ...filtros,
      ...(hoja ? { hoja } : {}),
    }),

  cumplimientoDiario: (filtros: FiltrosDia) =>
    api.get<CumplimientoDiario>(
      `${RUTA}/cumplimiento-diario`,
      filtros as unknown as Record<string, unknown>,
    ),
  cumplimientoDiarioExportar: (filtros: FiltrosDia, corte?: CorteDia) =>
    descargarArchivo(`${RUTA}/cumplimiento-diario/exportar`, 'cumplimiento.xlsx', {
      ...filtros,
      ...(corte ? { corte } : {}),
    }),
  tickets: (filtros: FiltrosConcurso) =>
    api.get<Concurso>(`${RUTA}/tickets`, filtros as Record<string, unknown>),
  ticketsExportar: (filtros: FiltrosConcurso) =>
    descargarArchivo(
      `${RUTA}/tickets/exportar`,
      'tickets.xlsx',
      filtros as Record<string, unknown>,
    ),

  campanas: recurso<Campana, Partial<CampanaPayload>>('/campanas'),
  puntosVenta: recurso<PuntoVenta, Partial<PuntoVentaPayload>>('/puntos-venta'),
  productos: recurso<Producto, Partial<ProductoPayload>>('/productos'),
  ventas: recurso<Venta, Partial<VentaPayload>>('/ventas'),
  inventario: recurso<Inventario, Partial<InventarioPayload>>('/inventario'),
  metas: recurso<MetaComercial, Partial<MetaPayload>>('/metas'),
};

/** Un enlace público del tablero, como lo ve quien lo administra. */
export interface EnlacePublico {
  idEnlace: number;
  /** Qué abre: uno de los tableros, o el formulario del plan Partners. */
  canal: CanalEnlace;
  nombre: string;
  /** Va en la URL. Sin la contraseña no abre nada. */
  token: string;
  activo: boolean;
  expira: string | null;
  /** Activo y sin vencer: si hoy abre o no. */
  vigente: boolean;
  accesos: number;
  ultimoAcceso: string | null;
  createdAt: string;
  creadoPor: string;
}

/**
 * Lo que devuelve crear o regenerar un enlace: la única vez que viaja la
 * contraseña. El backend la guarda como hash y no la puede volver a leer.
 */
export interface EnlaceConClave extends EnlacePublico {
  clave: string;
}

export const enlacesApi = {
  list: (canal: CanalEnlace) => api.getList<EnlacePublico>(`${RUTA}/enlaces`, { canal }),
  create: (payload: { nombre: string; expira: string | null; canal: CanalEnlace }) =>
    api.post<EnlaceConClave>(`${RUTA}/enlaces`, payload),
  update: (id: number, payload: Partial<Pick<EnlacePublico, 'nombre' | 'activo' | 'expira'>>) =>
    api.patch<EnlacePublico>(`${RUTA}/enlaces/${id}`, payload),
  remove: (id: number) => api.delete<void>(`${RUTA}/enlaces/${id}`),
  /** Contraseña nueva, misma URL. Los accesos abiertos dejan de valer. */
  regenerarClave: (id: number) => api.post<EnlaceConClave>(`${RUTA}/enlaces/${id}/regenerar-clave`),
};

/** La URL pública de un enlace, tal como se comparte. */
export const urlDelEnlace = (token: string) =>
  `${window.location.origin}/tablero/${encodeURIComponent(token)}`;

/** La URL del formulario público del plan Partners. */
export const urlDelFormulario = (token: string) =>
  `${window.location.origin}/formulario/${encodeURIComponent(token)}`;

/** Los canales del BI. Cada uno tiene sus propias tablas. */
export type Canal = 'claro' | 'hc' | 'falabella' | 'tmk';

/**
 * Qué abre un enlace público: un tablero de solo lectura, o el formulario del
 * plan Partners, que es el único que escribe.
 */
export type CanalEnlace = Canal | 'partners';

/**
 * La API de un canal aparte —Homecenter, Falabella o Tmk Ecommerce Claro—: los mismos recursos y
 * cálculos que Claro, sobre sus propias tablas (`_hc`, `_falabella`, `_tmk`). Las
 * respuestas tienen la misma forma que las de Claro, así que las pantallas son
 * las mismas. No hay concurso de tickets ni importación del informe del ERP:
 * eso es de Claro.
 */
const apiDeCanal = (tramo: Exclude<Canal, 'claro'>) => ({
  opciones: () => api.get<Opciones>(`${RUTA}/${tramo}/opciones`),
  avanceMensual: (filtros: FiltrosAvance) =>
    api.get<AvanceMensual>(
      `${RUTA}/${tramo}/avance-mensual`,
      filtros as unknown as Record<string, unknown>,
    ),
  avanceMensualExportar: (filtros: FiltrosAvance, hoja?: HojaAvance) =>
    descargarArchivo(`${RUTA}/${tramo}/avance-mensual/exportar`, `${tramo}-avance.xlsx`, {
      ...filtros,
      ...(hoja ? { hoja } : {}),
    }),
  cumplimientoDiario: (filtros: FiltrosDia) =>
    api.get<CumplimientoDiario>(
      `${RUTA}/${tramo}/cumplimiento-diario`,
      filtros as unknown as Record<string, unknown>,
    ),
  cumplimientoDiarioExportar: (filtros: FiltrosDia, corte?: CorteDia) =>
    descargarArchivo(
      `${RUTA}/${tramo}/cumplimiento-diario/exportar`,
      `${tramo}-cumplimiento.xlsx`,
      { ...filtros, ...(corte ? { corte } : {}) },
    ),
  puntosVenta: recurso<PuntoVenta, Partial<PuntoVentaPayload>>(`/${tramo}/puntos-venta`),
  productos: recurso<Producto, Partial<ProductoPayload>>(`/${tramo}/productos`),
  ventas: recurso<Venta, Partial<VentaPayload>>(`/${tramo}/ventas`),
  inventario: recurso<Inventario, Partial<InventarioPayload>>(`/${tramo}/inventario`),
  metas: recurso<MetaComercial, Partial<MetaPayload>>(`/${tramo}/metas`),
});

/** Lo que tiene cualquier canal aparte: sus CRUD y sus tableros. */
export type ApiDeCanal = ReturnType<typeof apiDeCanal>;

export const biTradeApiHc = {
  ...apiDeCanal('hc'),
  /** Reemplaza el inventario con el querie del portal de Homecenter. */
  importarQuery: (archivo: File) => {
    const cuerpo = new FormData();
    cuerpo.append('archivo', archivo);
    return httpClient
      .post<ResultadoQuery>(`${RUTA}/hc/inventario/importar-query`, cuerpo, {
        headers: { 'Content-Type': undefined },
        timeout: 120_000,
      })
      .then((r) => r.data);
  },
  /**
   * Carga las ventas del querie del portal de Homecenter. Sin `sobrescribir`,
   * si algún día del archivo ya tiene ventas no se guarda nada y vuelve la
   * lista de esos días.
   */
  importarQueryVentas: async (
    archivo: File,
    sobrescribir: boolean,
  ): Promise<RespuestaQueryVentas> => {
    const cuerpo = new FormData();
    cuerpo.append('archivo', archivo);
    if (sobrescribir) cuerpo.append('modo', 'sobrescribir');
    try {
      const { data } = await httpClient.post<ResultadoQueryVentas>(
        `${RUTA}/hc/ventas/importar-query`,
        cuerpo,
        { headers: { 'Content-Type': undefined }, timeout: 120_000 },
      );
      return { conflicto: false, resultado: data };
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && error.code === 'dias_con_ventas') {
        const cuerpoError = error.body as { diasConVentas: DiaConVentas[] };
        return {
          conflicto: true,
          diasConVentas: cuerpoError.diasConVentas,
          message: error.message,
        };
      }
      throw error;
    }
  },
};
export const biTradeApiFalabella = apiDeCanal('falabella');
export const biTradeApiTmk = {
  ...apiDeCanal('tmk'),
  /** Tmk es el único canal aparte con el importador del ERP, igual que Claro. */
  importarInforme: importarInformeEn('/tmk/importar-informe'),
};

// ── Plan Partners ──────────────────────────────────────────────────────────

/** Una regional del plan. Es catálogo: se agregan y quitan desde el formulario. */
export interface RegionalPartner {
  idRegional: number;
  nombre: string;
  activa: boolean;
  puntosCount: number;
  registrosCount: number;
}

/** Un punto de venta del plan: el código va aparte del nombre. */
export interface PuntoVentaPartner {
  idPuntoVenta: string;
  nombrePdv: string;
  idRegional: number;
  /** Nombre de la regional, para mostrar. */
  regional: string;
  activo: boolean;
  /** Nombre y código juntos, como se leen en el formulario. */
  etiqueta: string;
  registrosCount: number;
}

export interface ProductoPartner {
  idProducto: string;
  nombreProducto: string;
  activo: boolean;
  etiqueta: string;
  registrosCount: number;
}

/** Una recomendación registrada por un promotor de marca. */
export interface RegistroPartner {
  idRegistro: number;
  idRegional: number;
  regional: string;
  marca: string;
  idPuntoVenta: string;
  nombrePdv: string;
  puntoVentaEtiqueta: string;
  idProducto: string;
  nombreProducto: string;
  productoEtiqueta: string;
  fechaRecomendacion: string;
  serial: string;
  documentoPromotor: string;
  factura: string;
  /** Quién lo cargó: la persona con cuenta, o el enlace público. */
  origen: string;
  createdAt: string;
  /** Solo al guardar: avisa si el serial ya tenía registros. */
  message?: string;
}

export type RegistroPartnerPayload = Pick<
  RegistroPartner,
  | 'idRegional'
  | 'marca'
  | 'idPuntoVenta'
  | 'idProducto'
  | 'fechaRecomendacion'
  | 'serial'
  | 'documentoPromotor'
  | 'factura'
>;

/** Lo que se guarda de cada lista del formulario. */
export type RegionalPartnerPayload = Pick<RegionalPartner, 'nombre' | 'activa'>;
export type PuntoVentaPartnerPayload = Pick<
  PuntoVentaPartner,
  'idPuntoVenta' | 'nombrePdv' | 'idRegional' | 'activo'
>;
export type ProductoPartnerPayload = Pick<
  ProductoPartner,
  'idProducto' | 'nombreProducto' | 'activo'
>;

/** Los desplegables del formulario. Cada punto trae su regional para filtrarlos. */
export interface OpcionesPartners {
  regionales: Array<{ value: number; label: string }>;
  marcas: Array<{ value: string; label: string }>;
  puntosVenta: Array<{ value: string; label: string; nombre: string; idRegional: number }>;
  productos: Array<{ value: string; label: string; nombre: string; precio: number }>;
}

export const partnersApi = {
  opciones: () => api.get<OpcionesPartners>(`${RUTA}/partners/opciones`),
  registros: recurso<RegistroPartner, Partial<RegistroPartnerPayload>>('/partners/registros'),
  regionales: recurso<RegionalPartner, Partial<RegionalPartnerPayload>>('/partners/regionales'),
  puntosVenta: recurso<PuntoVentaPartner, Partial<PuntoVentaPartnerPayload>>(
    '/partners/puntos-venta',
  ),
  productos: recurso<ProductoPartner, Partial<ProductoPartnerPayload>>('/partners/productos'),
};

// ── Plan Partners · metas y tablero ────────────────────────────────────────

/** La meta mensual de una marca en un punto de venta. */
export interface MetaPartner {
  idMeta: number;
  anio: number;
  mes: number;
  idPuntoVenta: string;
  nombrePdv: string;
  regional: string;
  marca: string;
  metaUnidades: string;
}

/** Un mes que ya tiene metas cargadas. */
export interface PeriodoMetas {
  anio: number;
  mes: number;
  label: string;
  metas: number;
  unidades: number;
}

/** Lo que responde la carga del Excel de metas. */
export interface ResultadoMetas {
  created: number;
  updated: number;
  skipped: number;
  periodos: Array<{ anio: number; mes: number; label: string }>;
  /** Códigos del archivo que no están en el catálogo del formulario. */
  puntosDesconocidos: string[];
  marcasDesconocidas: string[];
  message: string;
}

/** Lo hecho contra lo prometido: el corte que repite todo el tablero. */
export interface CortePartner {
  unidades: number;
  meta: number;
  cumplimiento: number;
  faltante: number;
  sobrecumplimiento: number;
}

export interface DashboardPartners {
  filtros: {
    anio: number;
    mes: number;
    regional: string;
    punto: string;
    marca: string;
    promotor: string;
    periodo: string;
  };
  totales: CortePartner & { valor: number; promotores: number; puntos: number };
  porMarca: Array<CortePartner & { marca: string }>;
  porDia: Array<{ fecha: string; unidades: number }>;
  porRegional: Array<CortePartner & { regional: string }>;
  porPunto: Array<CortePartner & { codigo: string; punto: string }>;
  porPromotor: Array<{ documento: string; unidades: number; puntos: number; marcas: number }>;
  detalle: Array<CortePartner & { codigo: string; punto: string; marca: string }>;
}

/** Los cortes del tablero. `mes: 0` mira el año entero. */
export interface FiltrosPartners {
  anio?: number;
  mes?: number;
  regional?: string;
  punto?: string;
  marca?: string;
  promotor?: string;
}

export const partnersTableroApi = {
  dashboard: (filtros: FiltrosPartners) =>
    api.get<DashboardPartners>(
      `${RUTA}/partners/dashboard`,
      filtros as unknown as Record<string, unknown>,
    ),
  metas: {
    list: (params?: Record<string, unknown>) =>
      api.getPage<MetaPartner>(`${RUTA}/partners/metas`, params),
    periodos: () => api.get<PeriodoMetas[]>(`${RUTA}/partners/metas/periodos`),
    descargarPlantilla: () =>
      descargarArchivo(`${RUTA}/partners/metas/plantilla`, 'plantilla-metas-partners.xlsx'),
    /** Sube el Excel mensual de Trade, con sus mismos encabezados. */
    importar: (archivo: File) => {
      const cuerpo = new FormData();
      cuerpo.append('archivo', archivo);
      return httpClient
        .post<ResultadoMetas>(`${RUTA}/partners/metas/importar`, cuerpo, {
          headers: { 'Content-Type': undefined },
          timeout: 120_000,
        })
        .then((r) => r.data);
    },
  },
};
