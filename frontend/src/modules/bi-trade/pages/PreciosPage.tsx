import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeftIcon,
  CalendarRangeIcon,
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
import { biTradeApi, type PrecioPeriodo, type PrecioPeriodoPayload } from '../api';
import { BotonesExcel } from '../components/BotonesExcel';
import { CampoSelect } from '../components/CampoSelect';
import { useFuente } from '../fuente';
import { useBiTradeMutation, usePrecios, useProductos } from '../hooks';

const PRECIO_MAXIMO = 100_000_000;

/** `2026-10-01` → `1 oct 2026`, sin pasar por UTC: en Colombia sería el día anterior. */
const fechaCorta = (fecha: string) =>
  new Date(`${fecha}T00:00:00`).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const hoyIso = () => {
  const hoy = new Date();
  const desfase = hoy.getTimezoneOffset() * 60000;
  return new Date(hoy.getTime() - desfase).toISOString().slice(0, 10);
};

/** Si el periodo ya pasó, rige hoy o todavía no empieza. */
function Estado({ precio }: { precio: PrecioPeriodo }) {
  const hoy = hoyIso();
  if (precio.desde > hoy) return <Badge variant="outline">Próximo</Badge>;
  if (precio.hasta && precio.hasta < hoy) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Pasado
      </Badge>
    );
  }
  return <Badge variant="success">Vigente</Badge>;
}

/**
 * Los precios Coltrade por periodo de un canal.
 *
 * Un producto cambia de precio de un mes a otro, o a mitad de mes: cada
 * periodo dice desde y hasta cuándo valió. Las ventas se valoran con el precio
 * de su día y las metas con el promedio del mes por días hábiles; los días que
 * ningún periodo cubre valen el precio base del producto.
 */
