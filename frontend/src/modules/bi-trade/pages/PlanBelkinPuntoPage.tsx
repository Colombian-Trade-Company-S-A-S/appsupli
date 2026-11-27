import { Link, useParams } from 'react-router-dom';
import { ArrowLeftIcon, MapPinIcon, StoreIcon } from 'lucide-react';
import { Badge, Button, Card, CardContent } from '@/shared/components/ui';
import { Encabezado, Kpi } from '@/shared/components/layout';
import { EsqueletoPagina } from '@/shared/components/feedback';
import { usePermisosBi } from '../permisos';
import { formatoNumero } from '@/shared/lib/formato';
import { useCatalogoBelkin } from '../hooks';
import { PLANES } from '../planes';
import { AsesoresDelPunto, fechaCorta } from '../components/AsesoresDelPunto';

const PLAN = PLANES.belkin.ruta;

/**
 * Un punto de venta del plan Recomiéndame Belkin: sus datos y la historia de
 * sus asesores Apple, con el rango de cada uno editable en el calendario.
 */
export default function PlanBelkinPuntoPage() {
  const { id = '' } = useParams();
  const idPunto = decodeURIComponent(id);
  const puedeAdministrar = usePermisosBi().editar('belkin', 'plan');
  const { data: puntos, isLoading } = useCatalogoBelkin('puntosVenta');
  const { data: asesores = [] } = useCatalogoBelkin('asesores');

  if (isLoading || !puntos) return <EsqueletoPagina forma="detalle" label="Abriendo el punto…" />;

  const punto = puntos.find((p) => p.idPuntoVenta === idPunto);
  const volver = `${PLAN}/listas/puntos-venta`;
  if (!punto) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">No encontramos ese punto de venta.</p>
        <Button variant="outline" render={<Link to={volver} />}>
          <ArrowLeftIcon data-icon="inline-start" />
          Volver a los puntos de venta
        </Button>
      </div>
    );
  }

  const delPunto = asesores.filter((a) => a.idPuntoVenta === punto.idPuntoVenta);
  const actuales = delPunto.filter((a) => !a.hasta && a.activo && !a.reemplazadoPor);
  const desdeCuando = actuales
    .map((a) => a.desde)
    .filter((d): d is string => !!d)
    .sort()[0];

  return (
    <div className="mx-auto flex w-full max-w-4xl animate-entrada-pagina flex-col gap-6">
      <Button variant="ghost" size="sm" className="self-start" render={<Link to={volver} />}>
        <ArrowLeftIcon data-icon="inline-start" />
        Volver a los puntos de venta
      </Button>

      <Encabezado
        titulo={punto.nombrePdv}
        descripcion="Punto de venta del plan Recomiéndame Belkin."
      >
        <Badge variant="secondary">{punto.idPuntoVenta}</Badge>
        {punto.regional ? (
          <Badge variant="outline">
            <MapPinIcon data-icon="inline-start" />
            {punto.regional}
          </Badge>
        ) : (
          <Badge variant="outline">Fuera de Coltrade</Badge>
        )}
        {!punto.activo && <Badge variant="destructive">Inactivo</Badge>}
      </Encabezado>

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi
          label="Asesor actual"
          value={actuales.length ? actuales.map((a) => a.nombre).join(' · ') : 'Sin asesor'}
          hint={desdeCuando ? `Desde el ${fechaCorta(desdeCuando)}` : undefined}
          extra={<StoreIcon className="size-4 text-muted-foreground" />}
        />
        <Kpi
          label="Categoría"
          value={punto.categoria ? `Categoría ${punto.categoria}` : 'Sin categoría'}
          hint={punto.categoria ? 'Fija cuántas recomendaciones pide el bono' : 'No gana bono'}
        />
        <Kpi
          label="Recomendaciones"
          value={formatoNumero(punto.registrosCount)}
          hint={`${formatoNumero(delPunto.length)} asesor(es) en su historia`}
        />
      </div>

      <AsesoresDelPunto punto={punto} asesores={delPunto} puedeAdministrar={puedeAdministrar} />

      {!puedeAdministrar && (
        <Card className="py-3">
          <CardContent className="text-sm text-muted-foreground">
            Puedes consultar la historia, pero para cambiar asesores o fechas necesitas el permiso
            de editar los datos de BI Trade.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
