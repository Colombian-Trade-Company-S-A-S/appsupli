import { useState } from 'react';
import { EsqueletoPagina } from '@/shared/components/feedback';
import { useMiCumplimiento, useOpcionesPlanner } from '../hooks';
import { DetalleCumplimiento } from '../components/DetalleCumplimiento';
import { SelectorSemana } from '../components/Piezas';

/** El cumplimiento propio: semana elegida, índice mensual y las últimas ocho semanas. */
export default function MiCumplimientoPage() {
  const { data: opciones } = useOpcionesPlanner();
  const [semana, setSemana] = useState<string>();
  const { data, isLoading } = useMiCumplimiento(semana);

  if (!opciones) return <EsqueletoPagina forma="tablero" label="Abriendo tu cumplimiento…" />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SelectorSemana
          id="mi-semana"
          semanas={opciones.semanas}
          value={semana ?? data?.semana.codigo ?? opciones.semanaActual.codigo}
          onChange={setSemana}
        />
        {opciones.miPlan && (
          <p className="text-sm text-muted-foreground">
            Tu plan: <b className="font-medium text-foreground">{opciones.miPlan.titulo}</b>
            {opciones.miPlan.grupo ? ` · ${opciones.miPlan.grupo}` : ''}
          </p>
        )}
      </div>
      <DetalleCumplimiento
        datos={data}
        parametros={opciones.parametros}
        onSemana={setSemana}
        cargando={isLoading}
      />
    </div>
  );
}
