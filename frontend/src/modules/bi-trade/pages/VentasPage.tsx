import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftIcon, PencilIcon, PlusIcon, ReceiptTextIcon, Trash2Icon } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Input,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui';
import { ConfirmarBorrado } from '@/shared/components/feedback';
import { Encabezado, EstadoTabla, Kpi } from '@/shared/components/layout';
import {
  formatoFecha,
  formatoMoneda,
  formatoMonedaCorta,
  formatoNumero,
} from '@/shared/lib/formato';
import { cn } from '@/shared/lib/utils';
import { biTradeApi, type ResumenVentas, type Venta, type VentaPayload } from '../api';
import { useFuente } from '../fuente';
import {
  useBiTradeMutation,
  useListado,
  useOpciones,
  useProductos,
  usePuntosVenta,
  useResumen,
} from '../hooks';
import { CampoSelect } from '../components/CampoSelect';
import { BotonesExcel } from '../components/BotonesExcel';
import { ImportarQueryVentas } from '../components/ImportarQueryVentas';
import { BarraFiltros, CampoBusqueda, CampoFiltro, soloConValor } from '../components/Filtros';
import { Paginacion } from '../components/Paginacion';

const POR_PAGINA = 15;

/** Los filtros del listado. Las llaves son los parámetros que espera la API. */
interface FiltrosVenta {
  search?: string;
  desde?: string;
  hasta?: string;
  id_punto_venta?: string;
  id_producto?: string;
  regional?: string;
  marca?: string;
  cantidad_min?: string;
  cantidad_max?: string;
}

