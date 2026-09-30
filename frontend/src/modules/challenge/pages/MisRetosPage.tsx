import { Link } from 'react-router-dom';
import { ListChecksIcon } from 'lucide-react';
import {
  Button,
  Card,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui';
import { Encabezado, EstadoTabla, Kpi } from '@/shared/components/layout';
import { useMisRetos } from '../hooks';
import { CategoriaBadge, EstadoEntrega } from '../components/Piezas';
import { BASE } from './ChallengeLayout';

/** «Mi participación»: en qué retos estuve, con qué estado y cuánto sumé. */
export default function MisRetosPage() {
  const { data, isLoading } = useMisRetos();
  const filas = data?.participaciones ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="Mi participación"
        descripcion="Los retos en los que participaste, tu valoración y lo que sumaste."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Retos participados" value={data?.retos ?? 0} />
        <Kpi label="Retos ganados" value={data?.ganados ?? 0} />
        <Kpi
          label="Puntos acumulados"
          value={data?.puntos ?? 0}
          hint="Incluye bonus de desempate"
        />
      </div>

      <Card className="py-0">
        <EstadoTabla
          cargando={isLoading}
          vacio={filas.length === 0}
          icono={<ListChecksIcon />}
          titulo="Todavía no has participado"
          descripcion="Cuando cargues la evidencia de un reto, aparece acá con su estado."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reto</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Puntaje</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((fila) => (
                <TableRow key={fila.id}>
                  <TableCell className="font-medium text-pretty">
                    {fila.retoTitulo}
                    {fila.esGanador && (
                      <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
                        · ganador
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <CategoriaBadge label={fila.categoriaLabel} />
                  </TableCell>
                  <TableCell>
                    <EstadoEntrega estado={fila.estado} label={fila.estadoLabel} />
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {fila.total ?? '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      render={<Link to={`${BASE}/retos/${fila.reto}`} />}
                    >
                      Ver
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
