import { useState } from 'react';
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
  Separator,
  Spinner,
} from '@/shared/components/ui';

const TEMAS: Array<{ value: Theme; label: string; icon: LucideIcon }> = [
  { value: 'light', label: 'Claro', icon: SunIcon },
  { value: 'dark', label: 'Oscuro', icon: MoonIcon },
  { value: 'system', label: 'Sistema', icon: MonitorIcon },
];

/**
 * Apariencia de la plataforma. Se aplica al instante y se guarda en la cuenta,
 * así la persona ve lo mismo desde cualquier equipo.
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
          Se guarda en tu cuenta: la verás igual desde cualquier computador.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        <Grupo titulo="Tema">
          <div className="grid grid-cols-3 gap-3">
            {TEMAS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => cambiar({ theme: value })}
                aria-pressed={theme === value}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-lg border p-3 text-sm transition-colors',
                  theme === value
                    ? 'border-primary bg-primary/5 font-medium'
                    : 'hover:bg-muted/50',
                )}
              >
                <VistaPrevia tema={value} />
                <span className="flex items-center gap-1.5">
                  <Icon className="size-3.5" />
                  {label}
                </span>
              </button>
            ))}
          </div>
        </Grupo>

        <Separator />

        <Grupo titulo="Color de acento">
          <div className="flex flex-wrap gap-2">
            {ACCENTS.map((opcion) => (
              <button
                key={opcion.value}
                type="button"
                title={opcion.label}
                aria-label={opcion.label}
                aria-pressed={accent === opcion.value}
                onClick={() => cambiar({ accent: opcion.value as Accent })}
                className={cn(
                  'flex size-9 items-center justify-center rounded-full border-2 transition-colors',
                  accent === opcion.value ? 'border-foreground' : 'border-transparent',
                )}
              >
                <span
                  className="flex size-7 items-center justify-center rounded-full ring-1 ring-border"
                  style={{ background: opcion.swatch }}
                >
                  {accent === opcion.value && (
                    <CheckIcon className="size-4 text-background" strokeWidth={3} />
                  )}
                </span>
              </button>
            ))}
          </div>
        </Grupo>

        <Separator />

        <Grupo titulo="Bordes">
          <div className="grid grid-cols-3 gap-3">
            {RADII.map((opcion) => (
              <button
                key={opcion.value}
                type="button"
                onClick={() => cambiar({ radius: opcion.value as Radius })}
                aria-pressed={radius === opcion.value}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-lg border p-3 text-sm transition-colors',
                  radius === opcion.value
                    ? 'border-primary bg-primary/5 font-medium'
                    : 'hover:bg-muted/50',
                )}
              >
                <span
                  className="h-8 w-full border-2 border-foreground/70"
                  style={{ borderRadius: opcion.preview }}
                />
                {opcion.label}
              </button>
            ))}
          </div>
        </Grupo>
      </CardContent>
    </Card>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {titulo}
      </h3>
      {children}
    </section>
  );
}

/** Miniatura de la interfaz para reconocer el tema de un vistazo. */
function VistaPrevia({ tema }: { tema: Theme }) {
  if (tema === 'system') {
    return (
      <span className="flex h-12 w-full overflow-hidden rounded border">
        <span className="flex w-1/2 flex-col gap-1 bg-white p-1.5">
          <span className="h-1.5 w-full rounded-full bg-neutral-300" />
          <span className="h-1.5 w-2/3 rounded-full bg-neutral-300" />
        </span>
        <span className="flex w-1/2 flex-col gap-1 bg-neutral-900 p-1.5">
          <span className="h-1.5 w-full rounded-full bg-neutral-600" />
          <span className="h-1.5 w-2/3 rounded-full bg-neutral-600" />
        </span>
      </span>
    );
  }

  const oscuro = tema === 'dark';
  return (
    <span
      className={cn(
        'flex h-12 w-full flex-col gap-1 overflow-hidden rounded border p-1.5',
        oscuro ? 'bg-neutral-900' : 'bg-white',
      )}
    >
      <span className={cn('h-1.5 w-full rounded-full', oscuro ? 'bg-neutral-600' : 'bg-neutral-300')} />
      <span className={cn('h-1.5 w-2/3 rounded-full', oscuro ? 'bg-neutral-600' : 'bg-neutral-300')} />
      <span className={cn('h-1.5 w-1/2 rounded-full', oscuro ? 'bg-neutral-700' : 'bg-neutral-200')} />
    </span>
  );
}
