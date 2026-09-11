import { useState } from 'react';
import { CheckIcon, ClipboardIcon, DownloadIcon, SheetIcon } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/shared/components/ui';
import { useFuente } from '../fuente';

/** Una columna de lo que se copia al portapapeles. */
export interface ColumnaCopia<T> {
  encabezado: string;
  valor: (fila: T) => string | number;
}

/**
 * Arma un TSV.
 *
 * Separado por tabuladores y no por comas porque el destino es pegar en Excel:
 * el TSV se reparte en celdas al pegar, mientras que un CSV con comas se pega
 * todo en una sola columna cuando el separador de listas del sistema es el
 * punto y coma, como en la configuración en español.
 */
function aTsv<T>(columnas: Array<ColumnaCopia<T>>, filas: T[]) {
  const encabezado = columnas.map((columna) => columna.encabezado).join('\t');
  const cuerpo = filas.map((fila) =>
    columnas.map((columna) => String(columna.valor(fila))).join('\t'),
  );
  return [encabezado, ...cuerpo].join('\n');
}

/**
 * Botón chico de exportar, para la esquina de una gráfica o de una tabla.
 *
 * Ofrece las dos formas en que de verdad se saca un dato: el .xlsx cuando hay
 * que guardarlo o mandarlo, y el portapapeles cuando solo se va a pegar en una
 * hoja que ya está abierta. El Excel lo arma el backend con los mismos filtros
 * de la pantalla; la copia usa las filas que ya están en el navegador.
 */
export function BotonExportar<T>({
  etiqueta,
  descargar,
  columnas,
  filas,
}: {
  /** Qué se está exportando, para el tooltip y el toast. */
  etiqueta: string;
  descargar: () => Promise<unknown>;
  columnas: Array<ColumnaCopia<T>>;
  filas: T[];
}) {
  const { soloLectura } = useFuente();
  const [bajando, setBajando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const vacio = filas.length === 0;

  // En el tablero público no se saca información: ni Excel ni portapapeles.
  // Va después de los `useState` para no cambiar el orden de los hooks.
  if (soloLectura) return null;

  const alDescargar = async () => {
    setBajando(true);
    try {
      await descargar();
      toast.success(`${etiqueta} descargado en Excel`);
    } catch {
      toast.error('No se pudo generar el Excel.');
    } finally {
      setBajando(false);
    }
  };

  const alCopiar = async () => {
    try {
      await navigator.clipboard.writeText(aTsv(columnas, filas));
      setCopiado(true);
      toast.success(`${filas.length} filas copiadas: pégalas en Excel`);
      // El chulo vuelve a ser un portapapeles solo, sin desmontar el menú.
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error('El navegador no dio permiso para copiar.');
    }
  };

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={vacio || bajando}
                  aria-label={`Exportar ${etiqueta}`}
                >
                  {bajando ? <Spinner /> : <DownloadIcon />}
                </Button>
              }
            />
          }
        />
        <TooltipContent>{vacio ? 'Nada que exportar' : `Exportar ${etiqueta}`}</TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => void alDescargar()}>
            <SheetIcon />
            Descargar Excel
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void alCopiar()}>
            {copiado ? <CheckIcon /> : <ClipboardIcon />}
            Copiar {filas.length} filas
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
