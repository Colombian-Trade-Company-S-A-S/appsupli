import { Link } from 'react-router-dom';
import {
  ArrowRightIcon,
  ClipboardCheckIcon,
  ListChecksIcon,
  LockIcon,
  UsersIcon,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui';
import { Encabezado, Kpi } from '@/shared/components/layout';
import { FullPageLoader } from '@/shared/components/feedback';
import { etiquetaMes } from '../api';
import { useResumenPerformance } from '../hooks';
import { EstadoDelMes } from '../components/Piezas';
import { BASE } from './PerformanceLayout';

/**
 * La portada del sub-módulo: en qué va el mes.
 *
 * Cada quien ve lo suyo: el colaborador su ponderación, el líder cuántas
 * personas de su equipo ya quedaron completas.
 */
export default function PerformanceHomePage() {
  const { data: resumen, isLoading } = useResumenPerformance();

  if (isLoading || !resumen) return <FullPageLoader label="Abriendo Objetivos y KPIs…" />;

  const { capacidades } = resumen;
  const esLider = capacidades.esLider || capacidades.puedeDefinirACualquiera;

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="Objetivos y KPIs"
        descripcion="La medición cuantitativa del Performance: qué se espera de cada persona este mes y con qué se mide."
      >
        <EstadoDelMes estado={resumen.estado} label={resumen.estadoLabel} />
      </Encabezado>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Periodo"
          value={etiquetaMes(resumen.periodo)}
          hint={
            resumen.estado === 'definicion'
              ? 'Se pueden definir y editar objetivos'
              : 'Los objetivos quedaron congelados'
          }
        />
        <Kpi
          label="Mis objetivos"
          value={resumen.misObjetivos}
          hint={`${resumen.miPonderacion}% de ponderación asignada`}
          extra={<ListChecksIcon className="size-4 text-muted-foreground" />}
        />
        {esLider && (
          <>
            <Kpi
              label="Mi equipo"
              value={resumen.equipo}
              hint={`${resumen.equipoSinObjetivos} sin objetivos este mes`}
              extra={<UsersIcon className="size-4 text-muted-foreground" />}
            />
            <Kpi
              label="Completos al 100%"
              value={`${resumen.equipoCompleto} de ${resumen.equipo}`}
              hint="Personas cuyos objetivos ya suman 100%"
              extra={<ClipboardCheckIcon className="size-4 text-muted-foreground" />}
            />
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Mis objetivos</CardTitle>
            <CardDescription>
              Lo que se definió para ti este mes, con su meta y su peso. Se consulta, no se edita:
              los objetivos los define tu jefe.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" render={<Link to={`${BASE}/mis-objetivos`} />}>
              Ver mis objetivos
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          </CardContent>
        </Card>

        {esLider && (
          <Card>
            <CardHeader>
              <CardTitle>Objetivos del equipo</CardTitle>
              <CardDescription>
                Define los objetivos de cada persona a tu cargo. La ponderación de cada una debe
                sumar 100% para poder poner el mes en medición.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button render={<Link to={`${BASE}/equipo`} />}>
                Definir objetivos
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="border-dashed bg-muted/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <LockIcon className="size-4 text-muted-foreground" />
            Carga de resultado y evidencia
            <Badge variant="outline">Fase 2</Badge>
          </CardTitle>
          <CardDescription>
            Se habilita en octubre, cuando inicia la medición: ahí se registra lo ejecutado, se
            adjunta el soporte y el sistema calcula solo el % de cumplimiento. El dashboard, el
            semáforo y el Top Performance salen de esos datos.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
