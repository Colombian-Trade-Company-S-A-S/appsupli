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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  ToggleGroup,
  ToggleGroupItem,
} from '@/shared/components/ui';
import { ApiError } from '@/shared/api/http-client';
import { formatoNumero } from '@/shared/lib/formato';
import type { DiaConVentas, ResultadoReporteInventario, ResultadoReporteVentas } from '../api';
import type { ImportadorFalabella } from '../fuente';
import { biTradeKeys, mensajeDeError } from '../hooks';
import { Bloque, Renglon } from './ImportarInforme';
import { Faltantes, fechaCorta } from './ImportarQuery';

type Reporte = 'ventas' | 'inventario';

type Resultado =
  | { reporte: 'ventas'; datos: ResultadoReporteVentas }
  | { reporte: 'inventario'; datos: ResultadoReporteInventario };

/** Lo que deja una carga: terminó, o se detuvo porque algún día ya tenía ventas. */
type Salida =
  { conflicto: true; dias: DiaConVentas[] } | { conflicto: false; resultado: Resultado };

/** Los códigos que no cruzaron, cuando el backend rechaza el archivo por eso. */
interface FaltantesDelError {
  productosFaltantes?: string[];
  puntosFaltantes?: string[];
}

const DESCRIPCION: Record<Reporte, string> = {
  ventas:
    'El reporte «Ventas diarias» del portal de Falabella. Se usan «SKU», «ID Local», «Fecha» y «Unidades».',
  inventario:
    'El reporte «Análisis semanal» del portal de Falabella. Se usan «ID Producto», «ID Local» y «Stock Disponible».',
};

/**
 * Importa los reportes .csv del portal de Falabella: las ventas diarias y el
 * inventario, desde un mismo botón.
 *
 * Las ventas nunca pisan un día sin preguntar: si alguno de los días del
 * archivo ya tiene ventas, el backend no guarda nada y devuelve esos días, y
 * aquí se pregunta si sobrescribirlos. El inventario es la foto del stock: se
 * reemplaza completo.
 *
 * En los dos solo entra lo que tenga 1 unidad o más, y lo que no existe en la
 * app (un SKU o un ID Local sin crear) se omite y se lista para crearlo.
 */
export function ImportarFalabella({ importar }: { importar: ImportadorFalabella }) {
  const queryClient = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [reporte, setReporte] = useState<Reporte>('ventas');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [ocupados, setOcupados] = useState<DiaConVentas[] | null>(null);
  const [faltantes, setFaltantes] = useState<FaltantesDelError | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const cerrar = () => {
    setAbierto(false);
    setArchivo(null);
    setOcupados(null);
    setFaltantes(null);
  };

  const cargar = useMutation({
    mutationFn: async (sobrescribir: boolean): Promise<Salida> => {
      if (reporte === 'inventario') {
        return {
          conflicto: false,
          resultado: { reporte, datos: await importar.inventario(archivo!) },
        };
      }
      const respuesta = await importar.ventas(archivo!, sobrescribir);
      return respuesta.conflicto
        ? { conflicto: true, dias: respuesta.diasConVentas }
        : { conflicto: false, resultado: { reporte, datos: respuesta.resultado } };
    },
    onMutate: () => setFaltantes(null),
    onSuccess: (salida) => {
      if (salida.conflicto) {
        setOcupados(salida.dias);
        return;
      }
      void queryClient.invalidateQueries({ queryKey: biTradeKeys.todo });
      toast.success(salida.resultado.datos.message);
      setResultado(salida.resultado);
      cerrar();
    },
    onError: (error) => {
      toast.error(mensajeDeError(error));
      // Si nada cruzó, el backend dice qué códigos faltan: se muestran aquí
      // para crearlos antes de volver a subir.
      if (error instanceof ApiError && error.body && typeof error.body === 'object') {
        const { productosFaltantes = [], puntosFaltantes = [] } = error.body as FaltantesDelError;
        if (productosFaltantes.length || puntosFaltantes.length) {
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

  const registrosOcupados = (ocupados ?? []).reduce((total, dia) => total + dia.registros, 0);

  return (
    <>
      <Button variant="outline" onClick={() => setAbierto(true)}>
        <FileUpIcon data-icon="inline-start" />
        Importar
      </Button>

      <Dialog open={abierto} onOpenChange={(v) => (v ? setAbierto(true) : cerrar())}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          {ocupados ? (
            <>
              <DialogHeader>
                <DialogTitle>Ya hay ventas de esos días</DialogTitle>
                <DialogDescription>
                  No se guardó nada. Si sobrescribes, se borran las{' '}
                  {formatoNumero(registrosOcupados)} ventas de estos días y quedan las del archivo.
                </DialogDescription>
              </DialogHeader>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Día</TableHead>
                    <TableHead className="text-right">Ventas cargadas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ocupados.map((dia) => (
                    <TableRow key={dia.fecha}>
                      <TableCell>{fechaCorta(dia.fecha)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatoNumero(dia.registros)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <DialogFooter>
                <Button variant="outline" onClick={cerrar} disabled={cargar.isPending}>
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  disabled={cargar.isPending}
                  onClick={() => cargar.mutate(true)}
                >
                  {cargar.isPending && <Spinner data-icon="inline-start" />}
                  Sobrescribir
                </Button>
              </DialogFooter>
            </>
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
                      Solo las filas con 1 unidad o más, y solo de productos con meta ese mes en ese
                      punto de venta: sube primero las metas del mes. Si algún día ya tiene ventas,
                      se te pregunta antes de tocarlo.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert variant="destructive">
                    <AlertTitle>Se reemplaza todo el inventario</AlertTitle>
                    <AlertDescription>
                      Se borran los registros actuales y quedan los del archivo, solo con 1 unidad o
                      más de stock disponible. En el tablero solo cuenta el stock de productos con
                      meta en su punto de venta.
                    </AlertDescription>
                  </Alert>
                )}

                {faltantes ? (
                  <Alert variant="destructive">
                    <AlertTitle>No se cargó nada: faltan en la app</AlertTitle>
                    <AlertDescription className="flex flex-col gap-3">
                      Crea estos códigos en Productos y en Puntos de venta, y vuelve a subir el
                      archivo.
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
                    Los SKU y los ID Local que no existan en la app se omiten: el reporte no crea
                    catálogo. Al terminar se dice cuáles quedaron fuera.
                  </FieldDescription>
                )}
              </FieldGroup>

              <DialogFooter>
                <Button variant="outline" onClick={cerrar}>
                  Cancelar
                </Button>
                <Button
                  disabled={!archivo || cargar.isPending}
                  onClick={() => cargar.mutate(false)}
                >
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
            <Renglon
              etiqueta={
                resultado.reporte === 'ventas'
                  ? 'Devoluciones y ajustes (0 o negativas)'
                  : 'Sin stock disponible (0 o negativo)'
              }
              valor={datos.sinUnidades}
            />
            {resultado.reporte === 'ventas' && (
              <Renglon
                etiqueta="Sin meta ese mes en ese punto de venta"
                valor={resultado.datos.sinMeta}
              />
            )}
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
