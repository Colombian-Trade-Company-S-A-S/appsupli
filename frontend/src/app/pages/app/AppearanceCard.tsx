import { useState, type ReactNode } from 'react';
import { CheckIcon, MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/core/auth';
import { authApi } from '@/core/auth/auth.api';
import type { PreferencesPayload } from '@/core/auth/types';
import {
  ACCENTS,
  RADII,
  useAppearanceStore,
  type Accent,
  type Radius,
  type Theme,
} from '@/shared/hooks';
import { cn } from '@/shared/lib/utils';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Spinner,
} from '@/shared/components/ui';

const TEMAS: Array<{ value: Theme; label: string; icon: LucideIcon }> = [
  { value: 'light', label: 'Claro', icon: SunIcon },
  { value: 'dark', label: 'Oscuro', icon: MoonIcon },
  { value: 'system', label: 'Sistema', icon: MonitorIcon },
];

/**
 * Apariencia de la plataforma, en una sola franja: tema, acento y bordes.
 * Se aplica al instante y se guarda en la cuenta, así la persona ve lo mismo
 * desde cualquier equipo.
 */
export function AppearanceCard() {
  const { setUser } = useAuth();
  const { theme, accent, radius, set } = useAppearanceStore();
  const [guardando, setGuardando] = useState<keyof PreferencesPayload | null>(null);

  const cambiar = async (cambios: PreferencesPayload) => {
    const campo = Object.keys(cambios)[0] as keyof PreferencesPayload;
    const anterior = { theme, accent, radius };

    set(cambios); // Optimista: se ve el cambio de inmediato.
    setGuardando(campo);
    try {
      setUser(await authApi.updatePreferences(cambios));
    } catch {
      set(anterior); // Si el backend falla, se revierte.
    } finally {
      setGuardando(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Apariencia
          {guardando && <Spinner className="size-3.5 text-muted-foreground" />}
        </CardTitle>
        <CardDescription>
          Se guarda en tu cuenta: la verás igual en cualquier equipo.
        </CardDescription>
      </CardHeader>

      {/* Tres columnas iguales separadas por líneas; en el celular, una debajo de otra. */}
      <CardContent className="grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Grupo titulo="Tema">
          <Segmentos>
            {TEMAS.map(({ value, label, icon: Icon }) => (
              <Segmento
                key={value}
                activo={theme === value}
                onClick={() => cambiar({ theme: value })}
              >
                <Icon className="size-3.5" />
                {label}
              </Segmento>
            ))}
          </Segmentos>
        </Grupo>

        <Grupo titulo="Acento">
          <div className="flex h-9 items-center gap-2">
            {ACCENTS.map((opcion) => (
              <button
                key={opcion.value}
                type="button"
                title={opcion.label}
                aria-label={opcion.label}
                aria-pressed={accent === opcion.value}
                onClick={() => cambiar({ accent: opcion.value as Accent })}
                className={cn(
                  'flex size-8 items-center justify-center rounded-full border-2 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  accent === opcion.value ? 'border-foreground' : 'border-transparent',
                )}
              >
                <span
                  className="flex size-6 items-center justify-center rounded-full ring-1 ring-border"
                  style={{ background: opcion.swatch }}
                >
                  {accent === opcion.value && (
                    <CheckIcon
                      className="size-3.5"
                      style={{ color: opcion.check }}
                      strokeWidth={3}
                    />
                  )}
                </span>
              </button>
            ))}
          </div>
        </Grupo>

        <Grupo titulo="Bordes">
          <Segmentos>
            {RADII.map((opcion) => (
              <Segmento
                key={opcion.value}
                activo={radius === opcion.value}
                onClick={() => cambiar({ radius: opcion.value as Radius })}
              >
                <span
                  aria-hidden
                  className="size-3 border-[1.5px] border-current"
                  style={{ borderRadius: opcion.preview }}
                />
                {opcion.label}
              </Segmento>
            ))}
          </Segmentos>
        </Grupo>
      </CardContent>
    </Card>
  );
}

/** Una columna: su título arriba y el control debajo, centrados. */
function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col items-center gap-3 py-4 first:pt-0 last:pb-0 sm:px-6 sm:py-1 sm:first:pl-0 sm:first:pt-1 sm:last:pr-0 sm:last:pb-1">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {titulo}
      </h3>
      <div className="flex w-full max-w-xs justify-center">{children}</div>
    </section>
  );
}

/** Un grupo de botones que se comporta como un solo control, todos del mismo ancho. */
function Segmentos({ children }: { children: ReactNode }) {
  return <div className="grid h-9 w-full grid-cols-3 rounded-lg border p-0.5">{children}</div>;
}

function Segmento({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={cn(
        'flex min-w-0 items-center justify-center gap-1.5 rounded-md px-1.5 text-xs transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        activo
          ? 'bg-primary/10 font-medium text-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
