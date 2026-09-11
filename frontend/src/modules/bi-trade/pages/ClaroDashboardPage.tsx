import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BoxesIcon,
  CalendarDaysIcon,
  DownloadIcon,
  PackageIcon,
  ReceiptTextIcon,
  StoreIcon,
  TargetIcon,
  XIcon,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/shared/components/ui';
import { Encabezado, Kpi } from '@/shared/components/layout';
import { formatoMoneda, formatoMonedaCorta, formatoNumero } from '@/shared/lib/formato';
import type { HojaAvance } from '../api';
import { useAvanceMensual, useDescarga, useOpciones, usePuntosVenta } from '../hooks';
import { CampoSelect } from '../components/CampoSelect';
import { BarraCumplimiento } from '../components/Cumplimiento';
import { BadgeRitmo, GraficoAvance, TablaAvance, calcularRitmo } from '../components/AvanceMensual';
import { SelectorMes, mesActual, nombreDelMes, type Mes } from '../components/SelectorMes';
import { ImportarInforme } from '../components/ImportarInforme';
import { HojasBi } from '../components/HojasBi';
import { CompartirTablero } from '../components/CompartirTablero';
import { useFuente } from '../fuente';

/** Los accesos a cada módulo. Se declaran una vez para no repetir el botón. */
const MODULOS = [
  { ruta: 'ventas', etiqueta: 'Ventas', icono: ReceiptTextIcon },
  { ruta: 'puntos-venta', etiqueta: 'Puntos de venta', icono: StoreIcon },
  { ruta: 'productos', etiqueta: 'Productos', icono: PackageIcon },
  { ruta: 'inventario', etiqueta: 'Inventario', icono: BoxesIcon },
  { ruta: 'metas', etiqueta: 'Metas', icono: TargetIcon },
];