export default function PreciosPage() {
  const fuente = useFuente();
  const recursos = fuente.recursos ?? biTradeApi;
  const [parametros] = useSearchParams();
  const [buscar, setBuscar] = useState(parametros.get('producto') ?? '');
  const filtros = { search: buscar.trim() || undefined };
  const { data: precios = [], isLoading } = usePrecios(filtros);
  const [editando, setEditando] = useState<PrecioPeriodo | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [porBorrar, setPorBorrar] = useState<PrecioPeriodo | null>(null);

  const borrar = useBiTradeMutation(
    (id: number) => recursos.precios.remove(id),
    'Precio eliminado',
  );

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="Precios por periodo"
        descripcion="El precio Coltrade de cada producto en el tiempo. Las ventas valen el precio de su día; las metas, el promedio del mes por días hábiles. Los días sin precio registrado valen el precio base del producto."
      >
        <Button variant="outline" render={<Link to={`${fuente.base}/productos`} />}>
          <ArrowLeftIcon data-icon="inline-start" />
          Productos
        </Button>
        <Button
          onClick={() => {
            setEditando(null);
            setAbierto(true);
          }}
        >
          <PlusIcon data-icon="inline-start" />
          Nuevo precio
        </Button>
        <BotonesExcel recurso="precios" filtrosExport={filtros} />
      </Encabezado>

      <div className="relative max-w-md">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por código o nombre del producto…"
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
        />
      </div>

      <Card className="py-0">
        <EstadoTabla
          cargando={isLoading}
          vacio={precios.length === 0}
          icono={<CalendarRangeIcon />}
          titulo="Sin precios por periodo"
          descripcion="Mientras no haya, todo se valora con el precio base de cada producto."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>Desde</TableHead>
                <TableHead>Hasta</TableHead>
                <TableHead className="text-right">Precio Coltrade</TableHead>
                <TableHead className="hidden sm:table-cell">Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {precios.map((precio) => (
                <TableRow key={precio.idPrecio}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{precio.nombreProducto}</span>
                      <span className="text-xs text-muted-foreground">{precio.idProducto}</span>
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums">{fechaCorta(precio.desde)}</TableCell>
                  <TableCell className="tabular-nums">
                    {precio.hasta ? (
                      fechaCorta(precio.hasta)
                    ) : (
                      <span className="text-muted-foreground">En adelante</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatoMoneda(precio.precioVentaColtrade)}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Estado precio={precio} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Editar"
                        onClick={() => {
                          setEditando(precio);
                          setAbierto(true);
                        }}
                      >
                        <PencilIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Eliminar"
                        onClick={() => setPorBorrar(precio)}
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
        {formatoNumero(precios.length)} periodo{precios.length === 1 ? '' : 's'}
      </p>

      <PrecioDialog
        abierto={abierto}
        onOpenChange={setAbierto}
        precio={editando}
        productoInicial={parametros.get('producto') ?? ''}
      />

      <ConfirmarBorrado
        abierto={!!porBorrar}
        onOpenChange={(v) => !v && setPorBorrar(null)}
        titulo="¿Eliminar este precio?"
        descripcion={
          porBorrar
            ? `Los días de ${fechaCorta(porBorrar.desde)} ${
                porBorrar.hasta ? `a ${fechaCorta(porBorrar.hasta)}` : 'en adelante'
              } volverán a valer el precio base de «${porBorrar.nombreProducto}», y las ventas y metas de esas fechas se recalculan.`
            : ''
        }
        onConfirmar={() => {
          if (porBorrar) borrar.mutate(porBorrar.idPrecio);
          setPorBorrar(null);
        }}
      />
    </div>
  );
}

const vacio = (idProducto: string): PrecioPeriodoPayload => ({
  idProducto,
  desde: '',
  hasta: null,
  precioVentaColtrade: 0,
});

function PrecioDialog({
  abierto,
  onOpenChange,
  precio,
  productoInicial,
}: {
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
  precio: PrecioPeriodo | null;
  productoInicial: string;
}) {
  const editando = !!precio;
  const fuente = useFuente();
  const recursos = fuente.recursos ?? biTradeApi;
  const { data: productos = [] } = useProductos();
  const [datos, setDatos] = useState<PrecioPeriodoPayload>(vacio(''));

  const guardar = useBiTradeMutation(
    (payload: PrecioPeriodoPayload) =>
      editando
        ? recursos.precios.update(precio.idPrecio, payload)
        : recursos.precios.create(payload),
    editando ? 'Precio actualizado' : 'Precio registrado',
  );

  useEffect(() => {
    if (!abierto) return;
    setDatos(
      precio
        ? {
            idProducto: precio.idProducto,
            desde: precio.desde,
            hasta: precio.hasta,
            precioVentaColtrade: precio.precioVentaColtrade,
          }
        : vacio(productoInicial),
    );
  }, [abierto, precio, productoInicial]);

  const opciones = useMemo(
    () =>
      productos.map((p) => ({
        value: p.idProducto,
        label: `${p.idProducto} · ${p.nombreProducto}`,
      })),
    [productos],
  );
  const producto = productos.find((p) => p.idProducto === datos.idProducto);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    guardar.mutate(datos, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editando ? 'Editar precio' : 'Nuevo precio'}</DialogTitle>
          <DialogDescription>
            Si el precio cambia a mitad de mes, registra dos periodos: uno hasta el día del cambio y
            otro desde el siguiente. Los periodos de un producto no se pueden pisar.
          </DialogDescription>
        </DialogHeader>

        <form id="precio-form" onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <div className="flex flex-col gap-1.5">
              <CampoSelect
                id="precio-producto"
                label="Producto"
                placeholder="Elige el producto"
                className="w-full min-w-0"
                value={datos.idProducto}
                onChange={(idProducto) => setDatos({ ...datos, idProducto })}
                opciones={opciones}
                incluirTodas={false}
              />
              {producto && (
                <p className="text-xs text-muted-foreground">
                  Precio base: {formatoMoneda(producto.precioVentaColtrade)} · hoy:{' '}
                  {formatoMoneda(producto.precioHoy)}
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="precio-desde">Desde</FieldLabel>
                <Input
                  id="precio-desde"
                  type="date"
                  value={datos.desde}
                  onChange={(e) => setDatos({ ...datos, desde: e.target.value })}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="precio-hasta">Hasta</FieldLabel>
                <Input
                  id="precio-hasta"
                  type="date"
                  value={datos.hasta ?? ''}
                  min={datos.desde || undefined}
                  onChange={(e) => setDatos({ ...datos, hasta: e.target.value || null })}
                />
                <FieldDescription>Vacío: sigue vigente.</FieldDescription>
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="precio-valor">Precio Coltrade</FieldLabel>
              <Input
                id="precio-valor"
                type="number"
                min={0}
                max={PRECIO_MAXIMO}
                step={1}
                value={datos.precioVentaColtrade || ''}
                onChange={(e) =>
                  setDatos({ ...datos, precioVentaColtrade: Number(e.target.value) || 0 })
                }
                required
              />
              <FieldDescription>En pesos, sin decimales.</FieldDescription>
            </Field>
          </FieldGroup>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="precio-form" disabled={guardar.isPending}>
            {guardar.isPending && <Spinner data-icon="inline-start" />}
            {editando ? 'Guardar' : 'Registrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
