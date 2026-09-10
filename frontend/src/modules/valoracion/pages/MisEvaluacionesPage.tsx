import { Link } from 'react-router-dom';
import { ClipboardCheckIcon, InboxIcon, LockIcon, PencilLineIcon } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui';
import type { EstadoAsignacion } from '../api';
import { useMisEvaluaciones } from '../hooks';
import { Encabezado, EstadoTabla, formatoFecha } from '../components/Piezas';
import { BarraAvance } from '../components/Semaforo';

const VARIANTE: Record<EstadoAsignacion, 'outline' | 'warning' | 'success'> = {
  pendiente: 'outline',
  en_progreso: 'warning',
  completada: 'success',
};

/** Las personas que me toca calificar. */
export default function MisEvaluacionesPage() {
  const { data: evaluaciones = [], isLoading } = useMisEvaluaciones();

  const pendientes = evaluaciones.filter((e) => e.status !== 'completada').length;

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="Mis evaluaciones"
        descripcion={
          pendientes > 0
            ? `Te faltan ${pendientes} por responder. Puedes guardar un borrador y continuar después.`
            : 'No tienes evaluaciones pendientes.'
        }
      />

      <Card className="py-0">
        <EstadoTabla
          cargando={isLoading}
          vacio={evaluaciones.length === 0}
          icono={<InboxIcon />}
          titulo="No tienes evaluaciones asignadas"
          descripcion="Cuando People abra un ciclo y te asigne personas por calificar, aparecerán aquí."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Persona a evaluar</TableHead>
                <TableHead className="hidden md:table-cell">Ciclo</TableHead>
                <TableHead className="hidden xl:table-cell">Tipo</TableHead>
                <TableHead className="hidden xl:table-cell">Mi rol</TableHead>
                <TableHead>Avance</TableHead>
                <TableHead className="hidden lg:table-cell">Cierra</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {evaluaciones.map((evaluacion) => {
                const porcentaje = evaluacion.questionsTotal
                  ? Math.round((evaluacion.questionsAnswered / evaluacion.questionsTotal) * 100)
                  : 0;
                return (
                  <TableRow key={evaluacion.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{evaluacion.evaluateeName}</span>
                        <span className="text-xs text-muted-foreground">
                          {evaluacion.evaluateePosition || 'Sin cargo'}
                          {evaluacion.evaluateeArea ? ` · ${evaluacion.evaluateeArea}` : ''}
                        </span>
                        {/* En angosto se esconden Ciclo y Cierra: van aquí. */}
                        <span className="text-xs text-muted-foreground lg:hidden">
                          <span className="md:hidden">{evaluacion.cycleName} · </span>
                          cierra {formatoFecha(evaluacion.cycleEndDate)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {evaluacion.cycleName}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      <Badge variant="secondary">{evaluacion.evaluationTypeLabel}</Badge>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground xl:table-cell">
                      {evaluacion.evaluatorRoleLabel}
                    </TableCell>
                    <TableCell className="min-w-32">
                      <div className="flex flex-col gap-1">
                        <BarraAvance porcentaje={porcentaje} />
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {evaluacion.questionsAnswered}/{evaluacion.questionsTotal}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {formatoFecha(evaluacion.cycleEndDate)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={VARIANTE[evaluacion.status]}>{evaluacion.statusLabel}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {evaluacion.canAnswer ? (
                        <Button
                          size="sm"
                          variant={evaluacion.status === 'pendiente' ? 'default' : 'outline'}
                          render={
                            <Link to={`/inicio/valoracion/mis-evaluaciones/${evaluacion.id}`} />
                          }
                        >
                          <PencilLineIcon data-icon="inline-start" />
                          {evaluacion.status === 'pendiente' ? 'Responder' : 'Continuar'}
                        </Button>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                          title={evaluacion.blockedReason ?? ''}
                        >
                          {evaluacion.status === 'completada' ? (
                            <ClipboardCheckIcon className="size-3.5" />
                          ) : (
                            <LockIcon className="size-3.5" />
                          )}
                          {evaluacion.status === 'completada' ? 'Enviada' : 'Cerrada'}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </EstadoTabla>
      </Card>
    </div>
  );
}
