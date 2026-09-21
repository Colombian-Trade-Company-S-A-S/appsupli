import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DatabaseIcon, UploadIcon } from 'lucide-react';
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
} from '@/shared/components/ui';
import { formatoNumero } from '@/shared/lib/formato';
import type { DiaConVentas, RespuestaQueryVentas, ResultadoQueryVentas } from '../api';
import { biTradeKeys, mensajeDeError } from '../hooks';
import { Bloque, Renglon } from './ImportarInforme';
import { Faltantes, fechaCorta } from './ImportarQuery';

/**
 * Carga las ventas del querie del portal de Homecenter.
 *
 * Nunca guarda dos veces el mismo día: si alguno de los días del archivo ya
 * tiene ventas, el backend no guarda nada y devuelve esos días. Aquí se
 * muestran y se pregunta: cancelar, o sobrescribir (borrar las ventas de esos
 * días y cargar las del archivo).
 */
export function ImportarQueryVentas({
  importar: importarArchivo,
}: {
  importar: (archivo: File, sobrescribir: boolean) => Promise<RespuestaQueryVentas>;
}) {
  const queryClient = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [ocupados, setOcupados] = useState<DiaConVentas[] | null>(null);
  const [resultado, setResultado] = useState<ResultadoQueryVentas | null>(null);

  const cerrar = () => {
    setAbierto(false);
    setArchivo(null);
    setOcupados(null);
  };

  const importar = useMutation({
    mutationFn: (sobrescribir: boolean) => importarArchivo(archivo!, sobrescribir),
    onSuccess: (respuesta) => {
      if (respuesta.conflicto) {
        setOcupados(respuesta.diasConVentas);
        return;
      }
      void queryClient.invalidateQueries({ queryKey: biTradeKeys.todo });
      toast.success(respuesta.resultado.message);
      setResultado(respuesta.resultado);
      cerrar();
    },
    onError: (error) => toast.error(mensajeDeError(error)),
  });

  const registrosOcupados = (ocupados ?? []).reduce((total, dia) => total + dia.registros, 0);

  return (
    <>
      <Button variant="outline" onClick={() => setAbierto(true)}>
        <DatabaseIcon data-icon="inline-start" />
        Querie
      </Button>

      <Dialog open={abierto} onOpenChange={(v) => (v ? setAbierto(true) : cerrar())}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
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
                <Button variant="outline" onClick={cerrar} disabled={importar.isPending}>
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  disabled={importar.isPending}
                  onClick={() => importar.mutate(true)}
                >
                  {importar.isPending && <Spinner data-icon="inline-start" />}
                  Sobrescribir
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Cargar querie de ventas</DialogTitle>
                <DialogDescription>
                  El archivo de ventas del portal de Homecenter, tal como se descarga.
                </DialogDescription>
              </DialogHeader>

              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="query-ventas-archivo">Archivo</FieldLabel>
                  <Input
                    id="query-ventas-archivo"
                    type="file"
                    accept=".xlsx"
                    onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
                  />
                  <FieldDescription>
                    {archivo
                      ? `${archivo.name} · ${formatoNumero(Math.round(archivo.size / 1024))} KB`
                      : 'Se usan «Fecha», «Código SKU», «EAN Tienda» y «Unidades Vendidas».'}
                  </FieldDescription>
                </Field>

                <Alert>
                  <AlertTitle>Se cargan todos los días del archivo</AlertTitle>
                  <AlertDescription>
                    Solo las filas con 1 unidad o más: devoluciones y ajustes no entran. Las filas
                    sin EAN Tienda van a la tienda 7703670900993. Si algún día ya tiene ventas, se
                    te pregunta antes de tocarlo.
                  </AlertDescription>
                </Alert>
              </FieldGroup>

              <DialogFooter>
                <Button variant="outline" onClick={cerrar}>
                  Cancelar
                </Button>
                <Button
                  disabled={!archivo || importar.isPending}
                  onClick={() => importar.mutate(false)}
                >
                  {importar.isPending ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <UploadIcon data-icon="inline-start" />
                  )}
                  {importar.isPending ? 'Leyendo el archivo…' : 'Cargar'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ResumenQueryVentas resultado={resultado} onCerrar={() => setResultado(null)} />
    </>
  );
}

function ResumenQueryVentas({
  resultado,
  onCerrar,
}: {
  resultado: ResultadoQueryVentas | null;
  onCerrar: () => void;
}) {
  if (!resultado) return null;
  const { dias } = resultado;
  const periodo =
    dias.length === 1
      ? `del ${fechaCorta(dias[0])}`
      : `del ${fechaCorta(dias[0])} al ${fechaCorta(dias[dias.length - 1])}`;

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ventas cargadas</DialogTitle>
          <DialogDescription>{resultado.message}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Bloque titulo={`Ventas ${periodo}`}>
            <Renglon etiqueta="Registros creados" valor={resultado.creadas} destacado />
            <Renglon etiqueta="Unidades" valor={resultado.unidades} />
            <Renglon etiqueta="Días cargados" valor={dias.length} />
            {resultado.eliminadas > 0 && (
              <Renglon etiqueta="Ventas reemplazadas" valor={resultado.eliminadas} />
            )}
            {resultado.sinTienda > 0 && (
              <Renglon etiqueta="Sin EAN Tienda (a la 7703670900993)" valor={resultado.sinTienda} />
            )}
          </Bloque>

          <Separator />

          <Bloque titulo="Lo que no entró">
            <Renglon
              etiqueta="Devoluciones y ajustes (0 o negativas)"
              valor={resultado.sinUnidades}
            />
            <Renglon etiqueta="SKU que no existe en HC" valor={resultado.sinProducto} />
            <Renglon etiqueta="Tienda que no existe en HC" valor={resultado.sinPuntoVenta} />
          </Bloque>

          <Faltantes titulo="SKU por crear en Productos" codigos={resultado.productosFaltantes} />
          <Faltantes
            titulo="EAN de tienda por crear en Puntos de venta"
            codigos={resultado.puntosFaltantes}
          />
        </div>

        <DialogFooter>
          <Button onClick={onCerrar}>Entendido</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
