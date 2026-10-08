import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertCircleIcon, ArrowLeftIcon, MailIcon } from 'lucide-react';
import { irAMicrosoft, useAuth } from '@/core/auth';
import { authApi } from '@/core/auth/auth.api';
import {
  Alert,
  AlertDescription,
  Button,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  PasswordInput,
  Separator,
  Spinner,
} from '@/shared/components/ui';

export default function LoginPage() {
  const { login, error, isSubmitting } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const [olvido, setOlvido] = useState(false);
  const [respaldo, setRespaldo] = useState(false);
  const [yendo, setYendo] = useState(false);
  const [errorMicrosoft, setErrorMicrosoft] = useState<string | null>(null);

  const { data: ingreso, isError: sinConfig } = useQuery({
    queryKey: ['auth', 'ingreso'],
    queryFn: authApi.ingreso,
    staleTime: Infinity,
  });
  // Si no se pudo saber cómo se entra, se deja la contraseña: mejor que nada.
  const conMicrosoft = !!ingreso?.microsoft;
  const conContrasena = sinConfig || !ingreso || ingreso.contrasena || respaldo;

  const entrarConMicrosoft = async () => {
    setYendo(true);
    setErrorMicrosoft(null);
    try {
      await irAMicrosoft();
    } catch (e) {
      setYendo(false);
      setErrorMicrosoft(e instanceof Error ? e.message : 'No se pudo abrir Microsoft.');
    }
  };

  const emailError = touched && !email ? 'El correo es obligatorio' : undefined;
  const passwordError = touched && !password ? 'La contraseña es obligatoria' : undefined;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!email || !password) return;
    try {
      await login({ email, password });
    } catch {
      // El mensaje ya quedó en el store.
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Bienvenido a appsupli</h1>
        <p className="text-sm text-muted-foreground">
          Accede con tu cuenta corporativa y descubre las herramientas que Supli tiene disponibles
          para ti.
        </p>
      </div>

      {conMicrosoft && (
        <div className="flex flex-col gap-3">
          <Button size="lg" onClick={entrarConMicrosoft} disabled={yendo}>
            {yendo ? <Spinner data-icon="inline-start" /> : <LogoMicrosoft />}
            Ingresar con Microsoft
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Usa tu cuenta corporativa @supli.tech.
          </p>
          {errorMicrosoft && (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertDescription>{errorMicrosoft}</AlertDescription>
            </Alert>
          )}
          {!ingreso?.contrasena && !respaldo && (
            <button
              type="button"
              onClick={() => setRespaldo(true)}
              className="self-center text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Ingreso de respaldo del administrador
            </button>
          )}
        </div>
      )}

      {conMicrosoft && conContrasena && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <Separator className="flex-1" />o con contraseña
          <Separator className="flex-1" />
        </div>
      )}

      {conContrasena && (
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <Field data-invalid={!!emailError || undefined}>
              <FieldLabel htmlFor="email">Correo corporativo</FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <MailIcon />
                </InputGroupAddon>
                <InputGroupInput
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoFocus={!conMicrosoft}
                  placeholder="nombre@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={!!emailError || undefined}
                />
              </InputGroup>
              {emailError && <FieldError>{emailError}</FieldError>}
            </Field>

            <Field data-invalid={!!passwordError || undefined}>
              <FieldLabel htmlFor="password">Contraseña</FieldLabel>
              <PasswordInput
                id="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={!!passwordError || undefined}
              />
              {passwordError && <FieldError>{passwordError}</FieldError>}
            </Field>

            {error && (
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Field>
              <Button type="submit" size="lg" disabled={isSubmitting}>
                {isSubmitting && <Spinner data-icon="inline-start" />}
                {isSubmitting ? 'Iniciando sesión…' : 'Iniciar sesión'}
              </Button>
              <button
                type="button"
                onClick={() => setOlvido((v) => !v)}
                className="self-center text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                ¿Olvidaste tu contraseña?
              </button>
              {olvido && (
                <p className="text-center text-sm text-muted-foreground">
                  Solicita el restablecimiento de tu contraseña con el administrador de appsupli.
                </p>
              )}
            </Field>
          </FieldGroup>
        </form>
      )}

      <div className="flex flex-col gap-4">
        <Separator />
        <Link
          to="/"
          className="flex items-center gap-1.5 self-start text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}

/** El logo de Microsoft, como lo pide su guía de marca para el botón de ingreso. */
function LogoMicrosoft() {
  return (
    <svg data-icon="inline-start" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}
