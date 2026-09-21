/** Formatos de fecha y número compartidos por todos los módulos. */

export const formatoFecha = (valor?: string | null) =>
  valor
    ? new Date(valor).toLocaleDateString('es-CO', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—';

export const formatoFechaHora = (valor?: string | null) =>
  valor
    ? new Date(valor).toLocaleString('es-CO', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

/** `2026-05` → `may 2026`. Para los ejes de los gráficos por mes. */
export const formatoMes = (valor?: string | null) => {
  if (!valor) return '—';
  const fecha = new Date(valor);
  return fecha.toLocaleDateString('es-CO', { month: 'short', year: 'numeric' });
};

/** Pesos colombianos, sin decimales: los precios del negocio son enteros. */
/** Pesos sin decimales. Un valor que falta (un precio sin dato) sale como «—». */
export const formatoMoneda = (valor: number | null | undefined) =>
  valor == null
    ? '—'
    : new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0,
      }).format(valor);

/** Versión corta para las cifras grandes de un tablero: `$4,2 M`. */
export const formatoMonedaCorta = (valor: number) => {
  if (Math.abs(valor) >= 1_000_000_000) return `$${(valor / 1_000_000_000).toFixed(1)} MM`;
  if (Math.abs(valor) >= 1_000_000) return `$${(valor / 1_000_000).toFixed(1)} M`;
  if (Math.abs(valor) >= 1_000) return `$${(valor / 1_000).toFixed(0)} K`;
  return formatoMoneda(valor);
};

export const formatoNumero = (valor: number) => new Intl.NumberFormat('es-CO').format(valor);

/** `2026-05-27T10:00` para un `<input type="datetime-local">`. */
export const paraInputFechaHora = (valor?: string | null) => {
  if (!valor) return '';
  const fecha = new Date(valor);
  const desfase = fecha.getTimezoneOffset() * 60000;
  return new Date(fecha.getTime() - desfase).toISOString().slice(0, 16);
};
