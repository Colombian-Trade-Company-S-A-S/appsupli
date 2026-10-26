import { useEffect, useState } from 'react';

/**
 * `true` cuando algo lleva más de `espera` ms en curso. Sirve para explicar
 * una espera larga —el backend de Render despertando— en vez de dejar a la
 * persona mirando un spinner sin saber si se colgó.
 */
export function useTarda(activo: boolean, espera = 5000): boolean {
  const [vencido, setVencido] = useState(false);
  useEffect(() => {
    if (!activo) return;
    const id = window.setTimeout(() => setVencido(true), espera);
    return () => {
      window.clearTimeout(id);
      setVencido(false);
    };
  }, [activo, espera]);
  return activo && vencido;
}
