import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ActivityIcon,
  ChevronDownIcon,
  DownloadIcon,
  CircleCheckIcon,
  CircleXIcon,
  EyeIcon,
  HistoryIcon,
  RefreshCwIcon,
} from 'lucide-react';
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
  Checkbox,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Skeleton,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui';
import { formatoFechaHora } from '@/shared/lib/formato';
import {
  adminApi,
  type EstadoOdoo,
  type ExcepcionOdoo,
  type OpcionesSincronizacion,
  type SincronizacionOdoo,
} from '../api';
import { adminKeys, mensajeDeError, useAccesosPendientes, useSincronizacionesOdoo } from '../hooks';

const OPCIONES: {
  clave: keyof Omit<OpcionesSincronizacion, 'simular'>;
  titulo: string;
  ayuda: string;
}[] = [
  {
    clave: 'crear',
    titulo: 'Crear nuevos',
    ayuda: 'Empleados activos de Odoo que aún no están en appsupli.',
  },
  {
    clave: 'actualizar',
    titulo: 'Actualizar información',
    ayuda: 'Nombre, cargo, área, jefe y demás datos de quienes ya están.',
  },
  {
    clave: 'desactivar',
    titulo: 'Desactivar bajas',
    ayuda: 'Quien está archivado en Odoo queda inactivo, con su histórico.',
  },
  {
    clave: 'eliminar',
    titulo: 'Eliminar a quien no está en Odoo',
    ayuda:
      'Borra con sus registros a quien no está en Odoo, y las áreas que no son de Odoo. No se deshace; nunca toca a un admin.',
  },
];

const CIFRAS: { clave: string; titulo: string }[] = [
  { clave: 'creados', titulo: 'Creados' },
  { clave: 'actualizados', titulo: 'Actualizados' },
  { clave: 'sinCambios', titulo: 'Sin cambios' },
  { clave: 'desactivados', titulo: 'Desactivados' },
  { clave: 'eliminados', titulo: 'Eliminados' },
  { clave: 'areasEliminadas', titulo: 'Áreas eliminadas' },
  { clave: 'nuevosSinCrear', titulo: 'Nuevos sin crear' },
  { clave: 'existentesSinActualizar', titulo: 'Sin actualizar' },
  { clave: 'bajasSinDesactivar', titulo: 'Bajas sin desactivar' },
  { clave: 'departamentos', titulo: 'Departamentos' },
];

const TIPOS_EXCEPCION: Record<string, string> = {
  sin_cedula: 'Sin cédula',
  cedula_duplicada: 'Cédula repetida',
  sin_jefe: 'Sin jefe inmediato',
  sin_departamento: 'Sin departamento',
  correo_otro_dominio: 'Correo de otro dominio',
  correo_duplicado: 'Correo repetido en Odoo',
  correo_en_uso: 'Correo que ya tiene otra persona',
  inactivo_en_appsupli: 'Activo en Odoo, inactivo en appsupli',
  admin_de_baja: 'Admin archivado en Odoo',
  eliminado: 'Eliminados: no están en Odoo',
  conservado_sin_odoo: 'Admins que no están en Odoo (se conservan)',
  area_eliminada: 'Áreas eliminadas: no están en Odoo',
};

