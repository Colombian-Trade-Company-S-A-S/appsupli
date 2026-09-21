import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftIcon, PencilIcon, PlusIcon, TargetIcon, Trash2Icon } from 'lucide-react';
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
import { biTradeApi, type MetaComercial, type MetaPayload, type ResumenMetas } from '../api';
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
import { BarraFiltros, CampoBusqueda, CampoFiltro, soloConValor } from '../components/Filtros';
import { Paginacion } from '../components/Paginacion';
import { desdeValorMes } from '../components/SelectorMes';

const POR_PAGINA = 15;

/** Los filtros del listado. Las llaves son los parámetros que espera la API. */
interface FiltrosMeta {
  search?: string;
  anio?: string;
  mes?: string;
  id_punto_venta?: string;
  id_producto?: string;
  regional?: string;
  marca?: string;
  dinero_min?: string;
  dinero_max?: string;
}

export default function MetasPage() {
  const fuente = useFuente();
  const recursos = fuente.recursos ?? biTradeApi;
  const [filtros, setFiltros] = useState<FiltrosMeta>({});
  // El `<input type="month">` se guarda aparte porque en la API el periodo son
  // dos parámetros (`anio` y `mes`) y aquí es un solo control.
  const [periodo, setPeriodo] = useState('');
  const [pagina, setPagina] = useState(1);
  const [editando, setEditando] = useState<MetaComercial | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [vaciarAbierto, setVaciarAbierto] = useState(false);
  const [porBorrar, setPorBorrar] = useState<MetaComercial | null>(null);

  const { data: opciones } = useOpciones();
  const { data: productos = [] } = useProductos();
  const { data: puntos = [] } = usePuntosVenta();

  const consulta = soloConValor(filtros);
  // Las tarjetas y la exportación comparten el filtro pero ignoran la página:
  // suman y descargan todo lo filtrado, no las 15 filas visibles.
  const { data: hoja, isFetching } = useListado<MetaComercial>('metas', {
    ...consulta,
    page: pagina,
  });
  const { data: resumen } = useResumen<ResumenMetas>('metas', consulta);

  const metas = hoja?.items ?? [];
  const total = hoja?.total ?? 0;

  /** Cambiar un filtro vuelve a la página 1: la 7 podría no existir ya. */
  const cambiar = (parche: Partial<FiltrosMeta>) => {
    setFiltros({ ...filtros, ...parche });
    setPagina(1);
  };

  const cambiarPeriodo = (valor: string) => {
    setPeriodo(valor);
    const mes = desdeValorMes(valor);
    cambiar({ anio: mes ? String(mes.anio) : '', mes: mes ? String(mes.mes) : '' });
  };

  const eliminar = useBiTradeMutation((id: number) => recursos.metas.remove(id), 'Meta eliminada');
  const vaciar = useBiTradeMutation(
    () => recursos.metas.removeAll(),
    (datos) => datos.message,
  );

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="Metas"
        descripcion="El objetivo de cada producto en cada punto de venta: unidades, dinero y puntos."
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
          Nueva meta
        </Button>
        <BotonesExcel recurso="metas" filtrosExport={consulta} />
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
          label="Metas cargadas"
          value={formatoNumero(resumen?.registros ?? 0)}
          hint={`${formatoNumero(resumen?.productos ?? 0)} productos · ${formatoNumero(
            resumen?.puntosVenta ?? 0,
          )} puntos de venta`}
        />
        <Kpi
          label="Meta en dinero"
          value={formatoMonedaCorta(resumen?.metaDinero ?? 0)}
          hint={formatoMoneda(resumen?.metaDinero ?? 0)}
        />
        <Kpi
          label="Meta en unidades"
          value={formatoNumero(resumen?.metaCantidad ?? 0)}
          hint="Suma de la meta de cada fila"
        />
        {fuente.conPuntos && (
          <Kpi
            label="Meta en puntos"
            value={formatoNumero(resumen?.metaPuntos ?? 0)}
            hint="Suma de la meta de puntos"
          />
        )}
      </div>

      <BarraFiltros
        hayFiltros={Object.keys(consulta).length > 0}
        onLimpiar={() => {
          setFiltros({});
          setPeriodo('');
          setPagina(1);
        }}
      >
        <CampoBusqueda
          value={filtros.search ?? ''}
          onChange={(v) => cambiar({ search: v })}
          placeholder="Código o nombre de producto o punto de venta…"
        />
        <CampoFiltro
          id="filtro-periodo"
          label="Periodo"
          tipo="month"
          className="w-44"
          value={periodo}
          onChange={cambiarPeriodo}
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
          id="filtro-dinero-min"
          label="Meta mín. $"
          tipo="number"
          min={0}
          className="w-40"
          value={filtros.dinero_min ?? ''}
          onChange={(v) => cambiar({ dinero_min: v })}
        />
        <CampoFiltro
          id="filtro-dinero-max"
          label="Meta máx. $"
          tipo="number"
          min={0}
          className="w-40"
          value={filtros.dinero_max ?? ''}
          onChange={(v) => cambiar({ dinero_max: v })}
        />
      </BarraFiltros>

      <Card className="py-0">
        <EstadoTabla
          cargando={isFetching && !hoja}
          vacio={total === 0}
          icono={<TargetIcon />}
          titulo="Sin metas para este filtro"
          descripcion="Sin meta no hay cumplimiento que medir: cambia los filtros o carga el objetivo de cada producto."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Periodo</TableHead>
                <TableHead>Punto de venta</TableHead>
                <TableHead className="hidden xl:table-cell">Regional</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead className="hidden lg:table-cell">Marca</TableHead>
                <TableHead className="text-right">Unidades</TableHead>
                <TableHead className="text-right">Dinero</TableHead>
                {fuente.conPuntos && (
                  <TableHead className="hidden text-right md:table-cell">Puntos</TableHead>
                )}
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metas.map((meta) => (
                <TableRow key={meta.idMeta}>
                  <TableCell className="whitespace-nowrap font-medium">
                    {formatoFecha(meta.fechaMeta)}
                  </TableCell>
                  <TableCell>{meta.nombrePdv}</TableCell>
                  <TableCell className="hidden text-muted-foreground xl:table-cell">
                    {meta.regional || 'Sin dato'}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{meta.nombreProducto}</span>
                      <span className="text-xs text-muted-foreground lg:hidden">{meta.marca}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <Badge variant="secondary">{meta.marca}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatoNumero(meta.metaCantidad)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatoMoneda(meta.metaDinero)}
                  </TableCell>
                  {fuente.conPuntos && (
                    <TableCell className="hidden text-right tabular-nums text-muted-foreground md:table-cell">
                      {formatoNumero(meta.metaPuntos)}
                    </TableCell>
                  )}
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Editar"
                        onClick={() => {
                          setEditando(meta);
                          setAbierto(true);
                        }}
                      >
                        <PencilIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Eliminar"
                        onClick={() => setPorBorrar(meta)}
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

      <MetaDialog abierto={abierto} onOpenChange={setAbierto} meta={editando} />

      <ConfirmarBorrado
        abierto={vaciarAbierto}
        onOpenChange={setVaciarAbierto}
        titulo="¿Eliminar TODOS los registros?"
        descripcion="Se borrarán todas las metas y el tablero dejará de medir cumplimiento. Esta acción no se puede deshacer."
        onConfirmar={() => {
          vaciar.mutate(undefined);
          setVaciarAbierto(false);
        }}
      />

      <ConfirmarBorrado
        abierto={!!porBorrar}
        onOpenChange={(v) => !v && setPorBorrar(null)}
        titulo="¿Eliminar la meta?"
        descripcion={`«${porBorrar?.nombreProducto}» en «${porBorrar?.nombrePdv}» dejará de tener objetivo y no se le medirá cumplimiento.`}
        onConfirmar={() => {
          if (porBorrar) eliminar.mutate(porBorrar.idMeta);
          setPorBorrar(null);
        }}
      />
    </div>
  );
}

