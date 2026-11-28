import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangleIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle, Button } from '@/shared/components/ui';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  /**
   * Al cambiar (la ruta, por ejemplo) se borra el error: sin esto, un fallo
   * de una pantalla seguía en la siguiente hasta recargar.
   */
  resetKey?: unknown;
}

interface State {
  error: Error | null;
}

/** Captura errores de render para que un módulo roto no tumbe toda la app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(anteriores: Props) {
    if (this.state.error && anteriores.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Punto de enganche para Sentry / Datadog / logging corporativo.
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col justify-center gap-4">
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>Algo salió mal</AlertTitle>
          <AlertDescription>{this.state.error.message}</AlertDescription>
        </Alert>
        <Button className="self-start" onClick={() => window.location.reload()}>
          Recargar
        </Button>
      </div>
    );
  }
}
