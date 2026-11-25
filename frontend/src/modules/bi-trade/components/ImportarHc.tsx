import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileUpIcon, UploadIcon } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Checkbox,
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
  LecturaReporteHc,
  OpcionesReporte,
  PreguntaProductos,
  RespuestaReporte,
  ResultadoReporteInventarioHc,
  ResultadoReporteVentasHc,
} from '../api';
import type { ImportadorHc } from '../fuente';
import { biTradeKeys, mensajeDeError } from '../hooks';
import { Bloque, Renglon } from './ImportarInforme';
import { Faltantes, fechaCorta } from './ImportarQuery';
import { BotonPlantillaSinPrecio } from './PlantillaSinPrecio';
import { PreguntaDias, VistaPreviaCatalogo } from './PreguntasImportacion';

type Reporte = 'ventas' | 'inventario';

type Resultado =
  | { reporte: 'ventas'; datos: ResultadoReporteVentasHc }
  | { reporte: 'inventario'; datos: ResultadoReporteInventarioHc };

/** Los códigos que no cruzaron, cuando el backend rechaza el archivo por eso. */
interface FaltantesDelError {
  productosFaltantes?: string[];
  puntosFaltantes?: string[];
}

const DESCRIPCION: Record<Reporte, string> = {
  ventas:
    'El reporte de ventas del portal de Homecenter (.xlsx). Se usan «Fecha», «Código SKU», «EAN Tienda», «Unidades Vendidas» y «Canal».',
  inventario:
    'El reporte de inventario del portal de Homecenter (.xlsx). Se usan «Fecha», «Código SKU», «EAN Ubicación» e «Inventario Unidades Tienda»; para crear productos, «EAN 13 Calculado», «Referencia Proveedor», «Descripción SKU» y «Marca».',
};

/**
 * El botón «Importar» del tablero HC: los reportes del portal de Homecenter,
 * ventas e inventario, desde un mismo diálogo.
 *
 * En ventas, al elegir el archivo se lee sin cargar nada para mostrar sus
 * canales (Tienda, Web, App…) con cuántas ventas trae cada uno; se cargan solo
 * los que queden marcados. Luego, antes de guardar, el backend pregunta:
 *
 * 1. Si faltan productos o puntos de venta: la vista previa de cómo quedarían,
 *    y crearlos, importar sin ellos o cancelar.
 * 2. Solo ventas: si algún día ya tiene ventas, sobrescribirlo o cancelar.
 */
