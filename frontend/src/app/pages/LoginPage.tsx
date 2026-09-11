import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircleIcon, ArrowLeftIcon, MailIcon } from 'lucide-react';
import { useAuth } from '@/core/auth';
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
        <h1 className="text-3xl font-semibold tracking-tight">Hola de nuevo</h1>
        <p className="text-sm text-muted-foreground">
          Entra con tu correo corporativo y tu contraseña.
        </p>
      </div>

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
                autoFocus
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
              {isSubmitting ? 'Entrando…' : 'Entrar'}
            </Button>
          </Field>
        </FieldGroup>
      </form>

      <div className="flex flex-col gap-4">
        <Separator />
        <p className="text-sm text-muted-foreground">
          ¿No puedes entrar? Pídele al administrador de la plataforma que revise tu cuenta o
          restablezca tu contraseña.
        </p>
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
