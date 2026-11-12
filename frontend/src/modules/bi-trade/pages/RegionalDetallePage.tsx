import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeftIcon, CalendarXIcon, MapPinIcon, StoreIcon, TrophyIcon } from 'lucide-react';
import { Badge, Button, Card, CardContent, Spinner } from '@/shared/components/ui';
import { Encabezado } from '@/shared/components/layout';
import { EsqueletoPagina } from '@/shared/components/feedback';
import { formatoNumero } from '@/shared/lib/formato';
import { useAvanceMensual, useDetalleRegional } from '../hooks';
import { useFuente } from '../fuente';
import { GraficoAvance, TablaAvance } from '../components/AvanceMensual';
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
 * Todo el mes de una regional: el detalle del punto de venta, sumando todos
 * los de la regional, más el avance de cada uno de sus puntos (cada nombre
 * lleva al detalle de ese punto).
 *
 * El ritmo cuenta todos los días del mes: en una regional siempre hay algún
 * punto vendiendo, así que aquí no aplica el día de descanso del asesor.
 */
export default function RegionalDetallePage() {
  const { nombre = '' } = useParams();
  const regional = decodeURIComponent(nombre);
  const fuente = useFuente();
  const [params, setParams] = useSearchParams();
  const mes: Mes = desdeValorMes(params.get('mes') ?? '') ?? mesActual();
  const cambiarMes = (nuevo: Mes) => setParams({ mes: aValorMes(nuevo) }, { replace: true });

  const { data, isLoading, isError, isFetching } = useDetalleRegional(regional, mes);
  // El tablero del mes sin filtros: de ahí sale el puesto de la regional.
  const { data: general } = useAvanceMensual({ ...mes });

  const posicion = useMemo(() => {
    const conMeta = (general?.porRegional ?? [])
      .filter((fila) => fila.metaMensual > 0)
      .sort((a, b) => b.cumplimiento - a.cumplimiento);
    const indice = conMeta.findIndex((fila) => fila.label === regional);
    return indice >= 0 ? { puesto: indice + 1, de: conMeta.length } : null;
  }, [general, regional]);

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">No encontramos esa regional.</p>
        <Button variant="outline" render={<Link to={fuente.base} />}>
          <ArrowLeftIcon data-icon="inline-start" />
          Volver al tablero
        </Button>
      </div>
    );
  }
  if (isLoading || !data) {
    return <EsqueletoPagina forma="tablero" label="Abriendo la regional…" />;
  }

  const enlacePunto = (idPunto: string) =>
    `${fuente.base}/punto/${encodeURIComponent(idPunto)}?mes=${aValorMes(mes)}`;
  const info = data.regional;

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
        titulo={info.nombre}
        descripcion={`${fuente.titulo} · ${nombreDelMes(mes)}. Cómo va la regional contra su meta, punto por punto.`}
      >
        {isFetching && <Spinner className="text-muted-foreground" />}
        <Badge variant="outline">
          <MapPinIcon data-icon="inline-start" />
          Regional
        </Badge>
        <Badge variant="secondary">{formatoNumero(info.puntos)} puntos de venta</Badge>
      </Encabezado>

      <Card className="py-4">
        <CardContent>
          <SelectorMes valor={mes} onChange={cambiarMes} />
        </CardContent>
      </Card>

      <CifrasDelMes data={data} />

      <CaminoALaMeta
        data={data}
        descripcion="Cuenta todos los días del mes: en la regional siempre hay algún punto vendiendo, así que no hay día de descanso."
        contexto={
          <>
            <Dato
              icono={TrophyIcon}
              rotulo="Puesto entre regionales"
              valor={posicion ? `${posicion.puesto} de ${posicion.de}` : '—'}
              detalle="Por cumplimiento, entre las regionales con meta"
            />
            <Dato
              icono={StoreIcon}
              rotulo="Puntos que ya cumplieron"
              valor={`${info.puntosQueCumplen} de ${info.puntosConMeta}`}
              detalle="Entre los puntos con meta este mes"
            />
            <Dato
              icono={CalendarXIcon}
              rotulo="Días sin ventas"
              valor={formatoNumero(data.ritmo.diasSinVenta)}
              detalle="Días corridos sin ninguna venta en la regional"
            />
          </>
        }
      />

      <GraficoAvance
        datos={data}
        onExportar={(hoja) => fuente.exportarAvance({ ...mes, regional }, hoja)}
      />

      <TablaAvance
        titulo="Avance por punto de venta"
        descripcion="Cada punto de la regional contra su meta, con su stock. Toca un punto para ver su detalle."
        encabezado="Punto de venta"
        filas={data.porPuntoVenta}
        hoja="puntos"
        onExportar={(hoja) => fuente.exportarAvance({ ...mes, regional }, hoja)}
        columnaInventario
        enlace={fuente.detallePunto ? (fila) => enlacePunto(fila.key) : undefined}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <PorMarca filas={data.porMarca} />
        <AReforzar data={data} />
      </div>

      <PorProducto data={data} />
      <Inventario data={data} />
      <Ventas data={data} enlacePunto={fuente.detallePunto ? enlacePunto : undefined} />
    </div>
  );
}
