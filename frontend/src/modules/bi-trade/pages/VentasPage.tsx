import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeftIcon,
  PencilIcon,
  PlusIcon,
  ReceiptTextIcon,
  SearchIcon,
  Trash2Icon,
} from 'lucide-react';
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
import { Encabezado, EstadoTabla } from '@/shared/components/layout';
import { formatoFecha, formatoMoneda, formatoNumero } from '@/shared/lib/formato';
import { biTradeApi, type Venta, type VentaPayload } from '../api';
import { useBiTradeMutation, useProductos, usePuntosVenta, useVentas } from '../hooks';
import { CampoSelect } from '../components/CampoSelect';

const BASE = '/inicio/bi-trade/claro';

export default function VentasPage() {
  const [buscar, setBuscar] = useState('');
  const { data: ventas = [], isLoading } = useVentas({ search: buscar || undefined });
  const [editando, setEditando] = useState<Venta | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [porBorrar, setPorBorrar] = useState<Venta | null>(null);

  const eliminar = useBiTradeMutation(
    (id: number) => biTradeApi.ventas.remove(id),
    'Venta eliminada',
  );

  const totalUnidades = ventas.reduce((suma, venta) => suma + venta.cantidadVendida, 0);
  const totalIngresos = ventas.reduce((suma, venta) => suma + venta.totalColtrade, 0);

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="Ventas"
        descripcion="Qué producto se vendió, en qué punto, cuándo y cuántas unidades."
      >
        <Button variant="outline" render={<Link to={BASE} />}>
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
      </Encabezado>

      <div className="relative max-w-md">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por producto o punto de venta…"
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
        />
      </div>

      <Card className="py-0">
        <EstadoTabla
          cargando={isLoading}
          vacio={ventas.length === 0}
          icono={<ReceiptTextIcon />}
          titulo="Sin ventas registradas"
          descripcion="Registra la primera venta para que el tablero tenga qué mostrar."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead className="hidden lg:table-cell">Marca</TableHead>
                <TableHead>Punto de venta</TableHead>
                <TableHead className="hidden xl:table-cell">Regional</TableHead>
                <TableHead>Cantidad</TableHead>
                <TableHead>Total</TableHead>
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
                  <TableCell className="tabular-nums">
                    {formatoNumero(venta.cantidadVendida)}
                  </TableCell>
                  <TableCell className="tabular-nums">
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

      <p className="text-xs text-muted-foreground">
        {ventas.length} venta{ventas.length === 1 ? '' : 's'} · {formatoNumero(totalUnidades)}{' '}
        unidades · {formatoMoneda(totalIngresos)}
      </p>

      <VentaDialog abierto={abierto} onOpenChange={setAbierto} venta={editando} />

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
  const { data: productos = [] } = useProductos();
  const { data: puntos = [] } = usePuntosVenta();
  const [datos, setDatos] = useState<VentaPayload>(vacio);

  const guardar = useBiTradeMutation(
    (payload: Partial<VentaPayload>) =>
      editando
        ? biTradeApi.ventas.update(venta.idVenta, payload)
        : biTradeApi.ventas.create(payload),
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
  const total = productoElegido
    ? productoElegido.precioVentaColtrade * (datos.cantidadVendida || 0)
    : 0;

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
