import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftIcon, CalendarOffIcon, DownloadIcon, XIcon } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Spinner,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/shared/components/ui';
import { Encabezado, Kpi } from '@/shared/components/layout';
import { formatoMoneda, formatoMonedaCorta, formatoNumero } from '@/shared/lib/formato';
import type { CorteDia } from '../api';
import {
  useCumplimientoDiario,
  useDescarga,
  useOpciones,
  useProductos,
  usePuntosVenta,
} from '../hooks';
import { CampoSelect } from '../components/CampoSelect';
import { useFuente } from '../fuente';
import { HojasBi } from '../components/HojasBi';
import { BarraCumplimiento } from '../components/Cumplimiento';
import { SelectorDia, hoyISO } from '../components/SelectorDia';
import { TablaDia, formatear, medidasDe, type Medida } from '../components/TablaDia';

/** Los filtros que acotan el día, sin contar la fecha. */
interface Cortes {
  regional?: string;
  marca?: string;
  id_producto?: string;
  id_punto_venta?: string;
}

/**
 * Cumplimiento de un solo día.
 *
 * La hoja del mes responde «¿vamos a llegar?»; esta responde «¿cómo nos fue
 * ayer?». Por eso todo está amarrado a un día: la cuota con la que se compara
 * es la de ese día, y un rango no tendría contra qué medirse.
 */
