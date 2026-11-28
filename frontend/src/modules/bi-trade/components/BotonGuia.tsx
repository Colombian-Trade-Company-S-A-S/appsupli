import { FileTextIcon } from 'lucide-react';
import { Button, Spinner } from '@/shared/components/ui';
import { descargarGuia } from '../api';
import { useDescarga } from '../hooks';
import type { Informe } from '../permisos';

/**
 * «Exportar PDF de uso …»: la guía del informe, escrita para quien lo usa.
 *
 * El PDF no es un archivo guardado: lo arma el servidor con el texto que está
 * en el código (`apps/bi_trade/guias`), así que al cambiar un informe y su
 * guía, este botón ya baja la versión nueva. Lo ve cualquiera que vea el
 * informe; el servidor revisa lo mismo.
 */
export function BotonGuia({ informe, nombre }: { informe: Informe; nombre: string }) {
  const descarga = useDescarga(() => descargarGuia(informe, nombre), 'Guía de uso descargada');

  return (
    <Button
      variant="outline"
      disabled={descarga.isPending}
      onClick={() => descarga.mutate(undefined)}
    >
      {descarga.isPending ? (
        <Spinner data-icon="inline-start" />
      ) : (
        <FileTextIcon data-icon="inline-start" />
      )}
      Exportar PDF de uso {nombre}
    </Button>
  );
}
