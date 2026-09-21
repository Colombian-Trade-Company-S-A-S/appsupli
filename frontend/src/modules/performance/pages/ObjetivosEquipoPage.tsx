import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangleIcon, LockIcon, PlayIcon, PlusIcon, TargetIcon } from 'lucide-react';
import { toast } from 'sonner';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui';
import { Encabezado, EstadoTabla } from '@/shared/components/layout';
import { ConfirmarBorrado, FullPageLoader } from '@/shared/components/feedback';
import { ApiError } from '@/shared/api/http-client';
import { etiquetaMes, mesDe, performanceApi, type Objetivo, type PesoIncompleto } from '../api';
import {
  performanceKeys,
  useEliminarObjetivo,
  useObjetivos,
  useOpcionesPerformance,
  useResumenPeriodo,
} from '../hooks';
import { BannerPonderacion, EstadoDelMes, Selector } from '../components/Piezas';
import { FormularioObjetivo } from '../components/FormularioObjetivo';
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
  const [periodo, setPeriodo] = useState('');
  const [editando, setEditando] = useState<Objetivo | undefined>();
  const [porBorrar, setPorBorrar] = useState<Objetivo | null>(null);
  const [pendientes, setPendientes] = useState<PesoIncompleto | null>(null);

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

  if (cargandoOpciones || !opciones) return <FullPageLoader label="Abriendo Objetivos y KPIs…" />;

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

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="Registrar objetivos y KPIs"
        descripcion="Los objetivos los define el jefe. El colaborador solo consulta y, desde octubre, carga su resultado y evidencia."
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

      {enDefinicion ? (
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
      ) : (
        <Alert>
          <LockIcon />
          <AlertTitle>El mes está en medición</AlertTitle>
          <AlertDescription>
            Los objetivos quedaron congelados y ya no se editan. Para cambiar alguno hace falta la
            autorización de People.
          </AlertDescription>
        </Alert>
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
          <TablaObjetivos objetivos={objetivos} onEditar={setEditando} onEliminar={setPorBorrar} />
        </EstadoTabla>
      </Card>

      <Card className="border-dashed bg-muted/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <LockIcon className="size-4 text-muted-foreground" />
            Carga de resultado y evidencia
            <Badge variant="outline">Fase 2</Badge>
          </CardTitle>
          <CardDescription>Se habilita en octubre, cuando inicia la medición.</CardDescription>
        </CardHeader>
      </Card>

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
