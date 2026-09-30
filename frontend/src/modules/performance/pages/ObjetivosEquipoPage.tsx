import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangleIcon,
  LockIcon,
  PlayIcon,
  PlusIcon,
  TargetIcon,
  UnlockIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldLabel,
  Textarea,
} from '@/shared/components/ui';
import { Encabezado, EstadoTabla } from '@/shared/components/layout';
import { ConfirmarBorrado, EsqueletoPagina } from '@/shared/components/feedback';
import { ApiError } from '@/shared/api/http-client';
import { etiquetaMes, mesDe, performanceApi, type Objetivo, type PesoIncompleto } from '../api';
import {
  performanceKeys,
  useEliminarObjetivo,
  useHabilitarEdicion,
  useObjetivos,
  useOpcionesPerformance,
  useResumenPeriodo,
  useValidarResultado,
} from '../hooks';
import {
  AvisoCongelado,
  BannerPonderacion,
  EstadoDelMes,
  LeyendaSemaforo,
  Selector,
} from '../components/Piezas';
import { CargaExcel } from '../components/CargaExcel';
import { FormularioObjetivo } from '../components/FormularioObjetivo';
import { FormularioResultado } from '../components/FormularioResultado';
import { TablaObjetivos } from '../components/TablaObjetivos';

/** El mes en curso: desde que empieza, ya se pueden cargar resultados. */
const mesActual = () => new Date().toISOString().slice(0, 7);

/**
 * «Objetivos del equipo»: la pantalla del mockup aprobado.
 *
 * Se trabaja sobre una persona y un mes a la vez —así se define en la vida
 * real, persona por persona— y el banner del 100% manda: mientras no cierre,
 * el mes no se puede poner en medición.
 */
