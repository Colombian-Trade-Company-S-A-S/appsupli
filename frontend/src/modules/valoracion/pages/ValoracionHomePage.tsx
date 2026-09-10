import { Link } from 'react-router-dom';
import { CalendarClockIcon, ListChecksIcon, LockIcon, LockOpenIcon } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Spinner,
} from '@/shared/components/ui';
import { FullPageLoader } from '@/shared/components/feedback';
import { valoracionApi } from '../api';
import { useResumen, useValoracionMutation } from '../hooks';
import { Encabezado, Kpi, formatoFecha } from '../components/Piezas';
import { BarraAvance } from '../components/Semaforo';
import { SECCIONES } from './ValoracionLayout';

const BASE = '/inicio/valoracion';

/** Home del módulo: qué te toca, cómo va la ronda y a dónde puedes entrar. */
export default function ValoracionHomePage() {
  const { data: resumen, isLoading } = useResumen();

  const publicar = useValoracionMutation(
    (publicado: boolean) => valoracionApi.configuracion.publicar(publicado),
    (data) => data.message ?? 'Configuración actualizada',
  );

  if (isLoading || !resumen) return <FullPageLoader label="Cargando…" />;

  const { capabilities: puede, progress: avance, settings } = resumen;
  const tarjetas = SECCIONES.filter((s) => !s.exacto && s.visible(puede));

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="Valoración de desempeño"
        descripcion="Ciclos de evaluación 180°, resultados por persona y planes de mejora."
      />

      {resumen.myPending > 0 && (
        <Alert>
          <ListChecksIcon />
          <AlertTitle>
            Tienes {resumen.myPending} evaluación{resumen.myPending === 1 ? '' : 'es'} por responder
          </AlertTitle>
          <AlertDescription>
            <span>
              Los ciclos abiertos cierran en la fecha indicada; después ya no se pueden enviar.
            </span>
            <Button size="sm" className="mt-2" render={<Link to={`${BASE}/mis-evaluaciones`} />}>
              Responder ahora
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Mis evaluaciones"
          value={`${resumen.myTotal - resumen.myPending}/${resumen.myTotal}`}
          hint="Respondidas de las que me asignaron"
        />
        <Kpi
          label="Mis resultados"
          value={resumen.myResults}
          hint="Ciclos en los que me evaluaron"
        />
        <Kpi label="Mi equipo" value={resumen.teamSize} hint="Personas a mi cargo" />
        <Kpi
          label="Avance de la ronda"
          value={`${avance.percentage}%`}
          hint={`${avance.completed} de ${avance.total} evaluaciones`}
        >
          <BarraAvance porcentaje={avance.percentage} className="mt-1" />
        </Kpi>
      </div>

      {resumen.activeCycles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Ciclos abiertos</CardTitle>
            <CardDescription>Periodos que admiten respuestas en este momento.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {resumen.activeCycles.map((ciclo) => (
              <div key={ciclo.id} className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col">
                  <span className="font-medium">{ciclo.name}</span>
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarClockIcon className="size-3.5" />
                    Cierra el {formatoFecha(ciclo.endDate)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="secondary">{ciclo.evaluationTypeLabel}</Badge>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {ciclo.progress.completed}/{ciclo.progress.total} respondidas
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {puede.canPublishResults && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {settings.resultsPublished ? (
                <LockOpenIcon className="size-4 text-success" />
              ) : (
                <LockIcon className="size-4 text-muted-foreground" />
              )}
              Publicación de resultados
            </CardTitle>
            <CardDescription>
              {settings.resultsPublished
                ? `Habilitados para todo el equipo${
                    settings.updatedByName ? ` por ${settings.updatedByName}` : ''
                  }.`
                : 'Mis resultados y Planes de acción están bloqueados para el equipo. Lo recomendable es abrirlos cuando el avance llegue al 100%.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-56 flex-1 flex-col gap-2">
              <BarraAvance porcentaje={avance.percentage} />
              <span className="text-xs text-muted-foreground">
                {avance.completed} de {avance.total} evaluaciones respondidas ({avance.percentage}%)
              </span>
            </div>
            <Button
              variant={settings.resultsPublished ? 'outline' : 'default'}
              disabled={publicar.isPending}
              onClick={() => publicar.mutate(!settings.resultsPublished)}
            >
              {publicar.isPending && <Spinner data-icon="inline-start" />}
              {settings.resultsPublished ? 'Bloquear resultados' : 'Habilitar resultados al equipo'}
            </Button>
          </CardContent>
        </Card>
      )}

      {resumen.catalog && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Competencias" value={resumen.catalog.competencies} hint="Activas" />
          <Kpi label="Preguntas" value={resumen.catalog.questions} hint="Banco activo" />
          <Kpi label="Ciclos" value={resumen.catalog.cycles} hint="Creados" />
          <Kpi
            label="Personas con resultado"
            value={resumen.catalog.peopleEvaluated}
            hint="Consolidadas al menos una vez"
          />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tarjetas.map((seccion) => {
          const Icono = seccion.icon;
          return (
            <Link key={seccion.to} to={`${BASE}/${seccion.to}`} className="rounded-xl">
              <Card className="h-full transition-shadow hover:ring-primary/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Icono className="size-4 text-muted-foreground" />
                    {seccion.label}
                  </CardTitle>
                  <CardDescription>{DESCRIPCIONES[seccion.to]}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

const DESCRIPCIONES: Record<string, string> = {
  'mis-evaluaciones': 'Las personas que te toca calificar en los ciclos abiertos.',
  'mis-resultados': 'Tu consolidado, tu semáforo y el detalle ítem por ítem.',
  equipo: 'Cómo viene cada persona a tu cargo, con toda la segmentación.',
  dashboard: 'Promedio de la compañía, evolución, competencias y brechas.',
  consolidado: 'La tabla completa persona por persona, exportable a CSV.',
  planes: 'Compromisos de mejora, responsables y fechas.',
  ciclos: 'Crea periodos de evaluación, asigna evaluadores y consolida.',
  preguntas: 'El banco de preguntas de liderazgo y operativo.',
  competencias: 'Las categorías internas que agrupan las preguntas.',
  jerarquia: 'Cargo y jefe directo: la base de quién evalúa a quién.',
};