export default function CumplimientoDiarioPage() {
  const fuente = useFuente();
  const { soloLectura } = fuente;
  const medidas = medidasDe(fuente.conPuntos);
  const [fecha, setFecha] = useState(hoyISO);
  const [cortes, setCortes] = useState<Cortes>({});
  const [medida, setMedida] = useState<Medida>('dinero');

  const consulta = { fecha, ...cortes };
  const { data, isLoading, isFetching } = useCumplimientoDiario(consulta);
  const { data: opciones } = useOpciones();
  const { data: productos = [] } = useProductos();
  const { data: puntos = [] } = usePuntosVenta();

  const exportar = useDescarga(() => fuente.exportarDia(consulta), 'Día descargado en Excel');

  const dia = data?.dia;
  const totales = data?.totales;
  const hayCortes = Object.values(cortes).some(Boolean);

  const cumplimiento =
    medida === 'dinero'
      ? (totales?.cumplimientoDinero ?? 0)
      : medida === 'cantidad'
        ? (totales?.cumplimientoCantidad ?? 0)
        : (totales?.cumplimientoPuntos ?? 0);
  const metaMedida =
    medida === 'dinero'
      ? (totales?.metaDinero ?? 0)
      : medida === 'cantidad'
        ? (totales?.metaCantidad ?? 0)
        : (totales?.metaPuntos ?? 0);
  const realMedida =
    medida === 'dinero'
      ? (totales?.realDinero ?? 0)
      : medida === 'cantidad'
        ? (totales?.realCantidad ?? 0)
        : (totales?.realPuntos ?? 0);

  const alExportar = (corte: CorteDia) => fuente.exportarDia(consulta, corte);

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="Cumplimiento diario"
        descripcion={
          dia ? `Cómo le fue al ${dia.nombre}.` : 'El cumplimiento de un día contra su cuota.'
        }
      >
        {!soloLectura && (
          <>
            <Button variant="outline" render={<Link to={fuente.base} />}>
              <ArrowLeftIcon data-icon="inline-start" />
              Avance del mes
            </Button>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="outline"
                    disabled={exportar.isPending}
                    onClick={() => exportar.mutate(undefined)}
                  >
                    {exportar.isPending ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <DownloadIcon data-icon="inline-start" />
                    )}
                    Descargar día
                  </Button>
                }
              />
              <TooltipContent>
                Un Excel con los cuatro cortes: regional, punto de venta, marca y producto
              </TooltipContent>
            </Tooltip>
          </>
        )}
      </Encabezado>

      <HojasBi />

      <Card className="py-4">
        <CardContent className="flex flex-wrap items-end gap-3">
          <SelectorDia
            fecha={fecha}
            onChange={setFecha}
            diasDelMes={dia?.diasDelMes ?? 31}
            diasNoHabiles={dia?.diasNoHabiles}
          />
          <CampoSelect
            id="dia-regional"
            label="Regional"
            placeholder="Todas las regionales"
            value={cortes.regional ?? ''}
            onChange={(v) => setCortes({ ...cortes, regional: v })}
            opciones={(opciones?.regionales ?? []).map((r) => ({ value: r.value, label: r.label }))}
          />
          <CampoSelect
            id="dia-pdv"
            label="Punto de venta"
            placeholder="Todos los puntos"
            value={cortes.id_punto_venta ?? ''}
            onChange={(v) => setCortes({ ...cortes, id_punto_venta: v })}
            opciones={puntos.map((p) => ({ value: p.idPuntoVenta, label: p.nombrePdv }))}
          />
          <CampoSelect
            id="dia-marca"
            label="Marca"
            placeholder="Todas las marcas"
            value={cortes.marca ?? ''}
            onChange={(v) => setCortes({ ...cortes, marca: v })}
            opciones={(opciones?.marcas ?? []).map((m) => ({ value: m, label: m }))}
          />
          <CampoSelect
            id="dia-producto"
            label="Producto"
            placeholder="Todos los productos"
            value={cortes.id_producto ?? ''}
            onChange={(v) => setCortes({ ...cortes, id_producto: v })}
            opciones={productos.map((p) => ({ value: p.idProducto, label: p.nombreProducto }))}
          />
          <Button variant="ghost" disabled={!hayCortes} onClick={() => setCortes({})}>
            <XIcon data-icon="inline-start" />
            Limpiar
          </Button>

          <div className="ml-auto flex items-center gap-2">
            {isFetching && <Spinner className="text-muted-foreground" />}
            {dia && !dia.habil && (
              <Badge variant="outline">
                <CalendarOffIcon className="size-3" />
                {dia.esDomingo ? 'Domingo' : 'Festivo'}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* La medida manda en todas las tarjetas de abajo: mirando puntos se
          quieren ver puntos en los cuatro cortes, no cambiarlo en cada uno. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          value={[medida]}
          onValueChange={(v) => setMedida((v[0] as Medida) ?? 'dinero')}
          variant="outline"
        >
          {medidas.map((opcion) => (
            <ToggleGroupItem key={opcion.value} value={opcion.value}>
              {opcion.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {dia && (
          <p className="text-xs text-muted-foreground">
            Cuota del día = meta de {formatoMonedaCorta(totales?.metaMensualDinero ?? 0)} del mes ÷{' '}
            {dia.diasHabiles} días hábiles
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label={`Cumplimiento en ${medidas.find((m) => m.value === medida)?.label.toLowerCase()}`}
          cargando={isLoading}
          value={`${cumplimiento}%`}
          hint={`${formatear(realMedida, medida)} de ${formatear(metaMedida, medida)}`}
        >
          <BarraCumplimiento porcentaje={cumplimiento} />
        </Kpi>
        <Kpi
          label="Vendido en el día"
          cargando={isLoading}
          value={formatoMonedaCorta(totales?.realDinero ?? 0)}
          hint={formatoMoneda(totales?.realDinero ?? 0)}
        />
        <Kpi
          label={fuente.conPuntos ? 'Unidades y puntos' : 'Unidades'}
          cargando={isLoading}
          value={formatoNumero(totales?.realCantidad ?? 0)}
          hint={[
            fuente.conPuntos && `${formatoNumero(totales?.realPuntos ?? 0)} puntos`,
            `${formatoNumero(totales?.operaciones ?? 0)} operaciones`,
          ]
            .filter(Boolean)
            .join(' · ')}
        />
        <Kpi
          label="Cuota del día"
          cargando={isLoading}
          value={formatoMonedaCorta(totales?.metaDinero ?? 0)}
          hint={
            dia
              ? [
                  `${formatoNumero(totales?.metaCantidad ?? 0)} unidades`,
                  fuente.conPuntos && `${formatoNumero(totales?.metaPuntos ?? 0)} puntos`,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : '—'
          }
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <TablaDia
          titulo="Por regional"
          descripcion="Qué zona cumplió su cuota del día."
          encabezado="Regional"
          filas={data?.porRegional ?? []}
          medida={medida}
          corte="regional"
          onExportar={alExportar}
          cargando={isLoading}
        />
        <TablaDia
          titulo="Por marca"
          descripcion="Qué marcas movieron el día."
          encabezado="Marca"
          filas={data?.porMarca ?? []}
          medida={medida}
          corte="marcas"
          onExportar={alExportar}
          cargando={isLoading}
        />
      </div>

      <TablaDia
        titulo="Por punto de venta"
        descripcion="El detalle punto por punto, ordenado por cumplimiento."
        encabezado="Punto de venta"
        filas={data?.porPuntoVenta ?? []}
        medida={medida}
        corte="puntos"
        onExportar={alExportar}
        cargando={isLoading}
      />

      <TablaDia
        titulo="Por producto"
        descripcion="Qué se vendió y qué se quedó corto ese día."
        encabezado="Producto"
        filas={data?.porProducto ?? []}
        medida={medida}
        corte="productos"
        onExportar={alExportar}
        cargando={isLoading}
      />
    </div>
  );
}