export function ImportarHc({ importar }: { importar: ImportadorHc }) {
  const queryClient = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [reporte, setReporte] = useState<Reporte>('ventas');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [lectura, setLectura] = useState<LecturaReporteHc | null>(null);
  const [canales, setCanales] = useState<string[]>([]);
  const [pregunta, setPregunta] = useState<PreguntaProductos | null>(null);
  const [decision, setDecision] = useState<DecisionProductos | undefined>(undefined);
  const [ocupados, setOcupados] = useState<DiaConVentas[] | null>(null);
  const [faltantes, setFaltantes] = useState<FaltantesDelError | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const reiniciar = () => {
    setArchivo(null);
    setLectura(null);
    setCanales([]);
    setPregunta(null);
    setDecision(undefined);
    setOcupados(null);
    setFaltantes(null);
  };

  const cerrar = () => {
    setAbierto(false);
    reiniciar();
  };

  // Ventas: leer el archivo sin cargar, para elegir canales. Todos marcados al empezar.
  const leer = useMutation({
    mutationFn: (elegido: File) => importar.leerVentas(elegido),
    onSuccess: (datos) => {
      setLectura(datos);
      setCanales(datos.canales.filter((c) => c.ventas > 0).map((c) => c.canal));
    },
    onError: (error) => toast.error(mensajeDeError(error)),
  });

  const cargar = useMutation({
    mutationFn: async (opciones: OpcionesReporte): Promise<RespuestaReporte<Resultado['datos']>> =>
      reporte === 'ventas'
        ? importar.ventas(archivo!, { ...opciones, canales })
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
          ? { reporte, datos: respuesta.resultado as ResultadoReporteVentasHc }
          : { reporte, datos: respuesta.resultado as ResultadoReporteInventarioHc },
      );
      cerrar();
    },
    onError: (error) => {
      toast.error(mensajeDeError(error));
      if (error instanceof ApiError && error.body && typeof error.body === 'object') {
        const { productosFaltantes = [], puntosFaltantes = [] } = error.body as FaltantesDelError;
        if (productosFaltantes.length || puntosFaltantes.length) {
          setPregunta(null);
          setFaltantes({ productosFaltantes, puntosFaltantes });
        }
      }
    },
  });

  const elegirReporte = (nuevo: Reporte) => {
    setReporte(nuevo);
    reiniciar();
  };

  const elegirArchivo = (elegido: File | null) => {
    setArchivo(elegido);
    setLectura(null);
    setCanales([]);
    setFaltantes(null);
    if (elegido && reporte === 'ventas') leer.mutate(elegido);
  };

  const alternar = (canal: string, marcado: boolean) =>
    setCanales((actuales) =>
      marcado ? [...actuales, canal] : actuales.filter((c) => c !== canal),
    );

  const listo =
    !!archivo && (reporte === 'inventario' || (!!lectura && canales.length > 0)) && !leer.isPending;
  const avisoDias = [
    'La venta no guarda su canal: se reemplazan las de todos los canales en esos días.',
    decision === 'crear' ? 'Los productos y puntos de venta nuevos se crean al sobrescribir.' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <Button variant="outline" onClick={() => setAbierto(true)}>
        <FileUpIcon data-icon="inline-start" />
        Importar
      </Button>

      <Dialog open={abierto} onOpenChange={(v) => (v ? setAbierto(true) : cerrar())}>
        <DialogContent
          className={`max-h-[85dvh] overflow-y-auto ${pregunta ? 'sm:max-w-4xl' : 'sm:max-w-lg'}`}
        >
          {pregunta ? (
            <VistaPreviaCatalogo
              pregunta={pregunta}
              cargando={cargar.isPending}
              decisionEnCurso={cargar.isPending ? cargar.variables?.productos : undefined}
              aviso={
                pregunta.productos.some((p) => !p.precio)
                  ? {
                      titulo: 'Los productos nuevos quedan con precio 0',
                      texto:
                        'El reporte no trae su valor. Después de importar podrás descargar la plantilla de productos sin precio, ponerles el precio y subirla en Productos con «Importar Excel».',
                    }
                  : undefined
              }
              onCancelar={cerrar}
              onDecidir={(productos) => cargar.mutate({ productos })}
            />
          ) : ocupados ? (
            <PreguntaDias
              dias={ocupados}
              aviso={avisoDias}
              cargando={cargar.isPending}
              onCancelar={cerrar}
              onSobrescribir={() => cargar.mutate({ sobrescribir: true, productos: decision })}
            />
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Importar de Homecenter</DialogTitle>
                <DialogDescription>
                  Los reportes del portal de Homecenter, tal como se descargan.
                </DialogDescription>
              </DialogHeader>

              <FieldGroup>
                <Field>
                  <FieldLabel>Qué vas a importar</FieldLabel>
                  <ToggleGroup
                    value={[reporte]}
                    onValueChange={(v) => v[0] && elegirReporte(v[0] as Reporte)}
                    variant="outline"
                  >
                    <ToggleGroupItem value="ventas">Ventas</ToggleGroupItem>
                    <ToggleGroupItem value="inventario">Inventario</ToggleGroupItem>
                  </ToggleGroup>
                </Field>

                <Field>
                  <FieldLabel htmlFor="hc-archivo">Archivo</FieldLabel>
                  <Input
                    // Otra clave al cambiar de reporte: el campo se vacía.
                    key={reporte}
                    id="hc-archivo"
                    type="file"
                    accept=".xlsx"
                    onChange={(e) => elegirArchivo(e.target.files?.[0] ?? null)}
                  />
                  <FieldDescription>
                    {archivo
                      ? `${archivo.name} · ${formatoNumero(Math.round(archivo.size / 1024))} KB`
                      : DESCRIPCION[reporte]}
                  </FieldDescription>
                </Field>

                {reporte === 'ventas' && leer.isPending && (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Spinner /> Leyendo los canales del archivo…
                  </p>
                )}

                {reporte === 'ventas' && lectura && (
                  <Field>
                    <div className="flex items-center justify-between gap-2">
                      <FieldLabel>Canales que se cargan</FieldLabel>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setCanales(
                              lectura.canales.filter((c) => c.ventas > 0).map((c) => c.canal),
                            )
                          }
                        >
                          Todos
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setCanales([])}>
                          Ninguno
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-col divide-y rounded-md border">
                      {lectura.canales.map((c) => {
                        const id = `hc-canal-${c.canal}`;
                        return (
                          <label
                            key={c.canal}
                            htmlFor={id}
                            className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm"
                          >
                            <Checkbox
                              id={id}
                              checked={canales.includes(c.canal)}
                              disabled={c.ventas === 0}
                              onCheckedChange={(marcado) => alternar(c.canal, !!marcado)}
                            />
                            <span className="flex-1 font-medium">{c.canal}</span>
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {formatoNumero(c.ventas)} venta{c.ventas === 1 ? '' : 's'} ·{' '}
                              {formatoNumero(c.unidades)} u
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    <FieldDescription>
                      {lectura.dias.length > 0
                        ? `Ventas del ${fechaCorta(lectura.dias[0])} al ${fechaCorta(lectura.dias[lectura.dias.length - 1])}. `
                        : ''}
                      Solo entran las de 1 unidad o más.
                    </FieldDescription>
                  </Field>
                )}

                {reporte === 'inventario' && (
                  <Alert variant="destructive">
                    <AlertTitle>Se reemplaza todo el inventario</AlertTitle>
                    <AlertDescription>
                      Quedan los del día más reciente del archivo, con 1 unidad o más en tienda
                      (Inventario Unidades Tienda). Las filas sin EAN Ubicación van a la tienda
                      7703670900993.
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
                        titulo="EAN por crear en Puntos de venta"
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
                <Button disabled={!listo || cargar.isPending} onClick={() => cargar.mutate({})}>
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

      <ResumenHc
        resultado={resultado}
        plantillaSinPrecio={importar.plantillaSinPrecio}
        onCerrar={() => setResultado(null)}
      />
    </>
  );
}

/** Qué entró y qué no, de las ventas o del inventario. */
function ResumenHc({
  resultado,
  plantillaSinPrecio,
  onCerrar,
}: {
  resultado: Resultado | null;
  plantillaSinPrecio: () => Promise<unknown>;
  onCerrar: () => void;
}) {
  if (!resultado) return null;
  const { datos } = resultado;
  const creoAlgo = datos.productosCreados > 0 || datos.puntosCreados > 0;

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
          {creoAlgo && (
            <>
              <Bloque titulo="Catálogo">
                <Renglon etiqueta="Productos creados" valor={datos.productosCreados} destacado />
                <Renglon etiqueta="Puntos de venta creados" valor={datos.puntosCreados} />
                {datos.marcasCreadas.length > 0 && (
                  <Renglon etiqueta="Marcas creadas" valor={datos.marcasCreadas.length} />
                )}
              </Bloque>
              {datos.productosSinPrecio > 0 && (
                <Alert>
                  <AlertTitle>
                    {formatoNumero(datos.productosSinPrecio)} producto
                    {datos.productosSinPrecio === 1 ? ' quedó' : 's quedaron'} con precio 0
                  </AlertTitle>
                  <AlertDescription className="flex flex-col gap-3">
                    Confirma su valor: descarga la plantilla, pon el precio Coltrade y el precio
                    Homecenter de cada uno y súbela en Productos con «Importar Excel». También la
                    encuentras en Productos, con el botón «Productos sin precio».
                    <span>
                      <BotonPlantillaSinPrecio descargar={plantillaSinPrecio} variant="default" />
                    </span>
                  </AlertDescription>
                </Alert>
              )}
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
              {resultado.datos.canales.length > 0 && (
                <p className="pt-1 text-xs text-muted-foreground">
                  Canales: {resultado.datos.canales.join(', ')}
                </p>
              )}
            </Bloque>
          ) : (
            <Bloque titulo={`Inventario del ${fechaCorta(resultado.datos.fecha)}`}>
              <Renglon etiqueta="Registros creados" valor={resultado.datos.creados} destacado />
              <Renglon etiqueta="Unidades en stock" valor={resultado.datos.unidades} />
              <Renglon etiqueta="Registros reemplazados" valor={resultado.datos.eliminados} />
            </Bloque>
          )}

          <Separator />

          <Bloque titulo="Lo que no entró">
            {resultado.reporte === 'ventas' && resultado.datos.fueraDeCanal > 0 && (
              <Renglon etiqueta="De otros canales" valor={resultado.datos.fueraDeCanal} />
            )}
            {resultado.reporte === 'inventario' && resultado.datos.deOtrosDias > 0 && (
              <Renglon etiqueta="De días anteriores" valor={resultado.datos.deOtrosDias} />
            )}
            <Renglon
              etiqueta={
                resultado.reporte === 'ventas'
                  ? 'Devoluciones y ajustes (0 o negativas)'
                  : 'Con 0 unidades o negativas'
              }
              valor={datos.sinUnidades}
            />
            <Renglon etiqueta="SKU que no existe en HC" valor={datos.sinProducto} />
            <Renglon etiqueta="Tienda que no existe en HC" valor={datos.sinPuntoVenta} />
          </Bloque>

          <Faltantes titulo="SKU por crear en Productos" codigos={datos.productosFaltantes} />
          <Faltantes titulo="EAN por crear en Puntos de venta" codigos={datos.puntosFaltantes} />
        </div>

        <DialogFooter>
          <Button onClick={onCerrar}>Entendido</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** `del 01/11/2026 al 23/11/2026`, o `del 23/11/2026` si es un solo día. */
function periodo(dias: string[]) {
  if (dias.length === 0) return '';
  const desde = fechaCorta(dias[0]);
  return dias.length === 1
    ? `del ${desde}`
    : `del ${desde} al ${fechaCorta(dias[dias.length - 1])}`;
}
