import { useState } from 'react';
import { TrophyIcon } from 'lucide-react';
import { Avatar, AvatarFallback, Card, CardContent } from '@/shared/components/ui';
import { Encabezado, EstadoTabla } from '@/shared/components/layout';
import { EsqueletoPagina } from '@/shared/components/feedback';
import { cn } from '@/shared/lib/utils';
import type { CumplimientoPersona } from '../api';
import { useAcumulado, useOpcionesPerformance } from '../hooks';
import { AnilloCumplimiento, LeyendaSemaforo, SemaforoBadge } from '../components/Piezas';
import { SelectorCorte, type CorteElegido } from '../components/SelectorCorte';

/** Las iniciales, como en el prototipo: «Laura Ayala» → «LA». */
const iniciales = (nombre: string) =>
  nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join('');

function Podio({ personas }: { personas: CumplimientoPersona[] }) {
  const [primero, ...resto] = personas;
  if (!primero) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardContent className="flex items-center gap-4 pt-6">
          <Avatar className="size-14">
            <AvatarFallback className="bg-amber-500/20 text-lg font-semibold">
              {iniciales(primero.colaboradorNombre)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <TrophyIcon className="size-3.5 text-amber-500" />
              Reconocimiento del periodo
            </p>
            <p className="truncate text-lg font-semibold">{primero.colaboradorNombre}</p>
            <p className="text-sm text-muted-foreground">
              {primero.cargo || 'Sin cargo'} · {primero.cumplimiento}% de cumplimiento
            </p>
          </div>
          <AnilloCumplimiento
            cumplimiento={primero.cumplimiento}
            semaforo={primero.semaforo}
            tamano={72}
            className="ml-auto"
          />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        {resto.slice(0, 4).map((persona, indice) => (
          <div
            key={persona.colaborador}
            className={cn(
              'flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm',
              indice === 0 && 'bg-muted/40',
            )}
          >
            <span className="w-5 text-center font-semibold tabular-nums text-muted-foreground">
              {indice + 2}
            </span>
            <Avatar className="size-8">
              <AvatarFallback className="text-xs">
                {iniciales(persona.colaboradorNombre)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{persona.colaboradorNombre}</p>
              <p className="truncate text-xs text-muted-foreground">{persona.cargo}</p>
            </div>
            <SemaforoBadge semaforo={persona.semaforo} cumplimiento={persona.cumplimiento} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Top Performance: el ranking por resultados de KPIs.
 *
 * Solo entran quienes ya tienen resultado cargado en el corte: un ranking con
 * gente sin medir ordenaría por quién alcanzó a subir su evidencia, no por
 * desempeño.
 */
export default function TopPerformancePage() {
  const { data: opciones } = useOpcionesPerformance();
  const hoy = new Date();
  const [corte, setCorte] = useState<CorteElegido>({
    tipo: 'mes',
    anio: hoy.getFullYear(),
    indice: hoy.getMonth() + 1,
  });
  const { data, isLoading } = useAcumulado(corte);

  if (!opciones) return <EsqueletoPagina forma="tablero" label="Abriendo el Top Performance…" />;

  const medidos = (data?.colaboradores ?? []).filter((fila) => fila.cumplimiento !== null);

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="Top Performance"
        descripcion="El ranking por resultados de KPIs en el corte elegido. Entran quienes ya tienen resultado cargado."
      />

      <SelectorCorte cortes={opciones.cortes} valor={corte} onChange={setCorte} />

      <Card className="py-0">
        <EstadoTabla
          cargando={isLoading}
          vacio={medidos.length === 0}
          icono={<TrophyIcon />}
          titulo="Todavía no hay resultados cargados"
          descripcion="El ranking aparece cuando alguien del equipo cargue su resultado en este periodo."
        >
          <div className="flex flex-col gap-4 p-6">
            <Podio personas={medidos} />
            <LeyendaSemaforo cortes={data?.cortes ?? opciones.semaforo} />
          </div>
        </EstadoTabla>
      </Card>
    </div>
  );
}
