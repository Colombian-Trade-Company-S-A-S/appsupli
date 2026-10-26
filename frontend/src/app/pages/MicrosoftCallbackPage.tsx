import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircleIcon, ArrowLeftIcon } from 'lucide-react';
import { tokenDeRegreso, useAuth } from '@/core/auth';
import { ApiError } from '@/shared/api/http-client';
import { Alert, AlertDescription, Spinner } from '@/shared/components/ui';
import { useTarda } from '@/shared/hooks';

// En desarrollo React monta dos veces: el regreso de Microsoft se procesa una sola.
let enCurso: Promise<string | null> | null = null;

/**
 * Adonde vuelve Microsoft (`/auth/microsoft`, la URL registrada en Entra).
 * Toma el token, lo cambia por la sesión de appsupli y el guard lleva adentro.
 * Es el primer momento en que se necesita el backend, que puede estar
 * despertando: si tarda, se dice por qué.
 */
export default function MicrosoftCallbackPage() {
  const { loginMicrosoft } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const despertando = useTarda(!error);

  useEffect(() => {
    enCurso ??= tokenDeRegreso();
    enCurso
      .then((idToken) => {
        if (!idToken) {
          navigate('/login', { replace: true });
          return;
        }
        return loginMicrosoft(idToken);
      })
      .catch((e: unknown) => {
        setError(
          e instanceof ApiError || e instanceof Error
            ? e.message
            : 'No se pudo completar el ingreso con Microsoft.',
        );
      })
      .finally(() => {
        enCurso = null;
      });
  }, [loginMicrosoft, navigate]);

  if (!error) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-sm text-muted-foreground">
        <Spinner />
        Entrando con tu cuenta de Microsoft…
        {despertando && (
          <span className="text-center text-xs text-pretty">
            El servidor se está despertando; puede tardar hasta un minuto.
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">No pudimos completar el ingreso</h1>
      <Alert variant="destructive">
        <AlertCircleIcon />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
      <Link
        to="/login"
        replace
        className="flex items-center gap-1.5 self-start text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        Volver al ingreso
      </Link>
    </div>
  );
}
