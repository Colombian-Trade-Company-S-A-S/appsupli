import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftIcon, BoxesIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
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
import { formatoMoneda, formatoMonedaCorta, formatoNumero } from '@/shared/lib/formato';
import {
  biTradeApi,
  type Inventario,
  type InventarioPayload,
  type ResumenInventario,
} from '../api';
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

const POR_PAGINA = 15;

/** Los filtros del listado. Las llaves son los parámetros que espera la API. */
interface FiltrosInventario {
  search?: string;
  id_punto_venta?: string;
  id_producto?: string;
  regional?: string;
  marca?: string;
  materiales?: string;
  cantidad_min?: string;
  cantidad_max?: string;
  agotado?: string;
}

export default function InventarioPage() {
  const fuente = useFuente();
  const recursos = fuente.recursos ?? biTradeApi;
  const [filtros, setFiltros] = useState<FiltrosInventario>({});
  const [pagina, setPagina] = useState(1);
  const [editando, setEditando] = useState<Inventario | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [vaciarAbierto, setVaciarAbierto] = useState(false);
  const [porBorrar, setPorBorrar] = useState<Inventario | null>(null);

  const { data: opciones } = useOpciones();
  const { data: productos = [] } = useProductos();
  const { data: puntos = [] } = usePuntosVenta();

  const consulta = soloConValor(filtros);
  // Las tarjetas y la exportación comparten el filtro pero ignoran la página:
  // suman y descargan todo lo filtrado, no las 15 filas visibles.
  const { data: hoja, isFetching } = useListado<Inventario>('inventario', {
    ...consulta,
    page: pagina,
  });
  const { data: resumen } = useResumen<ResumenInventario>('inventario', consulta);

  const registros = hoja?.items ?? [];
  const total = hoja?.total ?? 0;

  /** Cambiar un filtro vuelve a la página 1: la 7 podría no existir ya. */
  const cambiar = (parche: Partial<FiltrosInventario>) => {
    setFiltros({ ...filtros, ...parche });
    setPagina(1);
  };

  const eliminar = useBiTradeMutation(
    (id: number) => recursos.inventario.remove(id),
    'Registro de inventario eliminado',
  );
  const vaciar = useBiTradeMutation(
    () => recursos.inventario.removeAll(),
    (datos) => datos.message,
  );

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="Inventario"
        descripcion="Existencias actuales: una fila por producto en cada punto de venta."
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
          Nuevo registro
        </Button>
        <BotonesExcel recurso="inventario" filtrosExport={consulta} />
        <Button
          variant="destructive"
          disabled={total === 0 || vaciar.isPending}
          onClick={() => setVaciarAbierto(true)}
        >
          <Trash2Icon data-icon="inline-start" />
          Eliminar todo
        </Button>
      </Encabezado>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Registros"
          value={formatoNumero(resumen?.registros ?? 0)}
          hint={`${formatoNumero(resumen?.productos ?? 0)} productos · ${formatoNumero(
            resumen?.puntosVenta ?? 0,
          )} puntos de venta`}
        />
        <Kpi
          label="Unidades en stock"
          value={formatoNumero(resumen?.unidades ?? 0)}
          hint="Suma de las existencias"
        />
        <Kpi
          label="Valorizado"
          value={formatoMonedaCorta(resumen?.valorizadoTotal ?? 0)}
          hint={`${formatoMoneda(resumen?.valorizadoTotal ?? 0)} a precio Coltrade`}
        />
        <Kpi
          label="Agotados"
          value={formatoNumero(resumen?.agotados ?? 0)}
          hint="Registros con existencias en cero"
        />
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
        <CampoSelect
          id="filtro-materiales"
          label="Materiales"
          placeholder="Todos"
          value={filtros.materiales ?? ''}
          onChange={(v) => cambiar({ materiales: v })}
          opciones={(opciones?.materiales ?? []).map((m) => ({ value: m.value, label: m.label }))}
        />
        <CampoSelect
          id="filtro-agotado"
          label="Existencias"
          placeholder="Con y sin stock"
          value={filtros.agotado ?? ''}
          onChange={(v) => cambiar({ agotado: v })}
          opciones={[
            { value: 'true', label: 'Solo agotados' },
            { value: 'false', label: 'Solo con stock' },
          ]}
        />
        <CampoFiltro
          id="filtro-cantidad-min"
          label="Stock mín."
          tipo="number"
          min={0}
          value={filtros.cantidad_min ?? ''}
          onChange={(v) => cambiar({ cantidad_min: v })}
        />
        <CampoFiltro
          id="filtro-cantidad-max"
          label="Stock máx."
          tipo="number"
          min={0}
          value={filtros.cantidad_max ?? ''}
          onChange={(v) => cambiar({ cantidad_max: v })}
        />
      </BarraFiltros>

      <Card className="py-0">
        <EstadoTabla
          cargando={isFetching && !hoja}
          vacio={total === 0}
          icono={<BoxesIcon />}
          titulo="Sin inventario para este filtro"
          descripcion="Cambia o limpia los filtros, o registra las existencias de cada producto."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Punto de venta</TableHead>
                <TableHead className="hidden xl:table-cell">Regional</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead className="hidden lg:table-cell">Marca</TableHead>
                <TableHead className="text-right">Existencias</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {registros.map((fila) => (
                <TableRow key={fila.idInventario}>
                  <TableCell className="font-medium">{fila.nombrePdv}</TableCell>
                  <TableCell className="hidden text-muted-foreground xl:table-cell">
                    {fila.regional || 'Sin dato'}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{fila.nombreProducto}</span>
                      <span className="text-xs text-muted-foreground lg:hidden">{fila.marca}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <Badge variant="secondary">{fila.marca}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {fila.cantidadInventario === 0 ? (
                      <Badge variant="destructive">Agotado</Badge>
                    ) : (
                      <span className="tabular-nums">{formatoNumero(fila.cantidadInventario)}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Editar"
                        onClick={() => {
                          setEditando(fila);
                          setAbierto(true);
                        }}
                      >
                        <PencilIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Eliminar"
                        onClick={() => setPorBorrar(fila)}
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

      <InventarioDialog abierto={abierto} onOpenChange={setAbierto} registro={editando} />

      <ConfirmarBorrado
        abierto={vaciarAbierto}
        onOpenChange={setVaciarAbierto}
        titulo="¿Eliminar TODOS los registros?"
        descripcion="Se borrarán las existencias de todos los productos en todos los puntos de venta. Esta acción no se puede deshacer."
        onConfirmar={() => {
          vaciar.mutate(undefined);
          setVaciarAbierto(false);
        }}
      />

      <ConfirmarBorrado
        abierto={!!porBorrar}
        onOpenChange={(v) => !v && setPorBorrar(null)}
        titulo="¿Eliminar el registro de inventario?"
        descripcion={`Se borrarán las existencias de «${porBorrar?.nombreProducto}» en «${porBorrar?.nombrePdv}».`}
        onConfirmar={() => {
          if (porBorrar) eliminar.mutate(porBorrar.idInventario);
          setPorBorrar(null);
        }}
      />
    </div>
  );
}

const VACIO: InventarioPayload = {
  idProducto: '',
  idPuntoVenta: '',
  cantidadInventario: 0,
};

function InventarioDialog({
  abierto,
  onOpenChange,
  registro,
}: {
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
  registro: Inventario | null;
}) {
  const editando = !!registro;
  const recursos = useFuente().recursos ?? biTradeApi;
  const { data: productos = [] } = useProductos();
  const { data: puntos = [] } = usePuntosVenta();
  const [datos, setDatos] = useState<InventarioPayload>(VACIO);

  const guardar = useBiTradeMutation(
    (payload: Partial<InventarioPayload>) =>
      editando
        ? recursos.inventario.update(registro.idInventario, payload)
        : recursos.inventario.create(payload),
    editando ? 'Inventario actualizado' : 'Inventario registrado',
  );

  useEffect(() => {
    if (!abierto) return;
    setDatos(
      registro
        ? {
            idProducto: registro.idProducto,
            idPuntoVenta: registro.idPuntoVenta,
            cantidadInventario: registro.cantidadInventario,
          }
        : VACIO,
    );
  }, [abierto, registro]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    guardar.mutate(datos, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editando ? 'Editar inventario' : 'Nuevo registro de inventario'}
          </DialogTitle>
          <DialogDescription>
            Solo puede haber un registro por producto y punto de venta.
          </DialogDescription>
        </DialogHeader>

        <form id="inventario-form" onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <CampoSelect
              id="inv-producto"
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
              id="inv-pdv"
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
              <FieldLabel htmlFor="inv-cantidad">Cantidad en inventario</FieldLabel>
              <Input
                id="inv-cantidad"
                type="number"
                min={0}
                step={1}
                value={datos.cantidadInventario}
                onChange={(e) => setDatos({ ...datos, cantidadInventario: Number(e.target.value) })}
                required
              />
              <FieldDescription>Cero significa agotado.</FieldDescription>
            </Field>
          </FieldGroup>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="inventario-form"
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