export default function ObjetivosEquipoPage() {
  const { data: opciones, isLoading: cargandoOpciones } = useOpcionesPerformance();
  const [colaboradorId, setColaboradorId] = useState('');
  const [periodo, setPeriodo] = useState('');
  const [editando, setEditando] = useState<Objetivo | undefined>();
  const [porBorrar, setPorBorrar] = useState<Objetivo | null>(null);
  const [pendientes, setPendientes] = useState<PesoIncompleto | null>(null);
  const [cargando, setCargando] = useState<Objetivo | null>(null);
  const [excepcion, setExcepcion] = useState(false);
  const [motivo, setMotivo] = useState('');

  const periodos = opciones?.periodos ?? [];
  const equipo = opciones?.equipo ?? [];
  const periodoElegido = periodo || periodos[0]?.periodo || '';
  // Sin el seleccionado explícito se trabaja sobre el primero del equipo.
  const colaborador = equipo.find((persona) => String(persona.id) === colaboradorId) ?? equipo[0];

  const { data: objetivos = [], isLoading } = useObjetivos({
    colaborador: colaborador?.id,
    periodo: periodoElegido ? mesDe(periodoElegido) : undefined,
  });
  const { data: resumen } = useResumenPeriodo(periodoElegido, colaborador?.id);
  const eliminar = useEliminarObjetivo();
  const validar = useValidarResultado();
  const habilitarEdicion = useHabilitarEdicion();
  const queryClient = useQueryClient();

  const activar = useMutation({
    mutationFn: () => performanceApi.activarPeriodo(mesDe(periodoElegido)),
    onSuccess: (datos) => {
      setPendientes(null);
      queryClient.invalidateQueries({ queryKey: performanceKeys.todo });
      toast.success(datos.mensaje);
    },
    onError: (error) => {
      const cuerpo = error instanceof ApiError ? (error.body as PesoIncompleto) : null;
      if (cuerpo?.error === 'PESO_INCOMPLETO') {
        setPendientes(cuerpo);
        return;
      }
      toast.error(error instanceof ApiError ? error.message : 'No se pudo activar el mes.');
    },
  });

  if (cargandoOpciones || !opciones) return <EsqueletoPagina forma="lista" label="Abriendo Objetivos y KPIs…" />;

  if (equipo.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No tienes personas a cargo</CardTitle>
          <CardDescription>
            Los objetivos los define el jefe directo de cada persona. Si esto no es correcto, People
            puede ajustar la jerarquía desde el módulo de Valoración.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const ponderacion = resumen?.colaboradores.find((fila) => fila.colaborador === colaborador?.id);
  const estadoPeriodo = resumen?.estado ?? 'definicion';
  const enDefinicion = estadoPeriodo === 'definicion';
  const disponible = ponderacion?.pesoDisponible ?? 100;
  const completos = ponderacion?.objetivos ?? 0;
  // El mes se congela solo cuando empieza (A9). Lo dice el backend, que es
  // quien conoce la fecha y la excepción que haya autorizado People.
  const editable = resumen?.editable ?? true;
  const empezado = periodoElegido.slice(0, 7) <= mesActual();

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="Registrar objetivos y KPIs"
        descripcion="Los objetivos los define el jefe. El colaborador los consulta y, cuando el mes empieza, carga su resultado con la evidencia."
      >
        <EstadoDelMes estado={estadoPeriodo} label={resumen?.estadoLabel ?? 'En definición'} />
        {opciones.capacidades.puedeGestionarPeriodos && enDefinicion && (
          <Button onClick={() => activar.mutate()} disabled={activar.isPending}>
            <PlayIcon data-icon="inline-start" />
            Poner el mes en medición
          </Button>
        )}
      </Encabezado>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,20rem)_minmax(0,16rem)_1fr] lg:items-end">
        <Selector
          id="eq-colaborador"
          label="Colaborador"
          placeholder="Selecciona a la persona"
          value={String(colaborador?.id ?? '')}
          onChange={(valor) => {
            setColaboradorId(valor);
            setEditando(undefined);
          }}
          opciones={equipo.map((persona) => ({
            value: String(persona.id),
            label: persona.cargo ? `${persona.nombre} — ${persona.cargo}` : persona.nombre,
          }))}
        />
        <Selector
          id="eq-periodo"
          label="Periodo"
          placeholder="Selecciona el mes"
          value={periodoElegido}
          onChange={(valor) => {
            setPeriodo(valor);
            setEditando(undefined);
          }}
          opciones={periodos.map((p) => ({
            value: p.periodo,
            label: `${etiquetaMes(p.periodo)} · ${p.estadoLabel}`,
          }))}
        />
        <p className="text-xs text-muted-foreground">
          {colaborador?.area && <>Área: {colaborador.area} · </>}
          {colaborador?.direccion && <>Dirección: {colaborador.direccion} · </>}
          Jefe: {colaborador?.jefe || '—'}
          <br />
          Al iniciar la medición, los objetivos del mes se congelan.
        </p>
      </div>

      {pendientes && (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>{pendientes.mensaje}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {pendientes.pendientes.map((fila) => (
                <li key={fila.colaborador}>{fila.mensaje}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <BannerPonderacion ponderacion={ponderacion} />

      <AvisoCongelado
        motivo={resumen?.motivo ?? ''}
        edicionHabilitada={!!resumen?.edicionHabilitada}
      >
        {opciones.capacidades.puedeGestionarPeriodos && (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() =>
              resumen?.edicionHabilitada
                ? habilitarEdicion.mutate({ periodo: periodoElegido, habilitada: false })
                : setExcepcion(true)
            }
          >
            {resumen?.edicionHabilitada ? <LockIcon /> : <UnlockIcon />}
            {resumen?.edicionHabilitada ? 'Volver a congelar' : 'Habilitar edición'}
          </Button>
        )}
      </AvisoCongelado>

      {editable ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PlusIcon className="size-4 text-muted-foreground" />
              {editando ? 'Editar objetivo' : 'Nuevo objetivo'}
            </CardTitle>
            <CardDescription>
              Campos mínimos según el framework. El % de cumplimiento nunca se digita: lo calcula el
              sistema según el tipo de medición.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {colaborador && (
              <FormularioObjetivo
                opciones={opciones}
                colaborador={colaborador}
                periodo={periodoElegido}
                disponible={disponible}
                objetivo={editando}
                onListo={() => setEditando(undefined)}
                onCancelar={editando ? () => setEditando(undefined) : undefined}
              />
            )}
          </CardContent>
        </Card>
      ) : null}

      {editable && (
        <CargaExcel colaborador={colaborador} periodo={periodoElegido} deshabilitado={!editable} />
      )}

      <Card className="py-0">
        <CardHeader className="pt-6">
          <CardTitle>Objetivos del mes — {colaborador?.nombre}</CardTitle>
          <CardDescription>
            {etiquetaMes(periodoElegido)} · {completos} de {opciones.maximoObjetivos} objetivos · El
            colaborador ve esta tabla en solo lectura.
          </CardDescription>
        </CardHeader>
        <EstadoTabla
          cargando={isLoading}
          vacio={objetivos.length === 0}
          icono={<TargetIcon />}
          titulo="Esta persona no tiene objetivos este mes"
          descripcion="Agrega el primero con el formulario de arriba. Entre todos deben sumar 100%."
        >
          <TablaObjetivos
            objetivos={objetivos}
            onEditar={setEditando}
            onEliminar={setPorBorrar}
            onCargar={setCargando}
            onValidar={(objetivo) => validar.mutate({ objetivo: objetivo.id, estado: 'validado' })}
            // El resultado se carga desde que el mes empieza: antes no hay qué
            // cargar. Validar es dar por bueno lo que ya subió alguien más.
            puedeCargar={() => empezado}
            puedeValidar={(objetivo) => objetivo.resultado?.estadoValidacion !== 'validado'}
          />
        </EstadoTabla>
        <div className="px-6 pb-6">
          <LeyendaSemaforo cortes={opciones.semaforo} />
        </div>
      </Card>

      <Dialog open={!!cargando} onOpenChange={(abierto) => !abierto && setCargando(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Cargar resultado</DialogTitle>
            <DialogDescription>
              Lo ejecutado del mes y sus soportes. El % de cumplimiento lo calcula el sistema.
            </DialogDescription>
          </DialogHeader>
          {cargando && (
            <FormularioResultado objetivo={cargando} onListo={() => setCargando(null)} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={excepcion} onOpenChange={setExcepcion}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Habilitar la edición de {etiquetaMes(periodoElegido)}</DialogTitle>
            <DialogDescription>
              Es una excepción: los objetivos de un mes se editan hasta el último día del mes
              anterior. Queda registrado quién la habilitó, cuándo y por qué.
            </DialogDescription>
          </DialogHeader>
          <Field className="min-w-0">
            <FieldLabel htmlFor="excepcion-motivo">Motivo y quién lo autorizó</FieldLabel>
            <Textarea
              id="excepcion-motivo"
              rows={3}
              placeholder="Reestructuración del área, autorizada por el CEO el 2 de octubre."
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExcepcion(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!motivo.trim() || habilitarEdicion.isPending}
              onClick={() =>
                habilitarEdicion.mutate(
                  { periodo: periodoElegido, habilitada: true, motivo },
                  { onSuccess: () => setExcepcion(false) },
                )
              }
            >
              Habilitar edición
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmarBorrado
        abierto={!!porBorrar}
        onOpenChange={(abierto) => !abierto && setPorBorrar(null)}
        titulo="¿Eliminar este objetivo?"
        descripcion={`«${porBorrar?.objetivo}» dejará de contar en la ponderación de ${colaborador?.nombre}.`}
        onConfirmar={() => {
          if (porBorrar) eliminar.mutate(porBorrar.id);
          setPorBorrar(null);
        }}
      />
    </div>
  );
}