/** Por defecto, el primer día del mes en curso: una meta es de un periodo. */
const inicioDeMes = () => {
  const hoy = new Date();
  return new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
};

const vacio = (): MetaPayload => ({
  idProducto: '',
  idPuntoVenta: '',
  fechaMeta: inicioDeMes(),
  metaCantidad: 1,
});

function MetaDialog({
  abierto,
  onOpenChange,
  meta,
}: {
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
  meta: MetaComercial | null;
}) {
  const editando = !!meta;
  const fuente = useFuente();
  const recursos = fuente.recursos ?? biTradeApi;
  const { data: productos = [] } = useProductos();
  const { data: puntos = [] } = usePuntosVenta();
  const [datos, setDatos] = useState<MetaPayload>(vacio);

  const guardar = useBiTradeMutation(
    (payload: Partial<MetaPayload>) =>
      editando ? recursos.metas.update(meta.idMeta, payload) : recursos.metas.create(payload),
    editando ? 'Meta actualizada' : 'Meta creada',
  );

  useEffect(() => {
    if (!abierto) return;
    setDatos(
      meta
        ? {
            idProducto: meta.idProducto,
            idPuntoVenta: meta.idPuntoVenta,
            fechaMeta: meta.fechaMeta,
            metaCantidad: meta.metaCantidad,
          }
        : vacio(),
    );
  }, [abierto, meta]);

  const producto = productos.find((p) => p.idProducto === datos.idProducto);

  // Lo mismo que calcula el backend, para mostrarlo antes de guardar.
  const enDinero =
    producto?.precioVentaColtrade == null ? null : datos.metaCantidad * producto.precioVentaColtrade;
  const enPuntos = producto ? datos.metaCantidad * (producto.puntaje ?? 0) : 0;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    guardar.mutate(datos, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editando ? 'Editar meta' : 'Nueva meta'}</DialogTitle>
          <DialogDescription>
            Solo puede haber una meta por producto y punto de venta.
          </DialogDescription>
        </DialogHeader>

        <form id="meta-form" onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <CampoSelect
              id="meta-producto"
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
              id="meta-pdv"
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

            <Field>
              <FieldLabel htmlFor="meta-fecha">Periodo de la meta</FieldLabel>
              <Input
                id="meta-fecha"
                type="date"
                value={datos.fechaMeta}
                onChange={(e) => setDatos({ ...datos, fechaMeta: e.target.value })}
                required
              />
              <FieldDescription>
                Contra esta fecha se mide el cumplimiento. Cambiándola se carga la meta de otro
                periodo sin pisar la anterior.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="meta-cantidad">Meta de unidades</FieldLabel>
              <Input
                id="meta-cantidad"
                type="number"
                min={1}
                step={1}
                value={datos.metaCantidad}
                onChange={(e) => setDatos({ ...datos, metaCantidad: Number(e.target.value) })}
                required
              />
              <FieldDescription>
                {fuente.conPuntos
                  ? 'Es lo único que se guarda. El dinero y los puntos se calculan con el precio y el puntaje del producto, igual que el total de una venta.'
                  : 'Es lo único que se guarda. El dinero se calcula con el precio Coltrade del producto, igual que el total de una venta.'}
              </FieldDescription>
            </Field>

            {producto && (
              <Field>
                <FieldLabel>Equivale a</FieldLabel>
                <div className={cn('grid gap-3', fuente.conPuntos && 'sm:grid-cols-2')}>
                  <div className="flex flex-col gap-0.5 rounded-lg border px-3 py-2">
                    <span className="text-xs text-muted-foreground">Meta en dinero</span>
                    <span className="text-lg font-semibold tabular-nums">
                      {formatoMoneda(enDinero)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatoNumero(datos.metaCantidad)} ×{' '}
                      {formatoMoneda(producto.precioVentaColtrade)}
                    </span>
                  </div>
                  {fuente.conPuntos && (
                    <div className="flex flex-col gap-0.5 rounded-lg border px-3 py-2">
                      <span className="text-xs text-muted-foreground">Meta en puntos</span>
                      <span className="text-lg font-semibold tabular-nums">
                        {formatoNumero(enPuntos)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {producto.puntaje
                          ? `${formatoNumero(datos.metaCantidad)} × ${formatoNumero(producto.puntaje)}`
                          : 'El producto no tiene puntaje'}
                      </span>
                    </div>
                  )}
                </div>
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
            form="meta-form"
            disabled={
              guardar.isPending || !datos.idProducto || !datos.idPuntoVenta || !datos.fechaMeta
            }
          >
            {guardar.isPending && <Spinner data-icon="inline-start" />}
            {editando ? 'Guardar' : 'Crear'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
