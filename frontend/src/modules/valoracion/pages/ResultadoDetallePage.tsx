import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeftIcon, MessageSquareIcon, SearchIcon, UsersIcon } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Separator,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  ToggleGroup,
  ToggleGroupItem,
} from '@/shared/components/ui';
import { FullPageLoader } from '@/shared/components/feedback';
import { ApiError } from '@/shared/api/http-client';
import { cn } from '@/shared/lib/utils';
import type { RolEvaluador } from '../api';
import { useResultado, useResumen } from '../hooks';
import { Bloqueado, Encabezado, Kpi, formatoFecha } from '../components/Piezas';
import { BarraNivel, Competencias, NivelBadge } from '../components/Semaforo';

const ROLES: Array<{ value: RolEvaluador | 'todos'; label: string }> = [
  { value: 'todos', label: 'Todos' },
  { value: 'jefe', label: 'Jefe' },
  { value: 'equipo', label: 'Equipo' },
  { value: 'autoevaluacion', label: 'Autoevaluación' },
];

/** Detalle de un resultado: KPIs, competencias, ítem por ítem y comentarios. */
export default function ResultadoDetallePage() {
  const { id } = useParams<{ id: string }>();
  const [rol, setRol] = useState<string>('todos');
  const [buscar, setBuscar] = useState('');

  const { data, isLoading, error } = useResultado(Number(id), {
    evaluator_role: rol === 'todos' ? undefined : rol,
    search: buscar || undefined,
  });
  const { data: resumen } = useResumen();

  if (error instanceof ApiError && error.status === 403) {
    return (
      <div className="flex flex-col gap-6">
        <Encabezado titulo="Detalle del resultado" />
        <Bloqueado seccion="Mis resultados" avance={resumen?.progress} />
      </div>
    );
  }
  if (isLoading || !data) return <FullPageLoader label="Cargando el resultado…" />;

  const { result: resultado, items, competencies: competencias } = data;

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo={resultado.evaluateeName}
        descripcion={`${resultado.cycleName} · ${resultado.evaluationTypeLabel} · ${
          resultado.evaluateePosition || 'Sin cargo'
        }`}
      >
        <Button variant="outline" onClick={() => history.back()}>
          <ArrowLeftIcon data-icon="inline-start" />
          Volver
        </Button>
      </Encabezado>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Porcentaje" value={`${resultado.percentage}%`}>
          <BarraNivel
            porcentaje={Number(resultado.percentage)}
            nivel={resultado.level}
            className="mt-1"
          />
          <NivelBadge nivel={resultado.level} className="mt-1" />
        </Kpi>
        <Kpi
          label="Puntaje"
          value={`${resultado.score} / 5`}
          hint={`${resultado.evaluatorsTotal} calificación(es)`}
        />
        <Kpi
          label="Jefe"
          value={resultado.evaluatorsManager ? `${resultado.managerScore}%` : '—'}
          hint={`${resultado.evaluatorsManager} calificación(es)`}
        />
        <Kpi
          label="Equipo"
          value={resultado.evaluatorsTeam ? `${resultado.teamScore}%` : '—'}
          hint={`${resultado.evaluatorsTeam} calificación(es)`}
        />
        <Kpi
          label="Autoevaluación"
          value={resultado.evaluatorsSelf ? `${resultado.selfScore}%` : '—'}
          hint="Solo referencia"
        />
      </div>

      {competencias.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Resultado por competencia</CardTitle>
            <CardDescription>
              Las competencias son internas: el evaluador nunca las ve al calificar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Competencias items={competencias} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <CardTitle>Cada ítem evaluado</CardTitle>
              <CardDescription>
                {data.filteredCount} de {data.evaluatorsCount} calificación(es) en el filtro actual.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-52">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Buscar un ítem…"
                  value={buscar}
                  onChange={(e) => setBuscar(e.target.value)}
                />
              </div>
              <ToggleGroup
                value={[rol]}
                onValueChange={(v) => setRol((v[0] as string) ?? 'todos')}
                variant="outline"
              >
                {ROLES.map((opcion) => (
                  <ToggleGroupItem key={opcion.value} value={opcion.value}>
                    {opcion.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-64">Ítem</TableHead>
                  <TableHead>Promedio</TableHead>
                  <TableHead>Nivel</TableHead>
                  <TableHead className="hidden lg:table-cell">Jefe</TableHead>
                  <TableHead className="hidden lg:table-cell">Equipo</TableHead>
                  <TableHead className="hidden lg:table-cell">Auto</TableHead>
                  <TableHead className="hidden xl:table-cell">Brecha</TableHead>
                  <TableHead className="hidden min-w-40 xl:table-cell">Distribución</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.questionId}>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span>{item.statement}</span>
                        <span className="text-xs text-muted-foreground">
                          {item.competencyLabel} · {item.answersCount} calificación(es)
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums">{item.average}</TableCell>
                    <TableCell>
                      <NivelBadge nivel={item.level} corto />
                    </TableCell>
                    <TableCell className="hidden tabular-nums text-muted-foreground lg:table-cell">
                      {item.managerAverage ?? '—'}
                    </TableCell>
                    <TableCell className="hidden tabular-nums text-muted-foreground lg:table-cell">
                      {item.teamAverage ?? '—'}
                    </TableCell>
                    <TableCell className="hidden tabular-nums text-muted-foreground lg:table-cell">
                      {item.selfAverage ?? '—'}
                    </TableCell>
                    <TableCell
                      className={cn(
                        // Una brecha grande se marca con peso, no con color: el
                        // color queda reservado para las marcas del semáforo.
                        'hidden tabular-nums xl:table-cell',
                        item.selfGap != null && Math.abs(item.selfGap) >= 1
                          ? 'font-semibold text-foreground'
                          : 'text-muted-foreground',
                      )}
                      title="Diferencia entre la autoevaluación y la mirada externa"
                    >
                      {item.selfGap != null
                        ? item.selfGap > 0
                          ? `+${item.selfGap}`
                          : item.selfGap
                        : '—'}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      <div className="flex items-center gap-1">
                        {item.distribution.map((tramo) => (
                          <span
                            key={tramo.value}
                            title={`${tramo.label}: ${tramo.count}`}
                            className="flex h-6 min-w-6 items-center justify-center rounded border border-border text-xs tabular-nums text-muted-foreground"
                          >
                            {tramo.count || '·'}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {items.length === 0 && (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              Ningún ítem coincide con el filtro.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UsersIcon className="size-4 text-muted-foreground" />
              Calificaciones recibidas
            </CardTitle>
            <CardDescription>
              {data.showEvaluator
                ? 'El puntaje que dio cada evaluador.'
                : 'Este ciclo es anónimo: no se muestra quién calificó.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {data.ratings.length === 0 && (
              <p className="text-sm text-muted-foreground">Sin calificaciones consolidadas.</p>
            )}
            {data.ratings.map((calificacion, indice) => (
              <div
                key={`${calificacion.evaluator}-${indice}`}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{calificacion.evaluator}</span>
                  <span className="text-xs text-muted-foreground">
                    {calificacion.roleLabel} · {formatoFecha(calificacion.completedAt)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm tabular-nums">{calificacion.percentage}%</span>
                  <Badge variant="outline">{calificacion.score} / 5</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquareIcon className="size-4 text-muted-foreground" />
              Observaciones y acuerdos
            </CardTitle>
            <CardDescription>Lo cualitativo: compromisos y comentarios abiertos.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {data.agreements.length === 0 && data.openAnswers.length === 0 && (
              <p className="text-sm text-muted-foreground">Sin comentarios registrados.</p>
            )}
            {data.agreements.map((acuerdo, indice) => (
              <div key={`acuerdo-${indice}`} className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  {acuerdo.evaluator} · {acuerdo.roleLabel}
                </span>
                <p className="text-sm">{acuerdo.text}</p>
              </div>
            ))}
            {data.openAnswers.length > 0 && data.agreements.length > 0 && <Separator />}
            {data.openAnswers.map((abierta, indice) => (
              <div key={`abierta-${indice}`} className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  {abierta.statement}
                </span>
                <p className="text-sm">{abierta.text}</p>
                <span className="text-xs text-muted-foreground">
                  {abierta.evaluator} · {abierta.roleLabel}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {data.canManagePlans && (
        <div className="flex justify-end">
          <Button variant="outline" render={<Link to="/inicio/valoracion/planes" />}>
            Crear un plan de acción sobre estas brechas
          </Button>
        </div>
      )}
    </div>
  );
}
