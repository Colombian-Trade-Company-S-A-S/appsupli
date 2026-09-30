import { useEffect, useId, useState } from 'react';
import { cn } from '@/shared/lib/utils';

const menosMovimiento = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Avanza de 0 a 1 con salida suave cada vez que cambia `clave`. */
function useProgreso(clave: string, duracion = 900) {
  const [t, setT] = useState(() => (menosMovimiento() ? 1 : 0));

  useEffect(() => {
    if (menosMovimiento()) return setT(1);
    setT(0);
    let frame = 0;
    const inicio = performance.now();
    const paso = (ahora: number) => {
      const lineal = Math.min(1, (ahora - inicio) / duracion);
      setT(1 - (1 - lineal) ** 3);
      if (lineal < 1) frame = requestAnimationFrame(paso);
    };
    frame = requestAnimationFrame(paso);
    // Si el navegador frena los cuadros (pestaña en segundo plano), el valor
    // final llega igual.
    const seguro = setTimeout(() => {
      cancelAnimationFrame(frame);
      setT(1);
    }, duracion + 150);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(seguro);
    };
  }, [clave, duracion]);

  return t;
}

const NUMERO = /\d+(?:[.,]\d+)*/g;

/**
 * Lleva un número del texto a `t` (0–1) respetando cómo venía escrito: con
 * miles a la colombiana (`1.234.567`, `85,3`) o con punto decimal (`4.2`,
 * que es lo que sale de `toFixed`). Un punto seguido de tres dígitos se lee
 * como separador de miles.
 */
function escalar(token: string, t: number) {
  const partes = token.split(/[.,]/);
  const conComa = token.includes(',');
  const miles = conComa || partes.slice(1).every((p) => p.length === 3);

  if (!miles) {
    const decimales = partes[1]?.length ?? 0;
    return (Number(token) * t).toFixed(decimales);
  }
  const decimales = conComa ? (token.split(',')[1]?.length ?? 0) : 0;
  const valor = Number(token.replace(/\./g, '').replace(',', '.'));
  return (valor * t).toLocaleString('es-CO', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
    useGrouping: token.includes('.') || valor >= 10_000,
  });
}

/** Un texto con cifras que suben desde cero al aparecer o al cambiar. */
export function CifraAnimada({ valor }: { valor: string | number }) {
  const texto = String(valor);
  const t = useProgreso(texto);
  if (t >= 1) return <>{texto}</>;
  return <>{texto.replace(NUMERO, (token) => escalar(token, t))}</>;
}

/**
 * Mini-gráfica de tendencia para una tarjeta de KPI: solo la forma, sin ejes.
 * Dice «va subiendo» o «se frenó» sin tener que abrir el tablero.
 */
export function Sparkline({ datos, className }: { datos: number[]; className?: string }) {
  const id = `spark-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  if (datos.length < 2) return null;

  const max = Math.max(...datos);
  const min = Math.min(...datos);
  const rango = max - min || 1;
  const puntos = datos.map((v, i) => [
    (i / (datos.length - 1)) * 100,
    30 - ((v - min) / rango) * 26 - 2,
  ]);
  const linea = puntos.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join('');

  return (
    <svg
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      aria-hidden
      data-slot="chart"
      className={cn('h-9 w-full overflow-visible', className)}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.3} />
          <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${linea}L100,30L0,30Z`} fill={`url(#${id})`} />
      <path
        d={linea}
        fill="none"
        stroke="var(--chart-1)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        className="recharts-line-curve"
      />
    </svg>
  );
}