/** Tablero de BI Claro punto de venta: el avance del mes contra la meta. */
export default function ClaroDashboardPage() {
  const fuente = useFuente();
  const { soloLectura } = fuente;
  const [mes, setMes] = useState<Mes>(mesActual);
  const [filtros, setFiltros] = useState<{
    regional?: string;
    marca?: string;
    id_punto_venta?: string;
  }>({});
  const consulta = { ...mes, ...filtros };
  const { data, isFetching, isLoading } = useAvanceMensual(consulta);
  const { data: opciones } = useOpciones();
  const { data: puntos = [] } = usePuntosVenta();

  const exportar = useDescarga(
    (hoja?: HojaAvance) => fuente.exportarAvance(consulta, hoja),
    'Tablero descargado en Excel',
  );

  const totales = data?.totales;
  const periodo = data?.periodo;
  const ritmo = calcularRitmo(data);
  const hayFiltros = !!filtros.regional || !!filtros.marca || !!filtros.id_punto_venta;
  const nombrePunto =
    puntos.find((p) => p.idPuntoVenta === filtros.id_punto_venta)?.nombrePdv ??
    filtros.id_punto_venta;

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo={fuente.titulo}
        descripcion={`Avance de ${nombreDelMes(mes)} contra la meta del mes.`}
      >
        {!soloLectura && (
          <>
            <CompartirTablero canal={fuente.canal} />
            {/* El informe del ERP: Claro y Tmk sí; Homecenter y Falabella no. */}
            {fuente.importarInforme && <ImportarInforme importar={fuente.importarInforme} />}
            {MODULOS.map(({ ruta, etiqueta, icono: Icono }) => (
              <Button key={ruta} variant="outline" render={<Link to={`${fuente.base}/${ruta}`} />}>
                <Icono data-icon="inline-start" />
                {etiqueta}
              </Button>
            ))}
          </>
        )}
      </Encabezado>

      <HojasBi />

      <Card className="py-4">
        <CardContent className="flex flex-wrap items-end gap-3">
          <SelectorMes valor={mes} onChange={setMes} />
          <CampoSelect
            id="filtro-regional"
            label="Regional"
            placeholder="Todas las regionales"
            value={filtros.regional ?? ''}
            onChange={(v) => setFiltros({ ...filtros, regional: v })}
            opciones={(opciones?.regionales ?? []).map((r) => ({ value: r.value, label: r.label }))}
          />
          <CampoSelect
            id="filtro-pdv"
            label="Punto de venta"
            placeholder="Todos los puntos"
            value={filtros.id_punto_venta ?? ''}
            onChange={(v) => setFiltros({ ...filtros, id_punto_venta: v })}
            opciones={puntos.map((p) => ({ value: p.idPuntoVenta, label: p.nombrePdv }))}
          />
          <CampoSelect
            id="filtro-marca"
            label="Marca"
            placeholder="Todas las marcas"
            value={filtros.marca ?? ''}
            onChange={(v) => setFiltros({ ...filtros, marca: v })}
            opciones={(opciones?.marcas ?? []).map((m) => ({ value: m, label: m }))}
          />
          <Button variant="ghost" disabled={!hayFiltros} onClick={() => setFiltros({})}>
            <XIcon data-icon="inline-start" />
            Limpiar
          </Button>

          {/* Empuja la descarga al extremo: es una acción sobre el filtro
              completo, no otro campo del formulario. */}
          <div className="ml-auto flex items-center gap-2">
            {isFetching && <Spinner className="text-muted-foreground" />}
            {!soloLectura && (
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
                      Descargar mes
                    </Button>
                  }
                />
                <TooltipContent>
                  Un Excel con las tres vistas: día por día, regional y punto de venta
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </CardContent>
      </Card>

      {hayFiltros && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Filtrado por</span>
          {filtros.regional && (
            <Badge variant="outline">
              {filtros.regional}
              <button
                type="button"
                aria-label="Quitar el filtro de regional"
                className="ml-1 cursor-pointer opacity-60 hover:opacity-100"
                onClick={() => setFiltros({ ...filtros, regional: '' })}
              >
                <XIcon className="size-3" />
              </button>
            </Badge>
          )}
          {filtros.id_punto_venta && (
            <Badge variant="outline">
              {nombrePunto}
              <button
                type="button"
                aria-label="Quitar el filtro de punto de venta"
                className="ml-1 cursor-pointer opacity-60 hover:opacity-100"
                onClick={() => setFiltros({ ...filtros, id_punto_venta: '' })}
              >
                <XIcon className="size-3" />
              </button>
            </Badge>
          )}
          {filtros.marca && (
            <Badge variant="outline">
              {filtros.marca}
              <button
                type="button"
                aria-label="Quitar el filtro de marca"
                className="ml-1 cursor-pointer opacity-60 hover:opacity-100"
                onClick={() => setFiltros({ ...filtros, marca: '' })}
              >
                <XIcon className="size-3" />
              </button>
            </Badge>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Cumplimiento del mes"
          cargando={isLoading}
          value={`${totales?.cumplimiento ?? 0}%`}
          extra={<BadgeRitmo ritmo={ritmo} />}
          hint={
            ritmo && ritmo.habilesCorridos > 0
              ? `Debería ir en ${ritmo.esperado}% a estas alturas del mes`
              : 'El mes todavía no arranca'
          }
        >
          <BarraCumplimiento porcentaje={totales?.cumplimiento ?? 0} />
        </Kpi>
        <Kpi
          label="Vendido en el mes"
          cargando={isLoading}
          value={formatoMonedaCorta(totales?.ventasDinero ?? 0)}
          hint={`${formatoNumero(totales?.ventasCantidad ?? 0)} unidades de ${formatoNumero(
            totales?.metaCantidad ?? 0,
          )} de meta`}
        />
        <Kpi
          label="Meta diaria"
          cargando={isLoading}
          value={formatoMonedaCorta(totales?.metaDiaria ?? 0)}
          hint={
            periodo
              ? `${formatoMoneda(totales?.metaDinero ?? 0)} ÷ ${periodo.diasHabiles} días hábiles`
              : '—'
          }
        />
        <Kpi
          label="Días hábiles del mes"
          cargando={isLoading}
          value={
            ritmo && ritmo.habilesCorridos > 0 && ritmo.habilesCorridos < ritmo.habilesTotales
              ? `${ritmo.habilesCorridos} de ${ritmo.habilesTotales}`
              : formatoNumero(periodo?.diasHabiles ?? 0)
          }
          extra={<CalendarDaysIcon className="size-4 text-muted-foreground" />}
          hint={
            periodo
              ? `${periodo.diasDelMes} días − ${periodo.domingos} domingos − ${
                  periodo.festivos.length
                } festivo${periodo.festivos.length === 1 ? '' : 's'}`
              : '—'
          }
        />
      </div>

      <GraficoAvance
        datos={data}
        cargando={isLoading}
        onExportar={(hoja) => fuente.exportarAvance(consulta, hoja)}
      />

      <TablaAvance
        titulo="Avance por regional"
        descripcion="La meta del mes de cada zona contra lo que lleva vendido."
        encabezado="Regional"
        filas={data?.porRegional ?? []}
        hoja="regional"
        cargando={isLoading}
        onExportar={(hoja) => fuente.exportarAvance(consulta, hoja)}
      />

      <TablaAvance
        titulo="Avance por punto de venta"
        descripcion="El mismo corte, punto por punto, con el stock disponible."
        encabezado="Punto de venta"
        filas={data?.porPuntoVenta ?? []}
        hoja="puntos"
        cargando={isLoading}
        onExportar={(hoja) => fuente.exportarAvance(consulta, hoja)}
        columnaInventario
      />
    </div>
  );
}
