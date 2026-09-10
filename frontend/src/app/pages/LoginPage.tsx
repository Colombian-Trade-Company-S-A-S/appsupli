import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircleIcon } from 'lucide-react';
import { useAuth } from '@/core/auth';
import {
  Alert,
  AlertDescription,
  Button,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
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
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Iniciar sesión</h1>
        <p className="text-sm text-muted-foreground">Accede con tu cuenta corporativa.</p>
      </div>

      <form onSubmit={onSubmit} noValidate>
        <FieldGroup>
          <Field data-invalid={!!emailError || undefined}>
            <FieldLabel htmlFor="email">Correo corporativo</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="nombre@supli.tech"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!emailError || undefined}
            />
            {emailError && <FieldError>{emailError}</FieldError>}
          </Field>

          <Field data-invalid={!!passwordError || undefined}>
            <FieldLabel htmlFor="password">Contraseña</FieldLabel>
            <Input
              id="password"
              type="password"
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
              Entrar
            </Button>
          </Field>
        </FieldGroup>
      </form>

      <p className="text-sm text-muted-foreground">
        <Link to="/" className="underline underline-offset-4 hover:text-foreground">
          Volver al inicio
        </Link>
      </p>
    </div>
  );
}
