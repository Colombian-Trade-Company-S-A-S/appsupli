import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileUpIcon, UploadIcon } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Input,
  Separator,
  Spinner,
  ToggleGroup,
  ToggleGroupItem,
} from '@/shared/components/ui';
import { ApiError } from '@/shared/api/http-client';
import { formatoNumero } from '@/shared/lib/formato';
import type {
  DecisionProductos,
  DiaConVentas,
  OpcionesReporte,
  PreguntaProductos,
  RespuestaReporte,
  ResultadoReporteInventario,
  ResultadoReporteVentas,
} from '../api';
import type { ImportadorFalabella } from '../fuente';
import { biTradeKeys, mensajeDeError } from '../hooks';
import { Bloque, Renglon } from './ImportarInforme';
import { Faltantes, fechaCorta } from './ImportarQuery';
import { PreguntaDias, VistaPreviaCatalogo } from './PreguntasImportacion';

type Reporte = 'ventas' | 'inventario';

type Resultado =
  | { reporte: 'ventas'; datos: ResultadoReporteVentas }
  | { reporte: 'inventario'; datos: ResultadoReporteInventario };

/** Los códigos que no cruzaron, cuando el backend rechaza el archivo por eso. */
interface FaltantesDelError {
  productosFaltantes?: string[];
  puntosFaltantes?: string[];
}

const DESCRIPCION: Record<Reporte, string> = {
  ventas:
    'El reporte «Ventas diarias» del portal de Falabella. Se usan «SKU», «ID Local», «Fecha» y «Unidades»; para crear productos, «Producto», «Marca» y «Venta neta»; para crear puntos de venta, «Local».',
  inventario:
    'El reporte «Análisis semanal» del portal de Falabella. Se usan «ID Producto», «ID Local» y «Stock Disponible»; para crear productos, «Producto», «Marca» y «Stock a costo Disponible»; para crear puntos de venta, «Local».',
};

/**
 * Importa los reportes .csv del portal de Falabella: las ventas diarias y el
 * inventario, desde un mismo botón. Entra todo, tenga meta o no, menos
 * Falabella.com.
 *
 * Antes de guardar, el backend se detiene a preguntar, y aquí se muestra cada
 * pregunta en su propia pantalla:
 *
 * 1. Si el archivo trae productos o puntos de venta que no existen: la vista
 *    previa de cómo quedarían (el precio, la venta neta de una unidad) y
 *    crearlos, importar sin ellos o cancelar.
 * 2. Solo ventas: si algún día ya tiene ventas, sobrescribirlo o cancelar.
 *
 * La respuesta a la primera se recuerda para la segunda: si se crean los
 * productos y luego hay días ocupados, al sobrescribir también se crean.
 */
