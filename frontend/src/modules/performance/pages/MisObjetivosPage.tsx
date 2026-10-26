import { useState } from 'react';
import { InfoIcon, ListChecksIcon, LockIcon } from 'lucide-react';
import {
  Badge,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui';
import { Encabezado, EstadoTabla } from '@/shared/components/layout';
import { etiquetaMes, mesDe, mesEnCurso, periodoPorDefecto, type Objetivo } from '../api';
import { useMisObjetivos, useOpcionesPerformance } from '../hooks';
import { BannerPonderacion, LeyendaSemaforo, Selector } from '../components/Piezas';
import { FormularioResultado } from '../components/FormularioResultado';
import { TablaObjetivos } from '../components/TablaObjetivos';

/**
 * Lo que ve el colaborador: sus objetivos del mes, en solo lectura.
 *
 * Es la regla 3 de la especificación puesta en pantalla: acá no hay ni un
 * botón de editar, porque el objetivo lo define el jefe.
 */
export default function MisObjetivosPage() {
  const { data: opciones } = useOpcionesPerformance();
  const periodos = opciones?.periodos ?? [];
  const [periodo, setPeriodo] = useState('');
  const [cargando, setCargando] = useState<Objetivo | null>(null);
  const elegido = periodo || periodoPorDefecto(periodos);
  const { data: objetivos = [], isLoading } = useMisObjetivos(elegido ? mesDe(elegido) : undefined);

  const asignado = objetivos.reduce((total, objetivo) => total + Number(objetivo.peso), 0);
  const congelados = objetivos.some((objetivo) => !objetivo.editable);
  const empezado = elegido.slice(0, 7) <= mesEnCurso();
  // En «Mis objetivos» el colaborador registra su % y su evidencia (su jefe los
  // aprueba). Asesores y promotores no: a ellos se los registra su jefe.
  const mio = (objetivo: Objetivo) => empezado && objetivo.puedeCargar;
  const loRegistraElJefe = objetivos.length > 0 && objetivos.every((o) => !o.puedeCargar);

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

      {loRegistraElJefe && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <InfoIcon className="mt-0.5 size-4 shrink-0" />
          <span className="text-pretty">
            El % de cumplimiento de tus objetivos lo registra tu jefe inmediato con la evidencia
            {objetivos[0].aprobadorNombre ? ` y lo aprueba ${objetivos[0].aprobadorNombre}` : ''}.
          </span>
        </p>
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
            <DialogTitle>Registrar mi cumplimiento</DialogTitle>
            <DialogDescription>
              Tu % de cumplimiento del mes, de 0 a 100, con el enlace de la evidencia. Tu jefe la
              revisa y lo aprueba.
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
