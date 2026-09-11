import { useRef, useState } from 'react';
import { DownloadIcon, FileSpreadsheetIcon, UploadIcon } from 'lucide-react';
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
  Spinner,
} from '@/shared/components/ui';
import { ApiError } from '@/shared/api/http-client';
import { biTradeApi } from '../api';
import { useFuente } from '../fuente';
import { useBiTradeMutation } from '../hooks';

/** Los recursos que tienen plantilla e importador. */
type Recurso = 'ventas' | 'productos' | 'puntosVenta' | 'inventario' | 'metas';

interface FilaConError {
  fila: number;
  errores: string[];
}

/**
 * Descargar plantilla e importar Excel.
 *
 * La importación es todo o nada: si alguna fila falla, el backend no guarda
 * ninguna y devuelve el detalle fila por fila, que es lo que se muestra en el
 * diálogo para poder corregir el archivo de una sola pasada.
 */
export function BotonesExcel({
  recurso,
  filtrosExport,
}: {
  recurso: Recurso;
  /**
   * Si viene, aparece «Exportar Excel» y se descarga con estos filtros.
   *
   * Son los mismos filtros de la tabla pero sin `page`: se exporta todo lo
   * filtrado, no la página que se está viendo.
   */
  filtrosExport?: Record<string, unknown>;
}) {
  // Los recursos del canal en el que se está: Claro o Homecenter.
  const recursos = useFuente().recursos ?? biTradeApi;
  const inputArchivo = useRef<HTMLInputElement>(null);
  const [filasConError, setFilasConError] = useState<FilaConError[]>([]);
  const [resumenError, setResumenError] = useState('');

  const descargar = useBiTradeMutation(
    () => recursos[recurso].descargarPlantilla(),
    'Plantilla descargada',
  );

  const exportar = useBiTradeMutation(
    (filtros: Record<string, unknown>) => recursos[recurso].exportar(filtros),
    'Excel exportado',
  );

  const importar = useBiTradeMutation(
    (archivo: File) => recursos[recurso].importar(archivo),
    (datos) => datos.message,
  );

  const alElegirArchivo = (evento: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = evento.target.files?.[0];
    // Se limpia el input para que elegir el mismo archivo otra vez vuelva a
    // disparar el evento; si no, un reintento tras corregir no haría nada.
    evento.target.value = '';
    if (!archivo) return;

    setFilasConError([]);
    setResumenError('');
    importar.mutate(archivo, {
      onError: (error) => {
        if (!(error instanceof ApiError)) return;
        setResumenError(error.message);
        const detalle = (error.body as { filas?: FilaConError[] } | undefined)?.filas;
        setFilasConError(Array.isArray(detalle) ? detalle : []);
      },
    });
  };

  return (
    <>
      {filtrosExport && (
        <Button
          variant="outline"
          disabled={exportar.isPending}
          onClick={() => exportar.mutate(filtrosExport)}
        >
          {exportar.isPending && <Spinner data-icon="inline-start" />}
          <FileSpreadsheetIcon data-icon="inline-start" />
          Exportar Excel
        </Button>
      )}

      <Button
        variant="outline"
        disabled={descargar.isPending}
        onClick={() => descargar.mutate(undefined)}
      >
        {descargar.isPending && <Spinner data-icon="inline-start" />}
        <DownloadIcon data-icon="inline-start" />
        Descargar plantilla
      </Button>

      <Button
        variant="outline"
        disabled={importar.isPending}
        onClick={() => inputArchivo.current?.click()}
      >
        {importar.isPending && <Spinner data-icon="inline-start" />}
        <UploadIcon data-icon="inline-start" />
        Importar Excel
      </Button>

      <input
        ref={inputArchivo}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={alElegirArchivo}
      />

      <Dialog
        open={filasConError.length > 0}
        onOpenChange={(abierto) => !abierto && setFilasConError([])}
      >
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>El archivo tiene filas con problemas</DialogTitle>
            <DialogDescription>{resumenError}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            {filasConError.map((fila) => (
              <Alert key={fila.fila} variant="destructive">
                <AlertTitle>Fila {fila.fila}</AlertTitle>
                <AlertDescription>
                  <ul className="flex list-disc flex-col gap-1 pl-4">
                    {fila.errores.map((mensaje) => (
                      <li key={mensaje}>{mensaje}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            ))}
          </div>

          <DialogFooter>
            <Button onClick={() => setFilasConError([])}>Entendido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
