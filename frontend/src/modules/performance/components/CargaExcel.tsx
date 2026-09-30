import { useRef, useState } from 'react';
import { DownloadIcon, InfoIcon, UploadIcon } from 'lucide-react';
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
  Spinner,
} from '@/shared/components/ui';
import { ApiError } from '@/shared/api/http-client';
import { etiquetaMes } from '../api';
import { useDescargarPlantilla, useImportarObjetivos } from '../hooks';
import type { Persona } from '../api';

interface FilaConError {
  fila: number;
  errores: string[];
}

/**
 * Cargar los objetivos de una persona desde un Excel.
 *
 * Es la misma plantilla de BI Trade: se descarga con los encabezados y las
 * instrucciones, se llena y se sube. Las reglas no cambian —la suma da 100, el
 * máximo son seis objetivos y el mes se congela cuando empieza—, solo cambia
 * por dónde entran los datos.
 *
 * La carga es todo o nada: si una fila falla, el backend no guarda ninguna y
 * devuelve el detalle fila por fila, que es lo que se muestra acá para poder
 * corregir el archivo de una sola pasada.
 */
export function CargaExcel({
  colaborador,
  periodo,
  deshabilitado,
}: {
  colaborador?: Persona;
  periodo: string;
  /** El mes congelado no recibe objetivos, ni a mano ni por archivo. */
  deshabilitado?: boolean;
}) {
  const inputArchivo = useRef<HTMLInputElement>(null);
  const [modo, setModo] = useState<'agregar' | 'reemplazar'>('agregar');
  const [filasConError, setFilasConError] = useState<FilaConError[]>([]);
  const [resumenError, setResumenError] = useState('');

  const descargar = useDescargarPlantilla();
  const importar = useImportarObjetivos();

  const alElegirArchivo = (evento: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = evento.target.files?.[0];
    // Se limpia el input para que elegir el mismo archivo otra vez vuelva a
    // disparar el evento; si no, un reintento tras corregir no haría nada.
    evento.target.value = '';
    if (!archivo || !colaborador) return;

    setFilasConError([]);
    setResumenError('');
    importar.mutate(
      { archivo, colaborador: colaborador.id, periodo, modo },
      {
        onError: (error) => {
          if (!(error instanceof ApiError)) return;
          setResumenError(error.message);
          const detalle = (error.body as { filas?: FilaConError[] } | undefined)?.filas;
          setFilasConError(Array.isArray(detalle) ? detalle : []);
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cargar objetivos desde Excel</CardTitle>
        <CardDescription>
          Para definir varios objetivos de una vez. Descarga la plantilla, llénala y súbela: una
          fila por objetivo, y entre todas deben sumar 100%.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
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
            disabled={importar.isPending || deshabilitado || !colaborador}
            onClick={() => inputArchivo.current?.click()}
          >
            {importar.isPending && <Spinner data-icon="inline-start" />}
            <UploadIcon data-icon="inline-start" />
            Subir Excel
          </Button>

          <div className="flex items-center gap-1 rounded-lg border p-0.5 text-sm">
            <Button
              variant={modo === 'agregar' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setModo('agregar')}
            >
              Agregar
            </Button>
            <Button
              variant={modo === 'reemplazar' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setModo('reemplazar')}
            >
              Reemplazar
            </Button>
          </div>
        </div>

        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {colaborador ? (
              <>
                Se cargan para <b className="text-foreground">{colaborador.nombre}</b> en{' '}
                <b className="text-foreground">{etiquetaMes(periodo)}</b>.{' '}
              </>
            ) : (
              'Elige primero al colaborador y el mes. '
            )}
            {modo === 'agregar'
              ? 'Se suman a los que ya tenga ese mes.'
              : 'Se borran los que tenga ese mes y quedan solo los del archivo.'}
          </span>
        </p>

        <input
          ref={inputArchivo}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={alElegirArchivo}
        />
      </CardContent>

      <Dialog
        open={filasConError.length > 0}
        onOpenChange={(abierto) => !abierto && setFilasConError([])}
      >
        <DialogContent className="max-h-[80dvh] overflow-y-auto">
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
    </Card>
  );
}
