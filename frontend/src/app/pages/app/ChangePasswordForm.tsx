import { useState, type FormEvent } from 'react';
import { AlertCircleIcon, CheckIcon, LockKeyholeIcon } from 'lucide-react';
import { authApi } from '@/core/auth/auth.api';
import { ApiError } from '@/shared/api/http-client';
import { cn } from '@/shared/lib/utils';
import {
  Alert,
  AlertDescription,
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  PasswordInput,
  Separator,
  Spinner,
} from '@/shared/components/ui';

type Fase = 'verificar' | 'cambiar' | 'listo';

/**
 * Cambio de contraseña en dos fases: primero se confirma la identidad con la
 * contraseña actual y solo entonces aparecen los campos de la nueva.
 */
export function ChangePasswordForm() {
  const [fase, setFase] = useState<Fase>('verificar');
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errorCampo, setErrorCampo] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  const reiniciar = () => {
    setFase('verificar');
    setActual('');
    setNueva('');
    setConfirmacion('');
    setError(null);
    setErrorCampo({});
  };

  const mostrarError = (e: unknown, campo: string) => {
    if (e instanceof ApiError && e.errors) {
      const detalle = Object.values(e.errors)[0]?.[0];
      if (detalle) {
        setErrorCampo({ [campo]: detalle });
        return;
      }
    }
    setError(e instanceof Error ? e.message : 'Ocurrió un error inesperado');
  };

  const verificar = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setErrorCampo({});
    if (!actual) {
      setErrorCampo({ actual: 'Escribe tu contraseña actual' });
      return;
    }

    setEnviando(true);
    try {
      await authApi.verifyPassword(actual);
      setFase('cambiar');
    } catch (e) {
      mostrarError(e, 'actual');
    } finally {
      setEnviando(false);
    }
  };

  const cambiar = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setErrorCampo({});

    const errores: Record<string, string> = {};
    if (!nueva) errores.nueva = 'Escribe la nueva contraseña';
    else if (nueva.length < 8) errores.nueva = 'Mínimo 8 caracteres';
    if (confirmacion !== nueva) errores.confirmacion = 'Las contraseñas no coinciden';
    if (Object.keys(errores).length) {
      setErrorCampo(errores);
      return;
    }

    setEnviando(true);
    try {
      await authApi.changePassword({ currentPassword: actual, newPassword: nueva });
      setFase('listo');
    } catch (e) {
      mostrarError(e, 'nueva');
    } finally {
      setEnviando(false);
    }
  };

  if (fase === 'listo') {
    return (
      <div className="flex flex-col items-start gap-4">
        <Alert>
          <CheckIcon />
          <AlertDescription>Tu contraseña se actualizó correctamente.</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={reiniciar}>
          Cambiarla de nuevo
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Pasos fase={fase} />

      {fase === 'verificar' ? (
        <form onSubmit={verificar} noValidate>
          <FieldGroup>
            <Field data-invalid={!!errorCampo.actual || undefined}>
              <FieldLabel htmlFor="actual">Contraseña actual</FieldLabel>
              <PasswordInput
                id="actual"
                autoComplete="current-password"
                value={actual}
                onChange={(e) => setActual(e.target.value)}
                aria-invalid={!!errorCampo.actual || undefined}
              />
              {errorCampo.actual ? (
                <FieldError>{errorCampo.actual}</FieldError>
              ) : (
                <FieldDescription>Confirmamos que eres tú antes del cambio.</FieldDescription>
              )}
            </Field>

            {error && (
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Field>
              <Button type="submit" disabled={enviando}>
                {enviando ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <LockKeyholeIcon data-icon="inline-start" />
                )}
                Validar
              </Button>
            </Field>
          </FieldGroup>
        </form>
      ) : (
        <form onSubmit={cambiar} noValidate>
          <FieldGroup>
            <Field data-invalid={!!errorCampo.nueva || undefined}>
              <FieldLabel htmlFor="nueva">Nueva contraseña</FieldLabel>
              <PasswordInput
                id="nueva"
                autoComplete="new-password"
                value={nueva}
                onChange={(e) => setNueva(e.target.value)}
                aria-invalid={!!errorCampo.nueva || undefined}
              />
              {errorCampo.nueva ? (
                <FieldError>{errorCampo.nueva}</FieldError>
              ) : (
                <FieldDescription>Mínimo 8 caracteres, no muy común.</FieldDescription>
              )}
            </Field>

            <Field data-invalid={!!errorCampo.confirmacion || undefined}>
              <FieldLabel htmlFor="confirmacion">Confirmar nueva contraseña</FieldLabel>
              <PasswordInput
                id="confirmacion"
                autoComplete="new-password"
                value={confirmacion}
                onChange={(e) => setConfirmacion(e.target.value)}
                aria-invalid={!!errorCampo.confirmacion || undefined}
              />
              {errorCampo.confirmacion && <FieldError>{errorCampo.confirmacion}</FieldError>}
            </Field>

            {error && (
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Field orientation="horizontal">
              <Button type="submit" disabled={enviando}>
                {enviando && <Spinner data-icon="inline-start" />}
                Actualizar contraseña
              </Button>
              <Button type="button" variant="ghost" onClick={reiniciar}>
                Cancelar
              </Button>
            </Field>
          </FieldGroup>
        </form>
      )}
    </div>
  );
}

/** Indicador de las dos fases del cambio. */
function Pasos({ fase }: { fase: Fase }) {
  const pasos = [
    {
      n: 1,
      label: 'Verifica tu identidad',
      activo: fase === 'verificar',
      hecho: fase === 'cambiar',
    },
    { n: 2, label: 'Nueva contraseña', activo: fase === 'cambiar', hecho: false },
  ];

  return (
    <ol className="flex items-center gap-3">
      {pasos.map((paso, i) => (
        <li key={paso.n} className="flex flex-1 items-center gap-3">
          <span
            className={cn(
              'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-colors',
              paso.hecho && 'border-primary bg-primary text-primary-foreground',
              paso.activo && 'border-primary text-primary',
              !paso.activo && !paso.hecho && 'text-muted-foreground',
            )}
          >
            {paso.hecho ? <CheckIcon className="size-3.5" /> : paso.n}
          </span>
          <span
            className={cn('truncate text-sm', paso.activo ? 'font-medium' : 'text-muted-foreground')}
          >
            {paso.label}
          </span>
          {i === 0 && <Separator className="hidden flex-1 sm:block" />}
        </li>
      ))}
    </ol>
  );
}
