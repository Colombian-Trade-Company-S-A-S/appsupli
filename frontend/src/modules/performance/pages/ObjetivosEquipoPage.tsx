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
  FieldDescription,
  FieldLabel,
  Input,
  Switch,
  Textarea,
} from '@/shared/components/ui';
import { Encabezado, EstadoTabla } from '@/shared/components/layout';
import { ConfirmarBorrado, EsqueletoPagina } from '@/shared/components/feedback';
import { ApiError } from '@/shared/api/http-client';
import {
  etiquetaMes,
  mesDe,
  mesEnCurso,
  performanceApi,
  periodoPorDefecto,
  type Objetivo,
  type PesoIncompleto,
} from '../api';
import {
  performanceKeys,
  useEliminarObjetivo,
  useHabilitarEdicion,
  useObjetivos,
  useOpcionesPerformance,
  useResumenPeriodo,
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
import { RevisionResultado } from '../components/RevisionResultado';
import { TablaObjetivos } from '../components/TablaObjetivos';

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
  const [verCompania, setVerCompania] = useState(false);
  const [periodo, setPeriodo] = useState('');
  const [editando, setEditando] = useState<Objetivo | undefined>();
  const [porBorrar, setPorBorrar] = useState<Objetivo | null>(null);
  const [pendientes, setPendientes] = useState<PesoIncompleto | null>(null);
  const [cargando, setCargando] = useState<Objetivo | null>(null);
  const [revisandoId, setRevisandoId] = useState<number | null>(null);
  const [excepcion, setExcepcion] = useState(false);
  const [hasta, setHasta] = useState('');
  const [motivo, setMotivo] = useState('');

  const periodos = opciones?.periodos ?? [];
  // Por defecto, solo las personas a cargo directo (y el CEO a sí mismo). Quien
  // ve toda la organización —People, el CEO— puede ampliar a la compañía; si
  // no tiene a nadie a cargo, arranca ahí.
  const aCargo = opciones?.equipo ?? [];
  const compania = opciones?.compania ?? [];
  const puedeVerCompania = compania.length > 0;
  const mostrarCompania = puedeVerCompania && (verCompania || aCargo.length === 0);
  const base = mostrarCompania ? compania : aCargo;
  // Asesores y promotores de sus líderes: el Trade Marketing Manager no les
  // define objetivos, pero aprueba su resultado, así que también los ve.
  const soloAprueba = (opciones?.apruebaResultados ?? []).filter(
    (persona) => !base.some((otra) => otra.id === persona.id),
  );
  const equipo = [...base, ...soloAprueba];
  const periodoElegido = periodo || periodoPorDefecto(periodos);
  // Sin el seleccionado explícito se trabaja sobre el primero del equipo.
  const colaborador = equipo.find((persona) => String(persona.id) === colaboradorId) ?? equipo[0];
  const apruebaSuResultado = soloAprueba.some((persona) => persona.id === colaborador?.id);
  // A quien no le define objetivos (el asesor de otro líder, o cualquiera de
  // la compañía si no es People) solo se le consulta y se le revisa.
  const soloRevision =
    !!colaborador &&
    !opciones?.capacidades.puedeDefinirACualquiera &&
    !aCargo.some((persona) => persona.id === colaborador.id);

  const { data: objetivos = [], isLoading } = useObjetivos({
    colaborador: colaborador?.id,
    periodo: periodoElegido ? mesDe(periodoElegido) : undefined,
  });
  const { data: resumen } = useResumenPeriodo(periodoElegido, colaborador?.id);
  const enRevision = objetivos.find((objetivo) => objetivo.id === revisandoId);
  const eliminar = useEliminarObjetivo();
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

  if (cargandoOpciones || !opciones)
    return <EsqueletoPagina forma="lista" label="Abriendo Objetivos y KPIs…" />;

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
  // Al asesor de otro líder solo se le revisa el resultado: sus objetivos los
  // define su jefe directo.
  const editable = (resumen?.editable ?? true) && !soloRevision;
  const empezado = periodoElegido.slice(0, 7) <= mesEnCurso();

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="Registrar objetivos y KPIs"
        descripcion="Los objetivos los define el jefe. Cuando el mes empieza, el colaborador registra su % de cumplimiento (0 a 100) con la evidencia y el jefe lo aprueba."
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
        <div className="flex min-w-0 flex-col gap-2">
          <Selector
            id="eq-colaborador"
            label="Colaborador"
            placeholder="Selecciona a la persona"
            value={String(colaborador?.id ?? '')}
            onChange={(valor) => {
              setColaboradorId(valor);
              setEditando(undefined);
            }}
            opciones={equipo.map((persona) => {
              const nombre = persona.cargo
                ? `${persona.nombre} — ${persona.cargo}`
                : persona.nombre;
              return {
                value: String(persona.id),
                label: soloAprueba.includes(persona) ? `${nombre} · apruebas su resultado` : nombre,
              };
            })}
          />
          {puedeVerCompania && aCargo.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch
                checked={verCompania}
                onCheckedChange={(valor) => {
                  setVerCompania(Boolean(valor));
                  setColaboradorId('');
                  setEditando(undefined);
                }}
              />
              Ver toda la compañía
            </label>
          )}
        </div>
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
          {colaborador?.asesorOPromotor && colaborador.aprobador && (
            <> · Aprueba: {colaborador.aprobador}</>
          )}
          <br />
          {apruebaSuResultado
            ? 'Sus objetivos los define su jefe directo; tú apruebas el % que él registra.'
            : soloRevision
              ? 'Solo consulta: sus objetivos los define y aprueba su jefe directo.'
              : 'Al iniciar la medición, los objetivos del mes se congelan.'}
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
        motivo={soloRevision ? '' : (resumen?.motivo ?? '')}
        edicionHabilitada={!soloRevision && !!resumen?.edicionHabilitada}
        edicionHasta={resumen?.edicionHasta}
      >
        {/* Solo People abre la edición, hasta un día; si hace falta, la amplía. */}
        {opciones.capacidades.puedeGestionarPeriodos && (
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setHasta(resumen?.edicionHasta ?? '');
                setMotivo('');
                setExcepcion(true);
              }}
            >
              <UnlockIcon />
              {resumen?.edicionHabilitada ? 'Ampliar plazo' : 'Habilitar edición'}
            </Button>
            {resumen?.edicionHabilitada && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  habilitarEdicion.mutate({ periodo: periodoElegido, habilitada: false })
                }
              >
                <LockIcon />
                Volver a congelar
              </Button>
            )}
          </div>
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
              Todos los objetivos se miden igual: con el % de cumplimiento, de 0 a 100, que se
              registra con su evidencia y aprueba el jefe.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {colaborador && (
              <FormularioObjetivo
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
            soloLectura={soloRevision}
            onEditar={setEditando}
            onEliminar={setPorBorrar}
            onCargar={setCargando}
            // El colaborador registra su %; el jefe lo revisa acá (ve lo
            // cargado, deja feedback, aprueba o devuelve) y también puede
            // registrarlo por él. Con asesores y promotores lo registra el
            // jefe y lo aprueba el Trade Marketing Manager: el backend dice
            // quién puede qué. Antes de que empiece el mes no hay qué cargar.
            onRevisar={(objetivo) => setRevisandoId(objetivo.id)}
            puedeCargar={(objetivo) => empezado && objetivo.puedeCargar}
          />
        </EstadoTabla>
        <div className="px-6 pb-6">
          <LeyendaSemaforo cortes={opciones.semaforo} />
        </div>
      </Card>

      <Dialog open={!!cargando} onOpenChange={(abierto) => !abierto && setCargando(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Registrar cumplimiento</DialogTitle>
            <DialogDescription>
              El % de cumplimiento del mes, de 0 a 100, con los soportes que lo respaldan.
            </DialogDescription>
          </DialogHeader>
          {cargando && (
            <FormularioResultado objetivo={cargando} onListo={() => setCargando(null)} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!enRevision} onOpenChange={(abierto) => !abierto && setRevisandoId(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Revisar resultado — {colaborador?.nombre}</DialogTitle>
            <DialogDescription>
              El % registrado y sus evidencias; si es una corrección, qué cambió desde que se
              devolvió. Verifica que la evidencia respalde el % antes de aprobarlo.
            </DialogDescription>
          </DialogHeader>
          {enRevision && (
            <RevisionResultado
              key={enRevision.id}
              objetivo={enRevision}
              onListo={() => setRevisandoId(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={excepcion} onOpenChange={setExcepcion}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Habilitar la edición de {etiquetaMes(periodoElegido)}</DialogTitle>
            <DialogDescription>
              Los objetivos de un mes se editan hasta el último día del mes anterior. People puede
              abrir la edición unos días más; al pasar la fecha se vuelve a congelar sola. Queda
              registrado quién la habilitó y cuándo.
            </DialogDescription>
          </DialogHeader>
          <Field className="min-w-0">
            <FieldLabel htmlFor="excepcion-hasta">Abierta hasta el</FieldLabel>
            <Input
              id="excepcion-hasta"
              type="date"
              min={hoyLocal()}
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
            />
            <FieldDescription>
              Ese día incluido. Si hace falta más, se amplía después.
            </FieldDescription>
          </Field>
          <Field className="min-w-0">
            <FieldLabel htmlFor="excepcion-motivo">Motivo (opcional)</FieldLabel>
            <Textarea
              id="excepcion-motivo"
              rows={2}
              placeholder="Ampliación del plazo para cargar objetivos."
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExcepcion(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!hasta || hasta < hoyLocal() || habilitarEdicion.isPending}
              onClick={() =>
                habilitarEdicion.mutate(
                  { periodo: periodoElegido, habilitada: true, hasta, motivo },
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

/** Hoy como `AAAA-MM-DD`, con la fecha local (no UTC), para el campo de fecha. */
function hoyLocal() {
  const hoy = new Date();
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${hoy.getFullYear()}-${dos(hoy.getMonth() + 1)}-${dos(hoy.getDate())}`;
}
