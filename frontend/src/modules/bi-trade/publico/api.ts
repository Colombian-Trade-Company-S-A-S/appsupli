import axios, { AxiosError } from 'axios';
import { env } from '@/shared/config/env';
import { ApiError, type ApiErrorBody } from '@/shared/api/http-client';
import type {
  AvanceMensual,
  Campana,
  Canal,
  CanalEnlace,
  Concurso,
  CumplimientoDiario,
  Opciones,
  OpcionesPartners,
  Producto,
  PuntoVenta,
  RegistroPartner,
  RegistroPartnerPayload,
} from '../api';
import { PERFILES, type FuenteDatos } from '../fuente';

/**
 * Cliente del tablero público.
 *
 * Es una instancia aparte a propósito. La del resto de la app pone el token de
 * la sesión en cada consulta y, ante un 401, cierra la sesión: aquí no hay
 * sesión que cerrar, y el acceso viaja en su propia cabecera.
 */
const cliente = axios.create({
  baseURL: env.apiUrl,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

cliente.interceptors.response.use(
  (respuesta) => respuesta,
  (error: AxiosError<ApiErrorBody>) => {
    if (!error.response) {
      return Promise.reject(
        new ApiError('No se pudo conectar con el servidor.', 0, 'NETWORK_ERROR'),
      );
    }
    const { status, data } = error.response;
    return Promise.reject(
      new ApiError(
        data?.message ?? 'Ocurrió un error inesperado.',
        status,
        data?.code,
        data?.errors,
        data,
      ),
    );
  },
);

const ruta = (token: string) => `/publico/bi-trade/${encodeURIComponent(token)}`;

/** Lo que queda guardado tras escribir la contraseña. */
export interface SesionPublica {
  acceso: string;
  nombre: string;
  /** Qué abre. Las sesiones guardadas antes de Homecenter no lo traen: son de Claro. */
  canal?: CanalEnlace;
}

const llave = (token: string) => `tablero-publico:${token}`;

/**
 * El acceso se guarda en `sessionStorage`, no en `localStorage`: se va al
 * cerrar la pestaña. Un enlace se abre muchas veces desde equipos compartidos,
 * y ahí es mejor volver a pedir la contraseña que dejar la puerta abierta.
 *
 * Todo va en `try` porque el navegador puede negar el almacenamiento
 * (navegación privada estricta) y eso no debe romper la página.
 */
export const sesionPublica = {
  leer(token: string): SesionPublica | null {
    try {
      const guardada = sessionStorage.getItem(llave(token));
      return guardada ? (JSON.parse(guardada) as SesionPublica) : null;
    } catch {
      return null;
    }
  },
  guardar(token: string, sesion: SesionPublica) {
    try {
      sessionStorage.setItem(llave(token), JSON.stringify(sesion));
    } catch {
      // Sin almacenamiento la sesión vive en memoria mientras dure la página.
    }
  },
  borrar(token: string) {
    try {
      sessionStorage.removeItem(llave(token));
    } catch {
      // Nada que borrar.
    }
  },
};

export const tableroPublico = {
  /** Que el enlace existe, su nombre y qué abre, para la pantalla de contraseña. */
  info: (token: string) =>
    cliente.get<{ nombre: string; canal: CanalEnlace }>(ruta(token)).then((r) => r.data),
  /** Cambia la contraseña por un acceso firmado que vence. */
  acceso: (token: string, clave: string) =>
    cliente
      .post<{ acceso: string; nombre: string; duracion: number; canal: CanalEnlace }>(
        `${ruta(token)}/acceso`,
        { clave },
      )
      .then((r) => r.data),
};

/**
 * El formulario del plan Partners abierto por enlace.
 *
 * Va por su propia ruta —`/publico/formulario/…`, no la del tablero— y no pide
 * contraseña: se diligencia a diario y no muestra nada de lo ya cargado. Solo
 * puede hacer dos cosas: pedir las listas y enviar una recomendación.
 */
const rutaFormulario = (token: string) => `/publico/formulario/${encodeURIComponent(token)}`;

export const formularioPublico = {
  opciones: (token: string) =>
    cliente.get<OpcionesPartners>(`${rutaFormulario(token)}/opciones`).then((r) => r.data),
  registrar: (token: string, payload: RegistroPartnerPayload) =>
    cliente
      .post<RegistroPartner>(`${rutaFormulario(token)}/registros`, payload)
      .then((r) => r.data),
};

/** Nunca se llama: los botones de descarga no se muestran en solo lectura. */
const soloLectura = () => Promise.reject(new Error('El tablero público es de solo lectura.'));

/**
 * La fuente de datos del enlace: las mismas consultas que la app, contra las
 * rutas públicas y con el acceso en su cabecera. El servidor sabe de qué canal
 * es el enlace; `canal` aquí solo decide cómo se ve (título y hojas).
 *
 * `onSinAcceso` se llama cuando el servidor rechaza el acceso: 403 si venció o
 * regeneraron la contraseña, 404 si revocaron el enlace. Quien la usa decide
 * qué mostrar; la consulta igual falla, para que ninguna pantalla se quede
 * pintando datos viejos como si fueran de ahora.
 */
export function crearFuentePublica(
  token: string,
  acceso: string,
  canal: Canal,
  onSinAcceso: (estado: 403 | 404) => void,
): FuenteDatos {
  const pedir = <T>(tramo: string, params?: object) =>
    cliente
      .get<T>(`${ruta(token)}/${tramo}`, {
        params,
        headers: { 'X-Acceso-Publico': acceso },
      })
      .then((r) => r.data)
      .catch((error: unknown) => {
        if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
          onSinAcceso(error.status);
        }
        throw error;
      });

  return {
    clave: `publico:${token}`,
    soloLectura: true,
    base: `/tablero/${encodeURIComponent(token)}`,
    canal,
    ...PERFILES[canal],
    avanceMensual: (filtros) => pedir<AvanceMensual>('avance-mensual', filtros),
    cumplimientoDiario: (filtros) => pedir<CumplimientoDiario>('cumplimiento-diario', filtros),
    tickets: (filtros) => pedir<Concurso>('tickets', filtros),
    opciones: () => pedir<Opciones>('opciones'),
    // Los catálogos públicos traen solo código y nombre, sin precios: los
    // filtros no necesitan más y el enlace no debe sacar más de lo que muestra.
    productos: () => pedir<Producto[]>('productos'),
    puntosVenta: () => pedir<PuntoVenta[]>('puntos-venta'),
    campanas: () => pedir<Campana[]>('campanas'),
    exportarAvance: soloLectura,
    exportarDia: soloLectura,
  };
}
