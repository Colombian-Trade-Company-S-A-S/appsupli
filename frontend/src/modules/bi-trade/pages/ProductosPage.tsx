import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeftIcon,
  PackageIcon,
  PencilIcon,
  PlusIcon,
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
import { formatoMoneda, formatoNumero } from '@/shared/lib/formato';
import { biTradeApi, type Producto, type ProductoPayload } from '../api';
import { useBiTradeMutation, useProductos } from '../hooks';

const BASE = '/inicio/bi-trade/claro';
const PRECIO_MAXIMO = 100_000_000;

export default function ProductosPage() {
  const [buscar, setBuscar] = useState('');
  const { data: productos = [], isLoading } = useProductos({ search: buscar || undefined });
  const [editando, setEditando] = useState<Producto | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [porBorrar, setPorBorrar] = useState<Producto | null>(null);

  const eliminar = useBiTradeMutation(
    (id: string) => biTradeApi.productos.remove(id),
    'Producto eliminado',
  );

  return (
    <div className="flex flex-col gap-6">
      <Encabezado titulo="Productos" descripcion="Catálogo con su precio en Claro y en Coltrade.">
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
          Nuevo producto
        </Button>
      </Encabezado>

      <div className="relative max-w-md">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por código, nombre o marca…"
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
        />
      </div>

      <Card className="py-0">
        <EstadoTabla
          cargando={isLoading}
          vacio={productos.length === 0}
          icono={<PackageIcon />}
          titulo="Sin productos"
          descripcion="Carga el catálogo para poder registrar ventas."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Marca</TableHead>
                <TableHead className="hidden lg:table-cell">Precio Claro</TableHead>
                <TableHead>Precio Coltrade</TableHead>
                <TableHead className="hidden md:table-cell">Puntaje</TableHead>
                <TableHead className="hidden md:table-cell">Ventas</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productos.map((producto) => (
                <TableRow key={producto.idProducto}>
                  <TableCell className="font-medium">{producto.idProducto}</TableCell>
                  <TableCell>{producto.nombreProducto}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{producto.marca}</Badge>
                  </TableCell>
                  <TableCell className="hidden tabular-nums text-muted-foreground lg:table-cell">
                    {formatoMoneda(producto.precioVentaClaro)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatoMoneda(producto.precioVentaColtrade)}
                  </TableCell>
                  <TableCell className="hidden tabular-nums text-muted-foreground md:table-cell">
                    {producto.puntaje ?? '—'}
                  </TableCell>
                  <TableCell className="hidden tabular-nums md:table-cell">
                    {formatoNumero(producto.ventasCount)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Editar"
                        onClick={() => {
                          setEditando(producto);
                          setAbierto(true);
                        }}
                      >
                        <PencilIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Eliminar"
                        onClick={() => setPorBorrar(producto)}
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
        {productos.length} producto{productos.length === 1 ? '' : 's'}
      </p>

      <ProductoDialog abierto={abierto} onOpenChange={setAbierto} producto={editando} />

      <ConfirmarBorrado
        abierto={!!porBorrar}
        onOpenChange={(v) => !v && setPorBorrar(null)}
        titulo="¿Eliminar el producto?"
        descripcion={`«${porBorrar?.nombreProducto}» solo se puede eliminar si no tiene ventas registradas.`}
        onConfirmar={() => {
          if (porBorrar) eliminar.mutate(porBorrar.idProducto);
          setPorBorrar(null);
        }}
      />
    </div>
  );
}

const VACIO: ProductoPayload = {
  idProducto: '',
  nombreProducto: '',
  marca: '',
  precioVentaClaro: 0,
  precioVentaColtrade: 0,
  puntaje: null,
};

function ProductoDialog({
  abierto,
  onOpenChange,
  producto,
}: {
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
  producto: Producto | null;
}) {
  const editando = !!producto;
  const [datos, setDatos] = useState<ProductoPayload>(VACIO);

  const guardar = useBiTradeMutation(
    (payload: Partial<ProductoPayload>) =>
      editando
        ? biTradeApi.productos.update(producto.idProducto, payload)
        : biTradeApi.productos.create(payload),
    editando ? 'Producto actualizado' : 'Producto creado',
  );

  useEffect(() => {
    if (!abierto) return;
    setDatos(
      producto
        ? {
            idProducto: producto.idProducto,
            nombreProducto: producto.nombreProducto,
            marca: producto.marca,
            precioVentaClaro: producto.precioVentaClaro,
            precioVentaColtrade: producto.precioVentaColtrade,
            puntaje: producto.puntaje,
          }
        : VACIO,
    );
  }, [abierto, producto]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const { idProducto, ...resto } = datos;
    guardar.mutate(editando ? resto : { idProducto, ...resto }, {
      onSuccess: () => onOpenChange(false),
    });
  };

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editando ? 'Editar producto' : 'Nuevo producto'}</DialogTitle>
          <DialogDescription>
            Los precios van en pesos, sin decimales y hasta {formatoMoneda(PRECIO_MAXIMO)}.
          </DialogDescription>
        </DialogHeader>

        <form id="producto-form" onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="prod-codigo">Código</FieldLabel>
              <Input
                id="prod-codigo"
                maxLength={60}
                placeholder="SKU-1001"
                value={datos.idProducto}
                onChange={(e) => setDatos({ ...datos, idProducto: e.target.value })}
                disabled={editando}
                required
              />
              <FieldDescription>
                {editando
                  ? 'El código identifica al producto y no se puede cambiar.'
                  : 'Hasta 60 caracteres. Debe ser único.'}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="prod-nombre">Nombre</FieldLabel>
              <Input
                id="prod-nombre"
                maxLength={60}
                value={datos.nombreProducto}
                onChange={(e) => setDatos({ ...datos, nombreProducto: e.target.value })}
                required
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="prod-marca">Marca</FieldLabel>
              <Input
                id="prod-marca"
                maxLength={60}
                value={datos.marca}
                onChange={(e) => setDatos({ ...datos, marca: e.target.value })}
                required
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="prod-claro">Precio de venta Claro</FieldLabel>
                <Input
                  id="prod-claro"
                  type="number"
                  min={0}
                  max={PRECIO_MAXIMO}
                  step={1}
                  value={datos.precioVentaClaro}
                  onChange={(e) => setDatos({ ...datos, precioVentaClaro: Number(e.target.value) })}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="prod-coltrade">Precio de venta Coltrade</FieldLabel>
                <Input
                  id="prod-coltrade"
                  type="number"
                  min={0}
                  max={PRECIO_MAXIMO}
                  step={1}
                  value={datos.precioVentaColtrade}
                  onChange={(e) =>
                    setDatos({ ...datos, precioVentaColtrade: Number(e.target.value) })
                  }
                  required
                />
                <FieldDescription>Con este precio se calculan los ingresos.</FieldDescription>
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="prod-puntaje">Puntaje</FieldLabel>
              <Input
                id="prod-puntaje"
                type="number"
                step={1}
                value={datos.puntaje ?? ''}
                onChange={(e) =>
                  setDatos({
                    ...datos,
                    puntaje: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              />
              <FieldDescription>Opcional.</FieldDescription>
            </Field>
          </FieldGroup>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="producto-form" disabled={guardar.isPending}>
            {guardar.isPending && <Spinner data-icon="inline-start" />}
            {editando ? 'Guardar' : 'Crear'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
