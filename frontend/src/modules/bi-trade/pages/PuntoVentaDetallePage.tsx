import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeftIcon, CalendarXIcon, MapPinIcon, TrophyIcon, UsersIcon } from 'lucide-react';
import { Badge, Button, Card, CardContent, Spinner } from '@/shared/components/ui';
import { Encabezado } from '@/shared/components/layout';
import { EsqueletoPagina } from '@/shared/components/feedback';
import { formatoNumero } from '@/shared/lib/formato';
import { useAvanceMensual, useDetallePunto } from '../hooks';
import { useFuente } from '../fuente';
import { GraficoAvance } from '../components/AvanceMensual';
import {
  AReforzar,
  CaminoALaMeta,
  CifrasDelMes,
  Dato,
  Inventario,
  PorMarca,
  PorProducto,
  Ventas,
} from '../components/DetalleAvance';
import {
  SelectorMes,
  aValorMes,
  desdeValorMes,
  mesActual,
  nombreDelMes,
  type Mes,
} from '../components/SelectorMes';

/**
 * Todo el mes de un punto de venta.
 *
 * Es el tablero del canal recortado a un punto, con lo que solo tiene sentido
 * mirando un punto a la vez: cuánto le falta y cuánto tiene que vender cada
 * día hábil para cumplir (el asesor descansa el domingo), su promedio, en
 * cuánto cerraría si sigue así, qué productos con meta van flojos, su stock y
 * cada venta del mes. El mes viaja en la dirección (`?mes=2026-11`), así el
 * enlace se puede compartir.
 */
export default function PuntoVentaDetallePage() {
  const { id = '' } = useParams();
  const idPunto = decodeURIComponent(id);
  const fuente = useFuente();
  const [params, setParams] = useSearchParams();
  const mes: Mes = desdeValorMes(params.get('mes') ?? '') ?? mesActual();
  const cambiarMes = (nuevo: Mes) => setParams({ mes: aValorMes(nuevo) }, { replace: true });

  const { data, isLoading, isError, isFetching } = useDetallePunto(idPunto, mes);
  // El tablero del mes sin filtros: de ahí sale su puesto y el de su regional.
  const { data: general } = useAvanceMensual({ ...mes });

  const posicion = useMemo(() => {
    const conMeta = (general?.porPuntoVenta ?? [])
      .filter((fila) => fila.metaMensual > 0)
      .sort((a, b) => b.cumplimiento - a.cumplimiento);
    const indice = conMeta.findIndex((fila) => fila.key === idPunto);
    return indice >= 0 ? { puesto: indice + 1, de: conMeta.length } : null;
  }, [general, idPunto]);
  const regional = general?.porRegional.find((fila) => fila.label === data?.punto.regional);

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">No encontramos ese punto de venta.</p>
        <Button variant="outline" render={<Link to={fuente.base} />}>
          <ArrowLeftIcon data-icon="inline-start" />
          Volver al tablero
        </Button>
      </div>
    );
  }
  if (isLoading || !data) {
    return <EsqueletoPagina forma="tablero" label="Abriendo el punto de venta…" />;
  }

  const enlaceRegional =
    data.punto.regional && fuente.detalleRegional
      ? `${fuente.base}/regional/${encodeURIComponent(data.punto.regional)}?mes=${aValorMes(mes)}`
      : null;

  return (
    <div className="flex min-w-0 animate-entrada-pagina flex-col gap-6">
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        render={<Link to={`${fuente.base}?mes=${aValorMes(mes)}`} />}
      >
        <ArrowLeftIcon data-icon="inline-start" />
        Volver al tablero
      </Button>

      <Encabezado
        titulo={data.punto.nombre}
        descripcion={`${fuente.titulo} · ${nombreDelMes(mes)}. Cómo va el punto contra su meta y qué le falta para cumplirla.`}
      >
        {isFetching && <Spinner className="text-muted-foreground" />}
        {enlaceRegional ? (
          <Badge variant="outline" render={<Link to={enlaceRegional} />}>
            <MapPinIcon data-icon="inline-start" />
            {data.punto.regional}
          </Badge>
        ) : (
          <Badge variant="outline">{data.punto.regional || 'Sin regional'}</Badge>
        )}
        <Badge variant="secondary">{data.punto.idPuntoVenta}</Badge>
      </Encabezado>

      <Card className="py-4">
        <CardContent>
          <SelectorMes valor={mes} onChange={cambiarMes} />
        </CardContent>
      </Card>

      <CifrasDelMes data={data} />

      <CaminoALaMeta
        data={data}
        descripcion="Los días hábiles van de lunes a sábado, sin festivos: el asesor descansa el domingo."
        contexto={
          <>
            <Dato
              icono={TrophyIcon}
              rotulo="Puesto en el canal"
              valor={posicion ? `${posicion.puesto} de ${posicion.de}` : '—'}
              detalle="Por cumplimiento, entre los puntos con meta"
            />
            <Dato
              icono={UsersIcon}
              rotulo="Su regional"
              valor={regional ? `${regional.cumplimiento}%` : '—'}
              detalle={regional ? `Cumplimiento de ${regional.label}` : undefined}
            />
            <Dato
              icono={CalendarXIcon}
              rotulo="Días sin ventas"
              valor={formatoNumero(data.ritmo.diasSinVenta)}
              detalle="Hábiles corridos sin ninguna venta cargada"
            />
          </>
        }
      />

      <GraficoAvance
        datos={data}
        onExportar={(hoja) => fuente.exportarAvance({ ...mes, id_punto_venta: idPunto }, hoja)}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <PorMarca filas={data.porMarca} />
        <AReforzar data={data} />
      </div>

      <PorProducto data={data} />
      <Inventario data={data} />
      <Ventas data={data} />
    </div>
  );
}
