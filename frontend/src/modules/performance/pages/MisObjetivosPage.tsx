import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ClockIcon, InfoIcon, ListChecksIcon, LockIcon } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui';
import { Encabezado, EstadoTabla } from '@/shared/components/layout';
import {
  etiquetaMes,
  inicioDeMedicion,
  mesDe,
  mesTerminado,
  periodoPorDefecto,
  type Objetivo,
} from '../api';
import { useMisObjetivos, useOpcionesPerformance, useResumenPerformance } from '../hooks';
import { BannerPonderacion, LeyendaSemaforo, Selector } from '../components/Piezas';
import { FormularioResultado } from '../components/FormularioResultado';
import { TablaObjetivos } from '../components/TablaObjetivos';

/**
 * Lo que ve el colaborador: sus objetivos del mes, en solo lectura.
 *
 * Es la regla 3 de la especificación puesta en pantalla: acá no hay ni un
 * botón de editar, porque el objetivo lo define el jefe. Lo que sí hace el
 * colaborador es aceptar o rechazar, uno por uno, lo que le asignaron.
 *
 * `?periodo=2026-12-01` abre ese mes: es a donde llevan los avisos de
 * objetivos por aceptar.
 */
export default function MisObjetivosPage() {
  const { data: opciones } = useOpcionesPerformance();
  const { data: resumen } = useResumenPerformance();
  const periodos = opciones?.periodos ?? [];
  const [params] = useSearchParams();
  const [periodo, setPeriodo] = useState(params.get('periodo') ?? '');
  const [cargando, setCargando] = useState<Objetivo | null>(null);
  const elegido = periodo || periodoPorDefecto(periodos);
  const { data: objetivos = [], isLoading } = useMisObjetivos(elegido ? mesDe(elegido) : undefined);

  const asignado = objetivos.reduce((total, objetivo) => total + Number(objetivo.peso), 0);
  const congelados = objetivos.some((objetivo) => !objetivo.editable);
  // El % se registra cuando el mes termina: los de noviembre, desde el 1 de diciembre.
  const terminado = mesTerminado(elegido);
  // En «Mis objetivos» el colaborador registra su % y su evidencia (su jefe los
  // aprueba). Asesores y promotores no: a ellos se los registra su jefe.
  const mio = (objetivo: Objetivo) => terminado && objetivo.puedeCargar;
  const loRegistraElJefe = objetivos.length > 0 && objetivos.every((o) => !o.puedeCargar);
  const porResponder = objetivos.filter((o) => o.puedeResponder).length;
  // Los de diciembre se asignan en noviembre: se avisa de otros meses con
  // objetivos esperando respuesta, para no tener que buscarlos en el selector.
  const otrosMeses = (resumen?.porAceptar ?? []).filter(
    (fila) => mesDe(fila.periodo) !== mesDe(elegido),
  );

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="Mis objetivos"
        descripcion="Lo que se definió para ti: qué se espera, con qué se mide y cuánto pesa. Acepta o rechaza cada objetivo que te asignen."
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

      {otrosMeses.map((fila) => (
        <Alert key={fila.periodo}>
          <ClockIcon />
          <AlertTitle>
            Tienes {fila.cantidad} objetivo{fila.cantidad === 1 ? '' : 's'} de{' '}
            {etiquetaMes(fila.periodo)} por aceptar
          </AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-pretty">
              Revísalos uno por uno: acéptalos o recházalos con el motivo.
            </span>
            <Button size="sm" variant="outline" onClick={() => setPeriodo(fila.periodo)}>
              Ver {etiquetaMes(fila.periodo)}
            </Button>
          </AlertDescription>
        </Alert>
      ))}

      {porResponder > 0 && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <InfoIcon className="mt-0.5 size-4 shrink-0" />
          <span className="text-pretty">
            Tienes {porResponder} objetivo{porResponder === 1 ? '' : 's'} por aceptar. Acepta los
            que estén bien; si rechazas uno, escribe el motivo: tu jefe lo ajusta y te vuelve a
            llegar.
          </span>
        </p>
      )}

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

      {objetivos.length > 0 && !terminado && !loRegistraElJefe && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <InfoIcon className="mt-0.5 size-4 shrink-0" />
          <span className="text-pretty">
            Tu % de cumplimiento de {etiquetaMes(elegido)} se registra cuando el mes termina: desde
            el {inicioDeMedicion(elegido)}.
          </span>
        </p>
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
              Tu % de cumplimiento del mes, de 0 a 100, con el enlace de la evidencia.{' '}
              {opciones?.capacidades.puedeAutogestionar
                ? 'Queda aprobado al guardarlo; People lo audita después.'
                : 'Tu jefe la revisa y lo aprueba.'}
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
