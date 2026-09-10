import { useState } from 'react';
import { DownloadIcon } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui';
import { descargarCsv, type Segmentacion } from '../api';
import { useConsolidado, useValoracionMutation } from '../hooks';
import { FiltrosSegmentacion } from '../components/Filtros';
import { TablaConsolidado } from '../components/TablaConsolidado';
import { Encabezado, Kpi } from '../components/Piezas';
import { BarraNivel } from '../components/Semaforo';

/** La tabla completa, una fila por persona, exportable con los filtros puestos. */
export default function ConsolidadoPage() {
  const [filtros, setFiltros] = useState<Segmentacion>({});
  const { data, isLoading } = useConsolidado(filtros);

  const exportar = useValoracionMutation(
    (recurso: 'exportar' | 'exportar-items') => descargarCsv(recurso, filtros),
    'Archivo descargado',
  );

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="Consolidado individual"
        descripcion="Una fila por persona con todas sus calificaciones ponderadas."
      >
        <Button
          variant="outline"
          disabled={exportar.isPending}
          onClick={() => exportar.mutate('exportar')}
        >
          <DownloadIcon data-icon="inline-start" />
          Exportar consolidado
        </Button>
        <Button
          variant="outline"
          disabled={exportar.isPending}
          onClick={() => exportar.mutate('exportar-items')}
        >
          <DownloadIcon data-icon="inline-start" />
          Exportar ítems
        </Button>
      </Encabezado>

      <FiltrosSegmentacion filtros={filtros} onChange={setFiltros} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi label="Personas" value={data?.total ?? 0} hint="En el filtro actual" />
        <Kpi label="Promedio" value={`${data?.average ?? 0}%`} hint="Sobre el consolidado" />
        <Kpi
          label="Calificaciones"
          value={(data?.items ?? []).reduce((total, fila) => total + fila.evaluations, 0)}
          hint="Evaluaciones que respaldan la tabla"
        />
      </div>

      {(data?.competencies ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Competencias del grupo filtrado</CardTitle>
            <CardDescription>Promedio ponderado por número de calificaciones.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {(data?.competencies ?? []).map((competencia) => (
              <div key={competencia.label} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium">{competencia.label}</span>
                  <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                    {competencia.average} / 5 · {competencia.percentage}% · {competencia.people}{' '}
                    persona(s)
                  </span>
                </div>
                <BarraNivel porcentaje={competencia.percentage} nivel={competencia.level} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="py-0">
        <TablaConsolidado filas={data?.items ?? []} cargando={isLoading} puedeVerFicha />
      </Card>

      <p className="text-xs text-muted-foreground">
        La exportación respeta la segmentación aplicada arriba: lo que ves es lo que baja al CSV.
      </p>
    </div>
  );
}
