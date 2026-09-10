import { Link } from 'react-router-dom';
import { AwardIcon, BarChart3Icon, TargetIcon } from 'lucide-react';
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
import { ApiError } from '@/shared/api/http-client';
import { useMisResultados, useResumen } from '../hooks';
import {
  Bloqueado,
  Encabezado,
  EstadoTabla,
  Kpi,
  Tendencia,
  formatoFecha,
} from '../components/Piezas';
import { BarraNivel, Competencias, NivelBadge } from '../components/Semaforo';

/** Mi consolidado y el detalle de cada ciclo en el que me evaluaron. */
export default function MisResultadosPage() {
  const { data, isLoading, error } = useMisResultados();
  const { data: resumen } = useResumen();

  if (error instanceof ApiError && error.status === 403) {
    return (
      <div className="flex flex-col gap-6">
        <Encabezado titulo="Mis resultados" />
        <Bloqueado seccion="Mis resultados" avance={resumen?.progress} />
      </div>
    );
  }

  const consolidado = data?.consolidated ?? null;
  const resultados = data?.results ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="Mis resultados"
        descripcion="Un solo número que pondera todas las calificaciones que has recibido."
      />

      {consolidado && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label="Consolidado"
              value={`${consolidado.percentage}%`}
              hint={`${consolidado.evaluations} calificación(es) en ${consolidado.cycles} ciclo(s)`}
            >
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
              label="Mirada del jefe"
              value={consolidado.managerAverage != null ? `${consolidado.managerAverage}%` : '—'}
              hint={`${consolidado.managerCount} calificación(es)`}
            />
            <Kpi
              label="Mirada del equipo"
              value={consolidado.teamAverage != null ? `${consolidado.teamAverage}%` : '—'}
              hint={`${consolidado.teamCount} calificación(es)`}
            />
          </div>

          {consolidado.selfAverage != null && (
            <Card>
              <CardHeader>
                <CardTitle>Autoevaluación</CardTitle>
                <CardDescription>
                  Queda como referencia: no suma al puntaje cuando hay mirada externa.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-6">
                <span className="text-2xl font-semibold tabular-nums">
                  {consolidado.selfAverage}%
                </span>
                <span className="text-sm text-muted-foreground">
                  {consolidado.selfCount} autoevaluación(es) registradas
                </span>
              </CardContent>
            </Card>
          )}

          {consolidado.competencies.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Resultado por competencia</CardTitle>
                <CardDescription>Promedio ponderado de todos tus ciclos.</CardDescription>
              </CardHeader>
              <CardContent>
                <Competencias items={consolidado.competencies} />
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Card className="py-0">
        <EstadoTabla
          cargando={isLoading}
          vacio={resultados.length === 0}
          icono={<BarChart3Icon />}
          titulo="Todavía no tienes resultados"
          descripcion="Aparecerán cuando se consolide un ciclo en el que te hayan evaluado."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ciclo</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Calificaciones</TableHead>
                <TableHead>Puntaje</TableHead>
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
                  <TableCell className="tabular-nums text-muted-foreground">
                    {resultado.evaluatorsTotal}
                  </TableCell>
                  <TableCell className="tabular-nums">{resultado.score} / 5</TableCell>
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

      {resultados.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AwardIcon className="size-4 text-level-referente" />
                Fortalezas
              </CardTitle>
              <CardDescription>Ítems donde saliste con promedio 4 o más.</CardDescription>
            </CardHeader>
            <CardContent>
              <ListaTexto
                items={resultados[0].strengths}
                vacio="Sin fortalezas destacadas todavía."
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TargetIcon className="size-4 text-level-acompanamiento" />
                Brechas
              </CardTitle>
              <CardDescription>Ítems con promedio de 2.5 o menos.</CardDescription>
            </CardHeader>
            <CardContent>
              <ListaTexto items={resultados[0].gaps} vacio="Sin brechas identificadas." />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function ListaTexto({ items, vacio }: { items: string[]; vacio: string }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{vacio}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((texto) => (
        <li key={texto} className="text-sm">
          {texto}
        </li>
      ))}
    </ul>
  );
}
