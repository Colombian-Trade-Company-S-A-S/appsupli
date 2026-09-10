import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3Icon } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
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
import type { Segmentacion } from '../api';
import { useResultadosEquipo, useResumen } from '../hooks';
import { FiltrosSegmentacion } from '../components/Filtros';
import { TablaConsolidado } from '../components/TablaConsolidado';
import { Encabezado, EstadoTabla, Kpi, formatoFecha } from '../components/Piezas';
import { NivelBadge } from '../components/Semaforo';

/** El equipo a cargo (o toda la compañía si el rol lo permite). */
export default function ResultadosEquipoPage() {
  const [filtros, setFiltros] = useState<Segmentacion>({});
  const { data, isLoading } = useResultadosEquipo(filtros);
  const { data: resumen } = useResumen();

  const consolidado = data?.consolidated ?? [];
  const resultados = data?.results ?? [];
  const verFicha = !!resumen?.capabilities.canViewDashboard;

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="Resultados del equipo"
        descripcion={
          data?.scope === 'company'
            ? 'Visibilidad de toda la compañía.'
            : 'Las personas que te tienen como jefe directo.'
        }
      />

      <FiltrosSegmentacion filtros={filtros} onChange={setFiltros} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi label="Personas" value={consolidado.length} hint="Con resultado consolidado" />
        <Kpi
          label="Promedio del grupo"
          value={`${data?.average ?? 0}%`}
          hint="Sobre el consolidado individual"
        />
        <Kpi
          label="Calificaciones"
          value={consolidado.reduce((total, fila) => total + fila.evaluations, 0)}
          hint="Evaluaciones que respaldan estos números"
        />
      </div>

      <Card className="py-0">
        <TablaConsolidado filas={consolidado} cargando={isLoading} puedeVerFicha={verFicha} />
      </Card>

      <Card className="py-0">
        <CardHeader className="pt-6">
          <CardTitle>Detalle por ciclo</CardTitle>
          <CardDescription>
            El mismo grupo, ciclo a ciclo, por si necesitas ver la evolución.
          </CardDescription>
        </CardHeader>
        <EstadoTabla
          cargando={isLoading}
          vacio={resultados.length === 0}
          icono={<BarChart3Icon />}
          titulo="Sin resultados por ciclo"
          descripcion="Cuando se consolide un ciclo, cada resultado aparecerá aquí."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Persona</TableHead>
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
                  <TableCell className="font-medium">{resultado.evaluateeName}</TableCell>
                  <TableCell className="text-muted-foreground">{resultado.cycleName}</TableCell>
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
    </div>
  );
}
