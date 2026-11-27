import { useAuth, type User } from '@/core/auth';
import type { CanalEnlace } from './api';
import { useFuente } from './fuente';

/**
 * Qué puede hacer cada persona dentro de BI Trade. Es el mismo catálogo del
 * backend (`apps/bi_trade/permisos.py`), que es quien de verdad lo hace
 * cumplir; aquí solo sirve para no mostrar lo que la API va a rechazar.
 *
 * Todo va por informe: verlo, y dentro de él qué puede cargar o editar y si
 * puede compartirlo. Con «cargar ventas» de HC, carga ventas de Homecenter y
 * de nada más. El «Administrador de BI Trade» tiene todo.
 */
export type Informe = 'claro' | 'hc' | 'falabella' | 'tmk' | 'partners' | 'belkin';

/** Los de los canales; los planes tienen uno solo: `plan`. */
export type ModuloEdicion = 'ventas' | 'inventario' | 'metas' | 'productos' | 'puntos-venta';

export const ADMIN_BI = 'bi-trade:data:manage';
export const permisoInforme = (informe: Informe) => `bi-trade:informe:${informe}`;
export const permisoEditar = (informe: Informe, modulo: ModuloEdicion | 'plan') =>
  `bi-trade:${informe}:${modulo}:editar`;
export const permisoCompartir = (informe: Informe) => `bi-trade:${informe}:compartir`;

const CANALES: Informe[] = ['claro', 'hc', 'falabella', 'tmk'];

/** De qué informe es un enlace: el tablero de Belkin es del plan Belkin. */
export const informeDelEnlace = (canal: CanalEnlace): Informe =>
  canal === 'belkin_bi' ? 'belkin' : canal;

export interface PermisosBi {
  verInforme: (informe: Informe) => boolean;
  editar: (informe: Informe, modulo: ModuloEdicion | 'plan') => boolean;
  /** Lo que es de todos los canales, como las marcas: basta con editarlo en uno. */
  editarEnAlguno: (modulo: ModuloEdicion) => boolean;
  compartir: (informe: Informe) => boolean;
}

export function permisosBi(user: User | null): PermisosBi {
  const todo = !!user && (user.isAdmin || user.permissions.includes(ADMIN_BI));
  const tiene = (codigo: string) => todo || !!user?.permissions.includes(codigo);
  // Los de adentro no valen sin ver el informe.
  const verInforme = (informe: Informe) => tiene(permisoInforme(informe));
  const editar = (informe: Informe, modulo: ModuloEdicion | 'plan') =>
    verInforme(informe) && tiene(permisoEditar(informe, modulo));
  return {
    verInforme,
    editar,
    editarEnAlguno: (modulo) => CANALES.some((canal) => editar(canal, modulo)),
    compartir: (informe) => verInforme(informe) && tiene(permisoCompartir(informe)),
  };
}

export function usePermisosBi(): PermisosBi {
  const { user } = useAuth();
  return permisosBi(user);
}

/**
 * Si puede editar ese módulo en el canal en que se está: las mismas páginas
 * sirven a Claro, HC, Falabella y Tmk, y cada una mira su propio informe.
 */
export function usePuedeEditar(modulo: ModuloEdicion): boolean {
  const { canal } = useFuente();
  return usePermisosBi().editar(canal, modulo);
}
