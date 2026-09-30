import { useState } from 'react';
import { GaugeIcon } from 'lucide-react';
import {
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
import { Encabezado, EstadoTabla, Kpi } from '@/shared/components/layout';
import { EsqueletoPagina } from '@/shared/components/feedback';
import { useAcumulado, useOpcionesPerformance } from '../hooks';
import { AnilloCumplimiento, LeyendaSemaforo, SemaforoBadge } from '../components/Piezas';
import { SelectorCorte, type CorteElegido } from '../components/SelectorCorte';

/** En qué corte cae hoy: el trimestre 4 en octubre, por ejemplo. */
function corteInicial(): CorteElegido {
  const hoy = new Date();
  return {
    tipo: 'mes',
    anio: hoy.getFullYear(),
    indice: hoy.getMonth() + 1,
  };
}

/**
 * El semáforo del equipo en el corte elegido.
 *
 * Acumula por mes, Q (trimestre), semestre o año, que son los cuatro cortes
 * oficiales (A8). Lo que todavía no tiene resultado cargado no cuenta como
 * cero: se muestra aparte, porque un dato que falta no es una brecha.
 */
export default function DashboardPage() {
  const { data: opciones } = useOpcionesPerformance();
  const [corte, setCorte] = useState<CorteElegido>(corteInicial);
  const { data, isLoading } = useAcumulado(corte);

  if (!opciones) return <EsqueletoPagina forma="tablero" label="Abriendo el tablero…" />;

  const filas = data?.colaboradores ?? [];
  const sinMedir = filas.filter((fila) => fila.cumplimiento === null).length;

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="Semáforo del equipo"
        descripcion="El cumplimiento de cada persona en el corte que elijas, con los cortes de color que definió People."
      />

      <SelectorCorte cortes={opciones.cortes} valor={corte} onChange={setCorte} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Periodo" value={data?.label ?? '—'} hint={data?.tipoLabel} />
        <Kpi
          label="Cumplimiento promedio"
          value={
            data?.promedio === null || data?.promedio === undefined ? '—' : `${data.promedio}%`
          }
          hint="Promedio de quienes ya tienen resultado"
          extra={
            <AnilloCumplimiento
              cumplimiento={data?.promedio}
              semaforo={data?.semaforoPromedio}
              tamano={44}
            />
          }
        />
        <Kpi
          label="Top performer"
          value={data?.top?.colaboradorNombre ?? '—'}
          hint={data?.top ? `${data.top.cumplimiento}% de cumplimiento` : 'Sin resultados cargados'}
        />
        <Kpi
          label="Brechas críticas"
          value={data?.brechas ?? 0}
          hint={sinMedir ? `${sinMedir} persona(s) sin medir` : 'Por debajo del 85%'}
        />
      </div>

      <Card className="py-0">
        <CardHeader className="pt-6">
          <CardTitle>Estado por persona</CardTitle>
          <CardDescription>
            {data?.label ?? ''} · lo que no tiene resultado cargado aparece como «sin cargar», no
            como incumplido.
          </CardDescription>
        </CardHeader>
        <EstadoTabla
          cargando={isLoading}
          vacio={filas.length === 0}
          icono={<GaugeIcon />}
          titulo="Todavía no hay a quién medir"
          descripcion="Cuando tu equipo tenga objetivos cargados en este periodo, aparecen acá."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Colaborador</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead className="text-right">Objetivos</TableHead>
                <TableHead className="text-right">Medidos</TableHead>
                <TableHead>Cumplimiento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((fila) => (
                <TableRow key={fila.colaborador}>
                  <TableCell className="font-medium">{fila.colaboradorNombre}</TableCell>
                  <TableCell className="text-muted-foreground">{fila.cargo || '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{fila.objetivos}</TableCell>
                  <TableCell className="text-right tabular-nums">{fila.medidos}</TableCell>
                  <TableCell>
                    <SemaforoBadge semaforo={fila.semaforo} cumplimiento={fila.cumplimiento} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </EstadoTabla>
        <div className="px-6 pb-6">
          <LeyendaSemaforo cortes={data?.cortes ?? opciones.semaforo} />
        </div>
      </Card>
    </div>
  );
}
