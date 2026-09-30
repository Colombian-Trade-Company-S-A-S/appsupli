const COLORES_MARCA = ['#a66bff', '#5932d7', '#3b6dff', '#83e6ff', '#ffffff'];

/**
 * Confetti con los colores de la marca, dos ráfagas desde los lados.
 * Se carga solo cuando hace falta y no sale si la persona pidió menos movimiento.
 */
export async function celebrar() {
  const { default: confetti } = await import('canvas-confetti');
  const base = {
    particleCount: 70,
    spread: 65,
    startVelocity: 48,
    ticks: 220,
    colors: COLORES_MARCA,
    disableForReducedMotion: true,
    zIndex: 9999,
  };
  void confetti({ ...base, angle: 60, origin: { x: 0, y: 0.75 } });
  void confetti({ ...base, angle: 120, origin: { x: 1, y: 0.75 } });
}
