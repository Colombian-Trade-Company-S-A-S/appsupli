import { Link } from 'react-router-dom';
import { CalendarClockIcon, CheckCircle2Icon, ClipboardListIcon } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@/shared/components/ui';
import { useResumen } from '../hooks';
import { formatoFecha } from './Piezas';
import { BarraAvance } from './Semaforo';

const BASE = '/inicio/valoracion';

/**
 * Lo que la valoración aporta al home: qué me falta responder y cuándo cierra.
 *
 * Solo se monta si la persona tiene la app asignada, así que puede pedir el
 * resumen del módulo sin comprobar permisos por su cuenta.
 */
export default function HomeWidget() {
  const { data: resumen, isLoading } = useResumen();

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </CardContent>
      </Card>
    );
  }

  if (!resumen) return null;

  const pendientes = resumen.myPending;
  const alDia = pendientes === 0;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardListIcon className="size-4 text-muted-foreground" />
          Valoración de desempeño
        </CardTitle>
        <CardDescription>
          {alDia
            ? 'No tienes evaluaciones pendientes por responder.'
            : `Tienes ${pendientes} evaluación${pendientes === 1 ? '' : 'es'} por responder.`}
        </CardDescription>
      </CardHeader>

      {/* `justify-between`: los botones se van al pie de la tarjeta en vez de
          dejar el hueco debajo cuando la ficha de al lado es más alta. */}
      <CardContent className="flex flex-1 flex-col justify-between gap-4">
        <div className="flex flex-col gap-4">
          {alDia ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2Icon className="size-4 text-level-referente" />
              Estás al día.{' '}
              {resumen.myResults > 0 && 'Puedes revisar tus resultados cuando quieras.'}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <BarraAvance
                porcentaje={
                  resumen.myTotal ? ((resumen.myTotal - pendientes) / resumen.myTotal) * 100 : 0
                }
              />
              <span className="text-xs tabular-nums text-muted-foreground">
                {resumen.myTotal - pendientes} de {resumen.myTotal} respondidas
              </span>
            </div>
          )}

          {resumen.activeCycles.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-border pt-3">
              {resumen.activeCycles.slice(0, 2).map((ciclo) => (
                <div key={ciclo.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">{ciclo.name}</span>
                  <Badge variant="outline">
                    <CalendarClockIcon data-icon="inline-start" />
                    Cierra el {formatoFecha(ciclo.endDate)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {!alDia && (
            <Button size="sm" render={<Link to={`${BASE}/mis-evaluaciones`} />}>
              Responder ahora
            </Button>
          )}
          <Button size="sm" variant="outline" render={<Link to={`${BASE}/mis-resultados`} />}>
            Mis resultados
          </Button>
          {resumen.capabilities.canViewDashboard && (
            <Button size="sm" variant="outline" render={<Link to={`${BASE}/dashboard`} />}>
              Dashboard
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
