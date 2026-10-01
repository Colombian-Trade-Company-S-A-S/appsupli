import { useEffect, useState } from 'react';

/**
 * El valor, pero solo cuando deja de cambiar durante `espera` ms. Sirve para
 * que un buscador no dispare una petición por cada letra.
 */
export function useDebounced<T>(valor: T, espera = 300): T {
  const [estable, setEstable] = useState(valor);
  useEffect(() => {
    const id = window.setTimeout(() => setEstable(valor), espera);
    return () => window.clearTimeout(id);
  }, [valor, espera]);
  return estable;
}
