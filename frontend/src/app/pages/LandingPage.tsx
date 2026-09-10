import { Link } from 'react-router-dom';
import { ArrowRightIcon } from 'lucide-react';
import { env } from '@/shared/config/env';
import { Badge, buttonVariants } from '@/shared/components/ui';

export default function LandingPage() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6 md:py-32">
      <div className="flex max-w-2xl flex-col items-start gap-6">
        <Badge variant="secondary">Plataforma interna · {env.appName}</Badge>
        <h1 className="text-4xl font-semibold tracking-tight text-balance md:text-5xl">
          Una sola plataforma para todas las áreas de la compañía.
        </h1>
        <p className="text-lg text-muted-foreground text-pretty">
          Entra con tu cuenta corporativa y accede a lo que te corresponde.
        </p>
        <Link to="/login" className={buttonVariants({ size: 'lg' })}>
          Iniciar sesión
          <ArrowRightIcon data-icon="inline-end" />
        </Link>
      </div>
    </section>
  );
}