export default function VentasPage() {
  const fuente = useFuente();
  const recursos = fuente.recursos ?? biTradeApi;
  const [filtros, setFiltros] = useState<FiltrosVenta>({});
  const [pagina, setPagina] = useState(1);
  const [editando, setEditando] = useState<Venta | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [vaciarAbierto, setVaciarAbierto] = useState(false);
  const [porBorrar, setPorBorrar] = useState<Venta | null>(null);

  const { data: opciones } = useOpciones();
  const { data: productos = [] } = useProductos();
  const { data: puntos = [] } = usePuntosVenta();

  const consulta = soloConValor(filtros);
  // Las tarjetas y la exportación comparten el filtro pero ignoran la página:
  // suman y descargan todo lo filtrado, no las 15 filas visibles.
  const { data: pagina1, isFetching } = useListado<Venta>('ventas', {
    ...consulta,
    page: pagina,
  });
  const { data: resumen } = useResumen<ResumenVentas>('ventas', consulta);

  const ventas = pagina1?.items ?? [];
  const total = pagina1?.total ?? 0;

  /** Cambiar un filtro vuelve a la página 1: la 7 podría no existir ya. */
  const cambiar = (parche: Partial<FiltrosVenta>) => {
    setFiltros({ ...filtros, ...parche });
    setPagina(1);
  };

  const eliminar = useBiTradeMutation(
    (id: number) => recursos.ventas.remove(id),
    'Venta eliminada',
  );
  const vaciar = useBiTradeMutation(
    () => recursos.ventas.removeAll(),
    (datos) => datos.message,
  );

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="Ventas"
        descripcion="Qué producto se vendió, en qué punto, cuándo y cuántas unidades."
      >
        <Button variant="outline" render={<Link to={fuente.base} />}>
          <ArrowLeftIcon data-icon="inline-start" />
          Tablero
        </Button>
        <Button
          onClick={() => {
            setEditando(null);
            setAbierto(true);
          }}
        >
          <PlusIcon data-icon="inline-start" />
          Nueva venta
        </Button>
        <BotonesExcel recurso="ventas" filtrosExport={consulta} />
        {fuente.importarQueryVentas && (
          <ImportarQueryVentas importar={fuente.importarQueryVentas} />
        )}
        <Button
          variant="destructive"
          disabled={total === 0 || vaciar.isPending}
          onClick={() => setVaciarAbierto(true)}
        >
          <Trash2Icon data-icon="inline-start" />
          Eliminar todo
        </Button>
      </Encabezado>

      <div
        className={cn(
          'grid gap-4 sm:grid-cols-2',
          fuente.conPuntos ? 'lg:grid-cols-4' : 'lg:grid-cols-3',
        )}
      >
        <Kpi
          label="Ventas registradas"
          value={formatoNumero(resumen?.registros ?? 0)}
          hint={`${formatoNumero(resumen?.productos ?? 0)} productos · ${formatoNumero(
            resumen?.puntosVenta ?? 0,
          )} puntos de venta`}
        />
        <Kpi
          label="Unidades vendidas"
          value={formatoNumero(resumen?.unidades ?? 0)}
          hint="Suma de la cantidad de cada venta"
        />
        <Kpi
          label="Importe"
          value={formatoMonedaCorta(resumen?.ingresos ?? 0)}
          hint={formatoMoneda(resumen?.ingresos ?? 0)}
        />
        {fuente.conPuntos && (
          <Kpi
            label="Puntos"
            value={formatoNumero(resumen?.puntos ?? 0)}
            hint="Unidades × puntaje del producto"
          />
        )}
      </div>

      <BarraFiltros
        hayFiltros={Object.keys(consulta).length > 0}
        onLimpiar={() => {
          setFiltros({});
          setPagina(1);
        }}
      >
        <CampoBusqueda
          value={filtros.search ?? ''}
          onChange={(v) => cambiar({ search: v })}
          placeholder="Código o nombre de producto o punto de venta…"
        />
        <CampoFiltro
          id="filtro-desde"
          label="Desde"
          tipo="date"
          value={filtros.desde ?? ''}
          onChange={(v) => cambiar({ desde: v })}
        />
        <CampoFiltro
          id="filtro-hasta"
          label="Hasta"
          tipo="date"
          value={filtros.hasta ?? ''}
          onChange={(v) => cambiar({ hasta: v })}
        />
        <CampoSelect
          id="filtro-pdv"
          label="Punto de venta"
          placeholder="Todos los puntos"
          value={filtros.id_punto_venta ?? ''}
          onChange={(v) => cambiar({ id_punto_venta: v })}
          opciones={puntos.map((p) => ({ value: p.idPuntoVenta, label: p.nombrePdv }))}
        />
        <CampoSelect
          id="filtro-producto"
          label="Producto"
          placeholder="Todos los productos"
          value={filtros.id_producto ?? ''}
          onChange={(v) => cambiar({ id_producto: v })}
          opciones={productos.map((p) => ({ value: p.idProducto, label: p.nombreProducto }))}
        />
        <CampoSelect
          id="filtro-regional"
          label="Regional"
          placeholder="Todas las regionales"
          value={filtros.regional ?? ''}
          onChange={(v) => cambiar({ regional: v })}
          opciones={(opciones?.regionales ?? []).map((r) => ({ value: r.value, label: r.label }))}
        />
        <CampoSelect
          id="filtro-marca"
          label="Marca"
          placeholder="Todas las marcas"
          value={filtros.marca ?? ''}
          onChange={(v) => cambiar({ marca: v })}
          opciones={(opciones?.marcas ?? []).map((m) => ({ value: m, label: m }))}
        />
        <CampoFiltro
          id="filtro-cantidad-min"
          label="Cantidad mín."
          tipo="number"
          min={0}
          value={filtros.cantidad_min ?? ''}
          onChange={(v) => cambiar({ cantidad_min: v })}
        />
        <CampoFiltro
          id="filtro-cantidad-max"
          label="Cantidad máx."
          tipo="number"
          min={0}
          value={filtros.cantidad_max ?? ''}
          onChange={(v) => cambiar({ cantidad_max: v })}
        />
      </BarraFiltros>

      <Card className="py-0">
        <EstadoTabla
          cargando={isFetching && !pagina1}
          vacio={total === 0}
          icono={<ReceiptTextIcon />}
          titulo="Sin ventas para este filtro"
          descripcion="Cambia o limpia los filtros, o registra la primera venta."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead className="hidden lg:table-cell">Marca</TableHead>
                <TableHead>Punto de venta</TableHead>
                <TableHead className="hidden xl:table-cell">Regional</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ventas.map((venta) => (
                <TableRow key={venta.idVenta}>
                  <TableCell className="whitespace-nowrap">
                    {formatoFecha(venta.fechaVenta)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{venta.nombreProducto}</span>
                      <span className="text-xs text-muted-foreground lg:hidden">{venta.marca}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <Badge variant="secondary">{venta.marca}</Badge>
                  </TableCell>
                  <TableCell>{venta.nombrePdv}</TableCell>
                  <TableCell className="hidden text-muted-foreground xl:table-cell">
                    {venta.regional || 'Sin dato'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatoNumero(venta.cantidadVendida)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatoMoneda(venta.totalColtrade)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Editar"
                        onClick={() => {
                          setEditando(venta);
                          setAbierto(true);
                        }}
                      >
                        <PencilIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Eliminar"
                        onClick={() => setPorBorrar(venta)}
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </EstadoTabla>
      </Card>

      <Paginacion
        pagina={pagina}
        onPaginaChange={setPagina}
        total={total}
        porPagina={POR_PAGINA}
        cargando={isFetching}
      />

      <VentaDialog abierto={abierto} onOpenChange={setAbierto} venta={editando} />

      <ConfirmarBorrado
        abierto={vaciarAbierto}
        onOpenChange={setVaciarAbierto}
        titulo="¿Eliminar TODOS los registros?"
        descripcion="Se borrará el histórico completo de ventas y el tablero quedará en cero. Esta acción no se puede deshacer."
        onConfirmar={() => {
          vaciar.mutate(undefined);
          setVaciarAbierto(false);
        }}
      />

      <ConfirmarBorrado
        abierto={!!porBorrar}
        onOpenChange={(v) => !v && setPorBorrar(null)}
        titulo="¿Eliminar la venta?"
        descripcion="El tablero se recalcula sin ella."
        onConfirmar={() => {
          if (porBorrar) eliminar.mutate(porBorrar.idVenta);
          setPorBorrar(null);
        }}
      />
    </div>
  );
}

const hoyISO = () => new Date().toISOString().slice(0, 10);

const vacio = (): VentaPayload => ({
  idProducto: '',
  idPuntoVenta: '',
  fechaVenta: hoyISO(),
  cantidadVendida: 1,
});

function VentaDialog({
  abierto,
  onOpenChange,
  venta,
}: {
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
  venta: Venta | null;
}) {
  const editando = !!venta;
  const recursos = useFuente().recursos ?? biTradeApi;
  const { data: productos = [] } = useProductos();
  const { data: puntos = [] } = usePuntosVenta();
  const [datos, setDatos] = useState<VentaPayload>(vacio);

  const guardar = useBiTradeMutation(
    (payload: Partial<VentaPayload>) =>
      editando ? recursos.ventas.update(venta.idVenta, payload) : recursos.ventas.create(payload),
    editando ? 'Venta actualizada' : 'Venta registrada',
  );

  useEffect(() => {
    if (!abierto) return;
    setDatos(
      venta
        ? {
            idProducto: venta.idProducto,
            idPuntoVenta: venta.idPuntoVenta,
            fechaVenta: venta.fechaVenta,
            cantidadVendida: venta.cantidadVendida,
          }
        : vacio(),
    );
  }, [abierto, venta]);

  const productoElegido = productos.find((p) => p.idProducto === datos.idProducto);
  const total =
    productoElegido?.precioVentaColtrade == null
      ? null
      : productoElegido.precioVentaColtrade * (datos.cantidadVendida || 0);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    guardar.mutate(datos, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editando ? 'Editar venta' : 'Nueva venta'}</DialogTitle>
          <DialogDescription>
            El total se calcula con el precio Coltrade del producto.
          </DialogDescription>
        </DialogHeader>

        <form id="venta-form" onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <CampoSelect
              id="venta-producto"
              label="Producto"
              placeholder="Elige el producto"
              className="w-full"
              incluirTodas={false}
              value={datos.idProducto}
              onChange={(v) => setDatos({ ...datos, idProducto: v })}
              opciones={productos.map((p) => ({
                value: p.idProducto,
                label: `${p.nombreProducto} · ${p.marca}`,
              }))}
            />

            <CampoSelect
              id="venta-pdv"
              label="Punto de venta"
              placeholder="Elige el punto de venta"
              className="w-full"
              incluirTodas={false}
              value={datos.idPuntoVenta}
              onChange={(v) => setDatos({ ...datos, idPuntoVenta: v })}
              opciones={puntos.map((p) => ({
                value: p.idPuntoVenta,
                label: `${p.nombrePdv}${p.regional ? ` · ${p.regional}` : ''}`,
              }))}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="venta-fecha">Fecha de la venta</FieldLabel>
                <Input
                  id="venta-fecha"
                  type="date"
                  value={datos.fechaVenta}
                  onChange={(e) => setDatos({ ...datos, fechaVenta: e.target.value })}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="venta-cantidad">Cantidad vendida</FieldLabel>
                <Input
                  id="venta-cantidad"
                  type="number"
                  min={1}
                  step={1}
                  value={datos.cantidadVendida}
                  onChange={(e) => setDatos({ ...datos, cantidadVendida: Number(e.target.value) })}
                  required
                />
              </Field>
            </div>

            {productoElegido && (
              <Field>
                <FieldLabel>Total de la venta</FieldLabel>
                <p className="text-lg font-semibold tabular-nums">{formatoMoneda(total)}</p>
                <FieldDescription>
                  {formatoNumero(datos.cantidadVendida || 0)} ×{' '}
                  {formatoMoneda(productoElegido.precioVentaColtrade)}
                </FieldDescription>
              </Field>
            )}
          </FieldGroup>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="venta-form"
            disabled={guardar.isPending || !datos.idProducto || !datos.idPuntoVenta}
          >
            {guardar.isPending && <Spinner data-icon="inline-start" />}
            {editando ? 'Guardar' : 'Registrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
