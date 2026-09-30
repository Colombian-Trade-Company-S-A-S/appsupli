import { ClipboardCheckIcon, TargetIcon } from 'lucide-react';
import { Kpi } from '@/shared/components/layout';
import { useResumenPerformance } from '../hooks';

/** Lo que Objetivos y KPIs aporta a la franja de indicadores del inicio. */
export default function HomeKpis() {
  const { data, isLoading } = useResumenPerformance();
  const esLider =
    !!data && (data.capacidades.esLider || data.capacidades.puedeDefinirACualquiera);

  return (
    <>
      <Kpi
        label="Mis objetivos"
        cargando={isLoading}
        value={data?.misObjetivos ?? 0}
        hint={`${data?.miPonderacion ?? 0}% de ponderación asignada`}
        extra={<TargetIcon className="size-4 text-muted-foreground" />}
      />
      {esLider && (
        <Kpi
          label="Equipo al 100%"
          value={`${data.equipoCompleto} de ${data.equipo}`}
          hint={`${data.equipoSinObjetivos} sin objetivos este mes`}
          extra={<ClipboardCheckIcon className="size-4 text-muted-foreground" />}
        />
      )}
    </>
  );
}
