import { createContext } from 'react';
import type { FuenteDatos } from './fuente';

/**
 * El contexto de la fuente de datos (de qué canal son el tablero y sus CRUD).
 *
 * Va solo en este archivo, sin importar nada en tiempo de ejecución —el tipo
 * se borra al compilar—, para que sea siempre el mismo objeto. Si viviera en
 * `fuente.tsx`, cada recarga en caliente de ese archivo (o de `api.ts`, que
 * importa) crearía un contexto nuevo: el layout de HC quedaba dando la fuente
 * en uno y la página leyendo el otro, que caía en el valor por defecto, Claro.
 * Así se veía «BI Claro punto de venta» dentro de /ventas-hc.
 *
 * Vacío fuera de un proveedor: `useFuente` decide qué hacer en ese caso.
 */
export const ContextoFuente = createContext<FuenteDatos | null>(null);
