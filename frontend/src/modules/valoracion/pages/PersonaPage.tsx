import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeftIcon, UserRoundIcon } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui';
import { FullPageLoader } from '@/shared/components/feedback';
import type { Segmentacion } from '../api';
import { usePersona } from '../hooks';
import { FiltrosSegmentacion } from '../components/Filtros';
import { Encabezado, EstadoTabla, Kpi, Tendencia, formatoFecha } from '../components/Piezas';
import { BarraNivel, Competencias, NivelBadge } from '../components/Semaforo';

/** Ficha individual: cómo viene una persona a lo largo de todos sus ciclos. */
export default function PersonaPage() {
  const { id } = useParams<{ id: string }>();
  const [filtros, setFiltros] = useState<Segmentacion>({});
  const { data, isLoading } = usePersona(Number(id), filtros);

  if (isLoading || !data) return <FullPageLoader label="Cargando la ficha…" />;

  const { person: persona, consolidated: consolidado, results: resultados } = data;

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo={persona.fullName}
        descripcion={[
          persona.position,
          persona.area,
          persona.manager && `Reporta a ${persona.manager}`,
        ]
          .filter(Boolean)
          .join(' · ')}
      >
        <Button variant="outline" render={<Link to="/inicio/valoracion/consolidado" />}>
          <ArrowLeftIcon data-icon="inline-start" />
          Volver al consolidado
        </Button>
      </Encabezado>

      <FiltrosSegmentacion
        filtros={filtros}
        onChange={setFiltros}
        ocultar={['person', 'area', 'team', 'kind', 'position']}
      />

      {!consolidado ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <UserRoundIcon className="size-8 text-muted-foreground" />
            <p className="font-medium">Esta persona todavía no tiene resultados consolidados</p>
            <p className="text-sm text-muted-foreground">
              Aparecerán cuando se consolide un ciclo en el que la hayan evaluado.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Kpi label="Consolidado" value={`${consolidado.percentage}%`}>
              <BarraNivel
                porcentaje={consolidado.percentage}
                nivel={consolidado.level}
                className="mt-1"
              />
              <NivelBadge nivel={consolidado.level} className="mt-1" />
            </Kpi>
            <Kpi
              label="Puntaje"
              value={`${consolidado.score} / 5`}
              hint={<Tendencia valor={consolidado.trend} />}
            />
            <Kpi
              label="Jefe"
              value={consolidado.managerAverage != null ? `${consolidado.managerAverage}%` : '—'}
              hint={`${consolidado.managerCount} calificación(es)`}
            />
            <Kpi
              label="Equipo"
              value={consolidado.teamAverage != null ? `${consolidado.teamAverage}%` : '—'}
              hint={`${consolidado.teamCount} calificación(es)`}
            />
            <Kpi
              label="Autoevaluación"
              value={consolidado.selfAverage != null ? `${consolidado.selfAverage}%` : '—'}
              hint="Solo referencia"
            />
          </div>

          {consolidado.competencies.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Resultado por competencia</CardTitle>
                <CardDescription>Ponderado por las calificaciones de cada ciclo.</CardDescription>
              </CardHeader>
              <CardContent>
                <Competencias items={consolidado.competencies} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Evolución por ciclo</CardTitle>
              <CardDescription>El histórico que sustenta el consolidado.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {consolidado.history.map((punto) => (
                <div key={punto.resultId} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <Link
                      to={`/inicio/valoracion/resultados/${punto.resultId}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {punto.cycle}
                    </Link>
                    <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                      {punto.percentage}% · {punto.evaluators} calificación(es)
                    </span>
                  </div>
                  <BarraNivel porcentaje={punto.percentage} nivel={punto.level} />
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      <Card className="py-0">
        <CardHeader className="pt-6">
          <CardTitle>Resultados</CardTitle>
          <CardDescription>Cada ciclo con su semáforo y su detalle.</CardDescription>
        </CardHeader>
        <EstadoTabla
          cargando={isLoading}
          vacio={resultados.length === 0}
          icono={<UserRoundIcon />}
          titulo="Sin resultados"
          descripcion="No hay ciclos consolidados para esta persona con los filtros actuales."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ciclo</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Calificaciones</TableHead>
                <TableHead>Porcentaje</TableHead>
                <TableHead>Semáforo</TableHead>
                <TableHead>Calculado</TableHead>
                <TableHead className="text-right">Detalle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resultados.map((resultado) => (
                <TableRow key={resultado.id}>
                  <TableCell className="font-medium">{resultado.cycleName}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{resultado.evaluationTypeLabel}</Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">{resultado.evaluatorsTotal}</TableCell>
                  <TableCell className="tabular-nums">{resultado.percentage}%</TableCell>
                  <TableCell>
                    <NivelBadge nivel={resultado.level} corto />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatoFecha(resultado.computedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      render={<Link to={`/inicio/valoracion/resultados/${resultado.id}`} />}
                    >
                      Ver ítems
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </EstadoTabla>
      </Card>

      {data.actionPlans.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Planes de acción</CardTitle>
            <CardDescription>Compromisos abiertos sobre sus brechas.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {data.actionPlans.map((plan) => (
              <div key={plan.id} className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col">
                  <span className="text-sm">{plan.description}</span>
                  <span className="text-xs text-muted-foreground">
                    {plan.ownerName} · vence {formatoFecha(plan.dueDate)}
                  </span>
                </div>
                <Badge
                  variant={
                    plan.status === 'cumplido'
                      ? 'success'
                      : plan.isOverdue
                        ? 'destructive'
                        : 'outline'
                  }
                >
                  {plan.statusLabel}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
