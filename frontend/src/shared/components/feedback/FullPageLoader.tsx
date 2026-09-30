/**
 * Pantalla de carga con la marca: la «S» del ícono de la app con un brillo
 * que respira. Es lo primero que se ve al abrir la app instalada.
 */
export function FullPageLoader({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex h-full min-h-[60vh] w-full flex-col items-center justify-center gap-6"
    >
      <div className="relative flex items-center justify-center">
        <span
          aria-hidden
          className="animate-brillo-marca absolute size-28 rounded-full bg-[#5932d7]/40 blur-2xl"
        />
        <span
          aria-hidden
          className="animate-brillo-marca absolute size-20 translate-x-4 rounded-full bg-[#3b6dff]/30 blur-2xl [animation-delay:-1.2s]"
        />
        <span className="relative flex size-14 items-center justify-center rounded-2xl bg-brand-gradient font-heading text-2xl font-extrabold text-white shadow-lg shadow-[#5932d7]/30">
          S
        </span>
      </div>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