export function ImportarFalabella({ importar }: { importar: ImportadorFalabella }) {
  const queryClient = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [reporte, setReporte] = useState<Reporte>('ventas');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [pregunta, setPregunta] = useState<PreguntaProductos | null>(null);
  const [decision, setDecision] = useState<DecisionProductos | undefined>(undefined);
  const [ocupados, setOcupados] = useState<DiaConVentas[] | null>(null);
  const [faltantes, setFaltantes] = useState<FaltantesDelError | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const cerrar = () => {
    setAbierto(false);
    setArchivo(null);
    setPregunta(null);
    setDecision(undefined);
    setOcupados(null);
    setFaltantes(null);
  };

  const cargar = useMutation({
    mutationFn: async (opciones: OpcionesReporte): Promise<RespuestaReporte<Resultado['datos']>> =>
      reporte === 'ventas'
        ? importar.ventas(archivo!, opciones)
        : importar.inventario(archivo!, opciones),
    onMutate: (opciones) => {
      setFaltantes(null);
      setDecision(opciones.productos);
    },
    onSuccess: (respuesta) => {
      if (respuesta.tipo === 'productos') {
        setPregunta(respuesta.pregunta);
        return;
      }
      if (respuesta.tipo === 'dias') {
        setPregunta(null);
        setOcupados(respuesta.diasConVentas);
        return;
      }
      void queryClient.invalidateQueries({ queryKey: biTradeKeys.todo });
      toast.success(respuesta.resultado.message);
      setResultado(
        reporte === 'ventas'
          ? { reporte, datos: respuesta.resultado as ResultadoReporteVentas }
          : { reporte, datos: respuesta.resultado as ResultadoReporteInventario },
      );
      cerrar();
    },
    onError: (error) => {
      toast.error(mensajeDeError(error));
      // Si nada cruzó, el backend dice qué códigos faltan: se muestran aquí.
      if (error instanceof ApiError && error.body && typeof error.body === 'object') {
        const { productosFaltantes = [], puntosFaltantes = [] } = error.body as FaltantesDelError;
        if (productosFaltantes.length || puntosFaltantes.length) {
          setPregunta(null);
          setFaltantes({ productosFaltantes, puntosFaltantes });
        }
      }
    },
  });

  const elegir = (nuevo: Reporte) => {
    setReporte(nuevo);
    setArchivo(null);
    setFaltantes(null);
  };

  return (
    <>
      <Button variant="outline" onClick={() => setAbierto(true)}>
        <FileUpIcon data-icon="inline-start" />
        Importar
      </Button>

      <Dialog open={abierto} onOpenChange={(v) => (v ? setAbierto(true) : cerrar())}>
        <DialogContent
          className={`max-h-[85dvh] overflow-y-auto ${pregunta ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}
        >
          {pregunta ? (
            <VistaPreviaCatalogo
              pregunta={pregunta}
              cargando={cargar.isPending}
              decisionEnCurso={cargar.isPending ? cargar.variables?.productos : undefined}
              onCancelar={cerrar}
              onDecidir={(productos) => cargar.mutate({ productos })}
            />
          ) : ocupados ? (
            <PreguntaDias
              dias={ocupados}
              aviso={decision === 'crear' ? 'Los productos nuevos se crean al sobrescribir.' : ''}
              cargando={cargar.isPending}
              onCancelar={cerrar}
              onSobrescribir={() => cargar.mutate({ sobrescribir: true, productos: decision })}
            />
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Importar de Falabella</DialogTitle>
                <DialogDescription>
                  Los reportes .csv del portal de Falabella, tal como se descargan.
                </DialogDescription>
              </DialogHeader>

              <FieldGroup>
                <Field>
                  <FieldLabel>Qué vas a importar</FieldLabel>
                  <ToggleGroup
                    value={[reporte]}
                    onValueChange={(v) => v[0] && elegir(v[0] as Reporte)}
                    variant="outline"
                  >
                    <ToggleGroupItem value="ventas">Ventas</ToggleGroupItem>
                    <ToggleGroupItem value="inventario">Inventario</ToggleGroupItem>
                  </ToggleGroup>
                </Field>

                <Field>
                  <FieldLabel htmlFor="falabella-archivo">Archivo</FieldLabel>
                  <Input
                    // Otra clave al cambiar de reporte: el campo se vacía.
                    key={reporte}
                    id="falabella-archivo"
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => {
                      setArchivo(e.target.files?.[0] ?? null);
                      setFaltantes(null);
                    }}
                  />
                  <FieldDescription>
                    {archivo
                      ? `${archivo.name} · ${formatoNumero(Math.round(archivo.size / 1024))} KB`
                      : DESCRIPCION[reporte]}
                  </FieldDescription>
                </Field>

                {reporte === 'ventas' ? (
                  <Alert>
                    <AlertTitle>Se cargan todos los días del archivo</AlertTitle>
                    <AlertDescription>
                      Solo las filas con 1 unidad o más, tengan meta o no, y sin las de
                      Falabella.com. Si algún día ya tiene ventas, se te pregunta antes de tocarlo.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert variant="destructive">
                    <AlertTitle>Se reemplaza todo el inventario</AlertTitle>
                    <AlertDescription>
                      Se borran los registros actuales y quedan los del archivo, solo con 1 unidad o
                      más de stock disponible y sin Falabella.com.
                    </AlertDescription>
                  </Alert>
                )}

                {faltantes ? (
                  <Alert variant="destructive">
                    <AlertTitle>No se cargó nada: faltan en la app</AlertTitle>
                    <AlertDescription className="flex flex-col gap-3">
                      Crea estos códigos y vuelve a subir el archivo.
                      <Faltantes
                        titulo="SKU por crear en Productos"
                        codigos={faltantes.productosFaltantes ?? []}
                      />
                      <Faltantes
                        titulo="ID Local por crear en Puntos de venta"
                        codigos={faltantes.puntosFaltantes ?? []}
                      />
                    </AlertDescription>
                  </Alert>
                ) : (
                  <FieldDescription>
                    Si el archivo trae productos o puntos de venta que no existen, te mostramos cómo
                    quedarían y te preguntamos si crearlos.
                  </FieldDescription>
                )}
              </FieldGroup>

              <DialogFooter>
                <Button variant="outline" onClick={cerrar}>
                  Cancelar
                </Button>
                <Button disabled={!archivo || cargar.isPending} onClick={() => cargar.mutate({})}>
                  {cargar.isPending ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <UploadIcon data-icon="inline-start" />
                  )}
                  {cargar.isPending ? 'Leyendo el archivo…' : 'Importar'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ResumenFalabella resultado={resultado} onCerrar={() => setResultado(null)} />
    </>
  );
}

/** Qué entró y qué no, de las ventas o del inventario. */
function ResumenFalabella({
  resultado,
  onCerrar,
}: {
  resultado: Resultado | null;
  onCerrar: () => void;
}) {
  if (!resultado) return null;
  const { datos } = resultado;

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {resultado.reporte === 'ventas' ? 'Ventas cargadas' : 'Inventario cargado'}
          </DialogTitle>
          <DialogDescription>{datos.message}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {(datos.productosCreados > 0 || datos.puntosCreados > 0) && (
            <>
              <Bloque titulo="Catálogo">
                <Renglon etiqueta="Productos creados" valor={datos.productosCreados} destacado />
                <Renglon etiqueta="Puntos de venta creados" valor={datos.puntosCreados} />
                {datos.marcasCreadas.length > 0 && (
                  <Renglon etiqueta="Marcas creadas" valor={datos.marcasCreadas.length} />
                )}
              </Bloque>
              <Separator />
            </>
          )}

          {resultado.reporte === 'ventas' ? (
            <Bloque titulo={`Ventas ${periodo(resultado.datos.dias)}`}>
              <Renglon etiqueta="Registros creados" valor={resultado.datos.creadas} destacado />
              <Renglon etiqueta="Unidades" valor={resultado.datos.unidades} />
              <Renglon etiqueta="Días cargados" valor={resultado.datos.dias.length} />
              {resultado.datos.eliminadas > 0 && (
                <Renglon etiqueta="Ventas reemplazadas" valor={resultado.datos.eliminadas} />
              )}
            </Bloque>
          ) : (
            <Bloque titulo="Inventario">
              <Renglon etiqueta="Registros creados" valor={resultado.datos.creados} destacado />
              <Renglon etiqueta="Unidades en stock" valor={resultado.datos.unidades} />
              <Renglon etiqueta="Registros reemplazados" valor={resultado.datos.eliminados} />
            </Bloque>
          )}

          <Separator />

          <Bloque titulo="Lo que no entró">
            {datos.deFalabellaCom > 0 && (
              <Renglon etiqueta="De Falabella.com" valor={datos.deFalabellaCom} />
            )}
            <Renglon
              etiqueta={
                resultado.reporte === 'ventas'
                  ? 'Devoluciones y ajustes (0 o negativas)'
                  : 'Sin stock disponible (0 o negativo)'
              }
              valor={datos.sinUnidades}
            />
            <Renglon etiqueta="SKU que no existe en Falabella" valor={datos.sinProducto} />
            <Renglon etiqueta="ID Local que no existe en Falabella" valor={datos.sinPuntoVenta} />
          </Bloque>

          <Faltantes titulo="SKU por crear en Productos" codigos={datos.productosFaltantes} />
          <Faltantes
            titulo="ID Local por crear en Puntos de venta"
            codigos={datos.puntosFaltantes}
          />
        </div>

        <DialogFooter>
          <Button onClick={onCerrar}>Entendido</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** `del 09/11/2026 al 16/11/2026`, o `del 16/11/2026` si es un solo día. */
function periodo(dias: string[]) {
  if (dias.length === 0) return '';
  const desde = fechaCorta(dias[0]);
  return dias.length === 1
    ? `del ${desde}`
    : `del ${desde} al ${fechaCorta(dias[dias.length - 1])}`;
}