/** Integración con Odoo: solo lectura. Odoo → base de appsupli. */
export function OdooTab() {
  const [estado, setEstado] = useState<EstadoOdoo | null>(null);
  const [dialogo, setDialogo] = useState(false);
  const [seleccionada, setSeleccionada] = useState<SincronizacionOdoo | null>(null);
  const { data: historial = [], isLoading } = useSincronizacionesOdoo();

  const probar = useMutation({
    mutationFn: adminApi.odoo.estado,
    onSuccess: setEstado,
    onError: (error) => toast.error(mensajeDeError(error)),
  });

  const queryClient = useQueryClient();
  const { data: accesos } = useAccesosPendientes();
  const pendientes = accesos?.pendientes ?? 0;
  const descargar = useMutation({
    mutationFn: adminApi.odoo.descargarAccesos,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.todo });
      toast.success('Excel descargado. Guárdalo bien: las contraseñas no se pueden volver a ver.');
    },
    onError: (error) => toast.error(mensajeDeError(error)),
  });

  const ultima = historial.find((s) => !s.simulacion);
  const mostrada = seleccionada ?? historial[0] ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          appsupli solo lee de Odoo y guarda una copia en su base: si Odoo se cae, todo sigue
          funcionando con la última sincronización
          {ultima ? ` (${formatoFechaHora(ultima.iniciadaAt)})` : ''}.
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="outline" onClick={() => probar.mutate()} disabled={probar.isPending}>
            {probar.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <ActivityIcon data-icon="inline-start" />
            )}
            Estado API
          </Button>
          <Button
            variant="outline"
            onClick={() => descargar.mutate()}
            disabled={!pendientes || descargar.isPending}
            title="Genera la contraseña de quienes llegaron de Odoo sin clave y descarga el Excel"
          >
            {descargar.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <DownloadIcon data-icon="inline-start" />
            )}
            Accesos ({pendientes})
          </Button>
          <Button onClick={() => setDialogo(true)}>
            <RefreshCwIcon data-icon="inline-start" />
            Sincronizar
          </Button>
        </div>
      </div>

      {estado && <TarjetaEstado estado={estado} />}

      {mostrada && <Resultado sincronizacion={mostrada} />}

      <Card className="py-0">
        {isLoading ? (
          <div className="flex flex-col gap-3 p-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : historial.length === 0 ? (
          <Empty className="py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HistoryIcon />
              </EmptyMedia>
              <EmptyTitle>Sin sincronizaciones</EmptyTitle>
              <EmptyDescription>
                Prueba primero el estado de la API y después haz una vista previa.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Opciones</TableHead>
                  <TableHead>Por</TableHead>
                  <TableHead>Resultado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historial.map((s) => (
                  <TableRow
                    key={s.id}
                    className="cursor-pointer"
                    data-state={mostrada?.id === s.id ? 'selected' : undefined}
                    onClick={() => setSeleccionada(s)}
                  >
                    <TableCell className="whitespace-nowrap">
                      {formatoFechaHora(s.iniciadaAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.simulacion ? 'outline' : 'secondary'}>
                        {s.simulacion ? 'Vista previa' : 'Sincronización'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{textoOpciones(s)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.ejecutadaPorNombre || 'Tarea programada'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.estado === 'ok' ? 'success' : 'destructive'}>
                        {s.estado === 'ok' ? 'Correcta' : 'Con error'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <DialogoSincronizar
        abierto={dialogo}
        onOpenChange={setDialogo}
        onResultado={(s) => setSeleccionada(s)}
      />
    </div>
  );
}

const textoOpciones = (s: SincronizacionOdoo) =>
  OPCIONES.filter((o) => s[o.clave])
    .map((o) => o.titulo.toLowerCase())
    .join(', ');

function TarjetaEstado({ estado }: { estado: EstadoOdoo }) {
  return (
    <Alert variant={estado.conectado ? 'default' : 'destructive'}>
      {estado.conectado ? <CircleCheckIcon /> : <CircleXIcon />}
      <AlertTitle>
        {estado.conectado ? 'La API de Odoo responde' : 'Sin conexión con Odoo'}
      </AlertTitle>
      <AlertDescription>{estado.mensaje}</AlertDescription>
    </Alert>
  );
}

function Resultado({ sincronizacion: s }: { sincronizacion: SincronizacionOdoo }) {
  const grupos = s.excepciones.reduce<Record<string, ExcepcionOdoo[]>>((acc, e) => {
    (acc[e.tipo] ??= []).push(e);
    return acc;
  }, {});
  const cifras = CIFRAS.filter((c) => s.resumen[c.clave]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {s.simulacion ? 'Vista previa' : 'Sincronización'} del {formatoFechaHora(s.iniciadaAt)}
          {s.simulacion && <Badge variant="outline">No se guardó nada</Badge>}
        </CardTitle>
        <CardDescription>
          {textoOpciones(s)} · {s.resumen.empleadosActivosOdoo ?? 0} empleados activos en Odoo
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {s.estado === 'error' ? (
          <Alert variant="destructive">
            <CircleXIcon />
            <AlertTitle>No se pudo sincronizar</AlertTitle>
            <AlertDescription>
              {s.error} La información guardada en appsupli no se tocó.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {cifras.map((c) => (
              <div key={c.clave} className="rounded-md border p-3">
                <div className="text-2xl font-semibold tabular-nums">{s.resumen[c.clave]}</div>
                <div className="text-xs text-muted-foreground">{c.titulo}</div>
              </div>
            ))}
          </div>
        )}

        {Object.keys(grupos).length > 0 && (
          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-medium">Para revisar en Odoo</h4>
            {Object.entries(grupos).map(([tipo, lista]) => (
              <Collapsible key={tipo} className="rounded-md border">
                <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 p-3 text-left text-sm">
                  <span>{TIPOS_EXCEPCION[tipo] ?? tipo}</span>
                  <span className="flex items-center gap-2">
                    <Badge variant="warning">{lista.length}</Badge>
                    <ChevronDownIcon className="size-4 text-muted-foreground" />
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ul className="flex flex-col divide-y border-t text-sm">
                    {lista.map((e, i) => (
                      <li key={`${e.odooId}-${i}`} className="flex flex-col gap-0.5 px-3 py-2">
                        <span className="font-medium">{e.nombre}</span>
                        <span className="text-xs text-muted-foreground">{e.detalle}</span>
                      </li>
                    ))}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DialogoSincronizar({
  abierto,
  onOpenChange,
  onResultado,
}: {
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
  onResultado: (s: SincronizacionOdoo) => void;
}) {
  const queryClient = useQueryClient();
  const [opciones, setOpciones] = useState({
    crear: true,
    actualizar: true,
    desactivar: false,
    eliminar: false,
  });
  const ninguna = !Object.values(opciones).some(Boolean);
  // Borrar no se deshace: sin vista previa de estas mismas opciones, no se habilita.
  const [previaHecha, setPreviaHecha] = useState(false);
  const alternarOpcion = (clave: keyof typeof opciones, valor: boolean) => {
    setOpciones({ ...opciones, [clave]: valor });
    setPreviaHecha(false);
  };

  const correr = useMutation({
    mutationFn: (simular: boolean) => adminApi.odoo.sincronizar({ ...opciones, simular }),
    onSuccess: (s) => {
      // Usuarios, áreas y el historial pueden haber cambiado.
      void queryClient.invalidateQueries({ queryKey: adminKeys.todo });
      onResultado(s);
      onOpenChange(false);
      if (s.simulacion && s.estado === 'ok') setPreviaHecha(true);
      if (s.estado === 'error') toast.error(s.error);
      else
        toast.success(
          s.simulacion ? 'Vista previa lista: no se guardó nada' : 'Sincronización completa',
        );
    },
    onError: (error) => toast.error(mensajeDeError(error)),
  });

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Sincronizar con Odoo</DialogTitle>
          <DialogDescription>
            Solo se lee de Odoo. Haz la vista previa para ver qué cambiaría antes de guardar.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 sm:grid-cols-2">
          {OPCIONES.map((o) => (
            <label
              key={o.clave}
              className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${
                o.clave === 'eliminar' && opciones.eliminar ? 'border-destructive' : ''
              }`}
            >
              <Checkbox
                checked={opciones[o.clave]}
                onCheckedChange={(v) => alternarOpcion(o.clave, !!v)}
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{o.titulo}</span>
                <span className="text-xs text-muted-foreground">{o.ayuda}</span>
              </span>
            </label>
          ))}
        </div>

        {opciones.eliminar && !previaHecha && (
          <p className="text-sm text-destructive">
            Para eliminar, haz primero la vista previa con estas opciones y revisa a quién borraría.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="secondary"
            disabled={ninguna || correr.isPending}
            onClick={() => correr.mutate(true)}
          >
            {correr.isPending && correr.variables ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <EyeIcon data-icon="inline-start" />
            )}
            Vista previa
          </Button>
          <Button
            variant={opciones.eliminar ? 'destructive' : 'default'}
            disabled={ninguna || correr.isPending || (opciones.eliminar && !previaHecha)}
            onClick={() => correr.mutate(false)}
          >
            {correr.isPending && !correr.variables ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RefreshCwIcon data-icon="inline-start" />
            )}
            {opciones.eliminar ? 'Sincronizar y eliminar' : 'Sincronizar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
