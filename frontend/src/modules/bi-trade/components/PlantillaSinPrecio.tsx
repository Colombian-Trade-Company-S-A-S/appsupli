import { DownloadIcon } from 'lucide-react';
import { Button, Spinner } from '@/shared/components/ui';
import { useDescarga } from '../hooks';

/**
 * Descarga la plantilla de productos HC ya llena con los que no tienen precio
 * (los que se crearon desde el reporte de inventario quedan en 0). Se llenan
 * los precios y se sube en Productos con «Importar Excel».
 */
export function BotonPlantillaSinPrecio({
  descargar,
  variant = 'outline',
}: {
  descargar: () => Promise<unknown>;
  variant?: 'outline' | 'default';
}) {
  const descarga = useDescarga(() => descargar(), 'Plantilla de productos sin precio descargada');
  return (
    <Button variant={variant} disabled={descarga.isPending} onClick={() => descarga.mutate()}>
      {descarga.isPending ? (
        <Spinner data-icon="inline-start" />
      ) : (
        <DownloadIcon data-icon="inline-start" />
      )}
      Productos sin precio
    </Button>
  );
}
