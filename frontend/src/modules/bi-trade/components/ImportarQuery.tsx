import { useState } from 'react';
import { DatabaseIcon, UploadIcon } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
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
} from '@/shared/components/ui';
import { formatoNumero } from '@/shared/lib/formato';
import type { ResultadoQuery } from '../api';
import { useBiTradeMutation } from '../hooks';
import { Bloque, Renglon } from './ImportarInforme';

/** `2026-09-20` → `20/09/2026`. */
export const fechaCorta = (iso: string) => iso.split('-').reverse().join('/');

/**
 * Carga el querie de inventario del portal de Homecenter.
 *
 * Reemplaza el inventario completo con el día más reciente del archivo. Los
 * SKU y tiendas que no existen en HC no entran, y el resumen dice cuáles son
 * para poder crearlos y volver a subir.
 */
export function ImportarQuery({
  importar: importarArchivo,
}: {
  importar: (archivo: File) => Promise<ResultadoQuery>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [resultado, setResultado] = useState<ResultadoQuery | null>(null);

  const importar = useBiTradeMutation(
    () => importarArchivo(archivo!),
    (datos) => datos.message,
  );

  const cerrar = () => {
    setAbierto(false);
    setArchivo(null);
    importar.reset();
  };

  return (
    <>
      <Button variant="outline" onClick={() => setAbierto(true)}>
        <DatabaseIcon data-icon="inline-start" />
        Querie
      </Button>

      <Dialog open={abierto} onOpenChange={(v) => (v ? setAbierto(true) : cerrar())}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cargar querie de inventario</DialogTitle>
            <DialogDescription>
              El archivo de inventario del portal de Homecenter, tal como se descarga.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="query-archivo">Archivo</FieldLabel>
              <Input
                id="query-archivo"
                type="file"
                accept=".xlsx"
                onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              />
              <FieldDescription>
                {archivo
                  ? `${archivo.name} · ${formatoNumero(Math.round(archivo.size / 1024))} KB`
                  : 'Se usan «Código SKU», «EAN Tienda» y «Unidades».'}
              </FieldDescription>
            </Field>

            <Alert variant="destructive">
              <AlertTitle>Se reemplaza todo el inventario</AlertTitle>
              <AlertDescription>
                Se borran los registros actuales y quedan los del día más reciente del archivo, solo
                con 1 unidad o más. Las filas sin EAN Tienda van a la tienda 7703670900993.
              </AlertDescription>
            </Alert>
          </FieldGroup>

          <DialogFooter>
            <Button variant="outline" onClick={cerrar}>
              Cancelar
            </Button>
            <Button
              disabled={!archivo || importar.isPending}
              onClick={() =>
                importar.mutate(undefined, {
                  onSuccess: (datos) => {
                    setResultado(datos);
                    cerrar();
                  },
                })
              }
            >
              {importar.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <UploadIcon data-icon="inline-start" />
              )}
              {importar.isPending ? 'Leyendo el archivo…' : 'Cargar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ResumenQuery resultado={resultado} onCerrar={() => setResultado(null)} />
    </>
  );
}

function ResumenQuery({
  resultado,
  onCerrar,
}: {
  resultado: ResultadoQuery | null;
  onCerrar: () => void;
}) {
  if (!resultado) return null;
  const otrosDias = resultado.fechasEnArchivo.filter((f) => f !== resultado.fecha);

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Inventario cargado</DialogTitle>
          <DialogDescription>{resultado.message}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Bloque titulo={`Inventario del ${fechaCorta(resultado.fecha)}`}>
            <Renglon etiqueta="Registros creados" valor={resultado.creados} destacado />
            <Renglon etiqueta="Unidades en stock" valor={resultado.unidades} />
            <Renglon etiqueta="Registros reemplazados" valor={resultado.eliminados} />
            {resultado.sinTienda > 0 && (
              <Renglon etiqueta="Sin EAN Tienda (a la 7703670900993)" valor={resultado.sinTienda} />
            )}
          </Bloque>

          <Separator />

          <Bloque titulo="Lo que no entró">
            <Renglon etiqueta="Con 0 unidades o negativas" valor={resultado.sinUnidades} />
            {otrosDias.length > 0 && (
              <Renglon
                etiqueta={`De días anteriores (${otrosDias.map(fechaCorta).join(', ')})`}
                valor={resultado.deOtrosDias}
              />
            )}
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

export function Faltantes({ titulo, codigos }: { titulo: string; codigos: string[] }) {
  if (codigos.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">
        {titulo} ({formatoNumero(codigos.length)}):
      </span>
      <div className="flex flex-wrap gap-1.5">
        {codigos.map((codigo) => (
          <Badge key={codigo} variant="outline" className="font-mono">
            {codigo}
          </Badge>
        ))}
      </div>
    </div>
  );
}
