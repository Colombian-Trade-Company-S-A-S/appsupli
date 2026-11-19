/**
 * El ID del plan que hay en un enlace de Planner, o null si no se reconoce.
 *
 * Los mismos formatos que acepta el backend (`apps/planner/enlaces.py`):
 * planner.cloud.microsoft/…/plan/{id}, tasks.office.com/…/PlanViews/{id} y
 * …?planId={id}. Aquí solo sirve para mostrar el ID y avisar antes de guardar;
 * quien decide es el backend.
 */
const ID = '([A-Za-z0-9_-]{20,40})';
const PATRONES = [
  new RegExp(`/plan/${ID}(?=[/?#]|$)`),
  new RegExp(`/PlanViews/${ID}(?=[/?#]|$)`, 'i'),
  new RegExp(`[?&#]planId=${ID}`, 'i'),
];

export function planIdDeUrl(url: string | null | undefined): string | null {
  const texto = (url ?? '').trim();
  for (const patron of PATRONES) {
    const coincide = patron.exec(texto);
    if (coincide) return coincide[1];
  }
  return null;
}
