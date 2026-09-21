import { Link } from 'react-router-dom';
import { ArrowRightIcon, GaugeIcon } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/shared/components/ui';
import { Encabezado } from '@/shared/components/layout';
import { iconoDeApp } from '@/shared/lib/appIcons';
import { useAuth } from '@/core/auth';

const CONTENEDOR = 'supli-performance';

/**
 * La puerta de entrada de Supli Performance.
 *
 * El contenedor no tiene contenido propio: muestra sus sub-módulos —la
 * valoración cualitativa y la medición de objetivos— y deja entrar a los que
 * la persona tenga asignados. Los mismos que el menú lateral despliega.
 */
export default function PerformanceInicioPage() {
  const { user } = useAuth();
  const contenedor = user?.applications.find((app) => app.code === CONTENEDOR);
  const submodulos = contenedor?.children ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="Supli Performance"
        descripcion="El Performance del equipo en un solo lugar: la valoración cualitativa y la medición de objetivos y KPIs."
      />

      {submodulos.length === 0 ? (
        <Card>
          <CardContent>
            <Empty className="py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <GaugeIcon />
                </EmptyMedia>
                <EmptyTitle>Todavía no tienes sub-módulos asignados</EmptyTitle>
                <EmptyDescription>
                  People se encarga de dar el acceso a Valoración y a Objetivos y KPIs.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {submodulos.map((submodulo) => {
            const Icono = iconoDeApp(submodulo.icon);
            return (
              <Link
                key={submodulo.code}
                to={submodulo.basePath}
                className="group rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <Card className="h-full transition-colors group-hover:border-primary/40">
                  <CardHeader>
                    <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:size-4.5">
                      <Icono />
                    </span>
                    <CardTitle className="mt-2 flex items-center gap-2">
                      {submodulo.name}
                      <ArrowRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </CardTitle>
                    <CardDescription className="text-pretty">
                      {submodulo.description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
