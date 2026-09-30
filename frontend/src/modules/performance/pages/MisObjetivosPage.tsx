import { useState } from 'react';
import { ListChecksIcon, LockIcon } from 'lucide-react';
import {
  Badge,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui';
import { useAuth } from '@/core/auth';
import { Encabezado, EstadoTabla } from '@/shared/components/layout';
import { etiquetaMes, mesDe, type Objetivo } from '../api';
import { useMisObjetivos, useOpcionesPerformance } from '../hooks';
import { BannerPonderacion, LeyendaSemaforo, Selector } from '../components/Piezas';
import { FormularioResultado } from '../components/FormularioResultado';
import { TablaObjetivos } from '../components/TablaObjetivos';

/** El mes en curso: desde que empieza, ya se puede cargar el resultado. */
const mesActual = () => new Date().toISOString().slice(0, 7);

/**
 * Lo que ve el colaborador: sus objetivos del mes, en solo lectura.
 *
 * Es la regla 3 de la especificación puesta en pantalla: acá no hay ni un
 * botón de editar, porque el objetivo lo define el jefe.
 */
export default function MisObjetivosPage() {
  const { user } = useAuth();
  const { data: opciones } = useOpcionesPerformance();
  const periodos = opciones?.periodos ?? [];
  const [periodo, setPeriodo] = useState('');
  const [cargando, setCargando] = useState<Objetivo | null>(null);
  const elegido = periodo || periodos[0]?.periodo || '';
  const { data: objetivos = [], isLoading } = useMisObjetivos(elegido ? mesDe(elegido) : undefined);

  const asignado = objetivos.reduce((total, objetivo) => total + Number(objetivo.peso), 0);
  const congelados = objetivos.some((objetivo) => !objetivo.editable);
  const empezado = elegido.slice(0, 7) <= mesActual();
  // Cada quien carga lo suyo, salvo los objetivos cuyo resultado carga otra
  // persona: es el caso de los asesores, que los sube su Trade Leader.
  const mio = (objetivo: Objetivo) =>
    empezado && (objetivo.responsableResultado ?? objetivo.colaborador) === user?.id;

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="Mis objetivos"
        descripcion="Lo que se definió para ti este mes: qué se espera, con qué se mide y cuánto pesa."
      >
        {congelados && (
          <Badge variant="outline" className="gap-1.5">
            <LockIcon className="size-3" />
            Congelados: se definieron antes de que empezara el mes
          </Badge>
        )}
      </Encabezado>

      <div className="max-w-xs">
        <Selector
          id="mis-periodo"
          label="Periodo"
          placeholder="Selecciona el mes"
          value={elegido}
          onChange={setPeriodo}
          opciones={periodos.map((p) => ({
            value: p.periodo,
            label: `${etiquetaMes(p.periodo)} · ${p.estadoLabel}`,
          }))}
        />
      </div>

      {objetivos.length > 0 && (
        <BannerPonderacion
          ponderacion={{
            colaborador: 0,
            colaboradorNombre: '',
            cargo: '',
            objetivos: objetivos.length,
            pesoAsignado: Number(asignado.toFixed(2)),
            pesoDisponible: Number((100 - asignado).toFixed(2)),
            completo: Math.abs(asignado - 100) < 0.005,
            maximoObjetivos: opciones?.maximoObjetivos ?? 6,
          }}
        />
      )}

      <Card className="py-0">
        <EstadoTabla
          cargando={isLoading}
          vacio={objetivos.length === 0}
          icono={<ListChecksIcon />}
          titulo="Todavía no tienes objetivos este mes"
          descripcion="Tu jefe los define desde «Objetivos del equipo». Apenas los cargue, aparecen acá."
        >
          <TablaObjetivos
            objetivos={objetivos}
            soloLectura
            onCargar={setCargando}
            puedeCargar={mio}
          />
        </EstadoTabla>
        <div className="px-6 pb-6">
          <LeyendaSemaforo cortes={opciones?.semaforo} />
        </div>
      </Card>

      <Dialog open={!!cargando} onOpenChange={(abierto) => !abierto && setCargando(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Cargar mi resultado</DialogTitle>
            <DialogDescription>
              Lo ejecutado del mes y el enlace del soporte. El % de cumplimiento lo calcula el
              sistema; tu jefe lo valida después.
            </DialogDescription>
          </DialogHeader>
          {cargando && (
            <FormularioResultado objetivo={cargando} onListo={() => setCargando(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
