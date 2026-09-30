import { TrophyIcon } from 'lucide-react';
import { Kpi } from '@/shared/components/layout';
import { useMisRetos } from '../hooks';

/** Lo que Supli Challenge aporta a la franja de indicadores del inicio. */
export default function HomeKpis() {
  const { data, isLoading } = useMisRetos();

  return (
    <Kpi
      label="Mis puntos Challenge"
      cargando={isLoading}
      value={data?.puntos ?? 0}
      hint={`${data?.ganados ?? 0} ganado${data?.ganados === 1 ? '' : 's'} de ${data?.retos ?? 0} reto${data?.retos === 1 ? '' : 's'}`}
      extra={<TrophyIcon className="size-4 text-muted-foreground" />}
    />
  );
}
