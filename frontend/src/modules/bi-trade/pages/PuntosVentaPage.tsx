import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeftIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  StoreIcon,
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
import { formatoNumero } from '@/shared/lib/formato';
import { biTradeApi, type PuntoVenta, type PuntoVentaPayload } from '../api';
import { useBiTradeMutation, useOpciones, usePuntosVenta } from '../hooks';
import { CampoSelect } from '../components/CampoSelect';

const BASE = '/inicio/bi-trade/claro';

export default function PuntosVentaPage() {
  const [buscar, setBuscar] = useState('');
  const { data: puntos = [], isLoading } = usePuntosVenta({ search: buscar || undefined });
  const [editando, setEditando] = useState<PuntoVenta | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [porBorrar, setPorBorrar] = useState<PuntoVenta | null>(null);

  const eliminar = useBiTradeMutation(
    (id: string) => biTradeApi.puntosVenta.remove(id),
    'Punto de venta eliminado',
  );

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="Puntos de venta"
        descripcion="El código lo define el negocio: es la llave con la que llegan los datos."
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
          Nuevo punto de venta
        </Button>
      </Encabezado>

      <div className="relative max-w-md">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por código o nombre…"
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
        />
      </div>

      <Card className="py-0">
        <EstadoTabla
          cargando={isLoading}
          vacio={puntos.length === 0}
          icono={<StoreIcon />}
          titulo="Sin puntos de venta"
          descripcion="Crea el primero para poder registrar ventas."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Regional</TableHead>
                <TableHead className="hidden md:table-cell">Materiales</TableHead>
                <TableHead>Ventas</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {puntos.map((punto) => (
                <TableRow key={punto.idPuntoVenta}>
                  <TableCell className="font-medium">{punto.idPuntoVenta}</TableCell>
                  <TableCell>{punto.nombrePdv}</TableCell>
                  <TableCell>
                    {punto.regional ? (
                      <Badge variant="secondary">{punto.regional}</Badge>
                    ) : (
                      <span className="text-muted-foreground">Sin dato</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {punto.materiales ?? 'Sin dato'}
                  </TableCell>
                  <TableCell className="tabular-nums">{formatoNumero(punto.ventasCount)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Editar"
                        onClick={() => {
                          setEditando(punto);
                          setAbierto(true);
                        }}
                      >
                        <PencilIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Eliminar"
                        onClick={() => setPorBorrar(punto)}
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
        {puntos.length} punto{puntos.length === 1 ? '' : 's'} de venta
      </p>

      <PuntoVentaDialog abierto={abierto} onOpenChange={setAbierto} punto={editando} />

      <ConfirmarBorrado
        abierto={!!porBorrar}
        onOpenChange={(v) => !v && setPorBorrar(null)}
        titulo="¿Eliminar el punto de venta?"
        descripcion={`«${porBorrar?.nombrePdv}» solo se puede eliminar si no tiene ventas registradas.`}
        onConfirmar={() => {
          if (porBorrar) eliminar.mutate(porBorrar.idPuntoVenta);
          setPorBorrar(null);
        }}
      />
    </div>
  );
}

const VACIO: PuntoVentaPayload = {
  idPuntoVenta: '',
  nombrePdv: '',
  regional: null,
  materiales: null,
};

function PuntoVentaDialog({
  abierto,
  onOpenChange,
  punto,
}: {
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
  punto: PuntoVenta | null;
}) {
  const editando = !!punto;
  const { data: opciones } = useOpciones();
  const [datos, setDatos] = useState<PuntoVentaPayload>(VACIO);

  const guardar = useBiTradeMutation(
    (payload: Partial<PuntoVentaPayload>) =>
      editando
        ? biTradeApi.puntosVenta.update(punto.idPuntoVenta, payload)
        : biTradeApi.puntosVenta.create(payload),
    editando ? 'Punto de venta actualizado' : 'Punto de venta creado',
  );

  useEffect(() => {
    if (!abierto) return;
    setDatos(
      punto
        ? {
            idPuntoVenta: punto.idPuntoVenta,
            nombrePdv: punto.nombrePdv,
            regional: punto.regional,
            materiales: punto.materiales,
          }
        : VACIO,
    );
  }, [abierto, punto]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    // Al editar no se manda la PK: el código de un punto no se cambia.
    const { idPuntoVenta, ...resto } = datos;
    guardar.mutate(editando ? resto : { idPuntoVenta, ...resto }, {
      onSuccess: () => onOpenChange(false),
    });
  };

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editando ? 'Editar punto de venta' : 'Nuevo punto de venta'}</DialogTitle>
          <DialogDescription>
            Regional y materiales pueden quedar vacíos si todavía no se conocen.
          </DialogDescription>
        </DialogHeader>

        <form id="pdv-form" onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="pdv-codigo">Código</FieldLabel>
              <Input
                id="pdv-codigo"
                maxLength={60}
                placeholder="PDV-001"
                value={datos.idPuntoVenta}
                onChange={(e) => setDatos({ ...datos, idPuntoVenta: e.target.value })}
                disabled={editando}
                required
              />
              <FieldDescription>
                {editando
                  ? 'El código identifica al punto y no se puede cambiar.'
                  : 'Hasta 60 caracteres. Debe ser único.'}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="pdv-nombre">Nombre</FieldLabel>
              <Input
                id="pdv-nombre"
                maxLength={100}
                value={datos.nombrePdv}
                onChange={(e) => setDatos({ ...datos, nombrePdv: e.target.value })}
                required
              />
            </Field>

            <CampoSelect
              id="pdv-regional"
              label="Regional"
              placeholder="Sin dato"
              className="w-full"
              value={datos.regional ?? ''}
              onChange={(v) =>
                setDatos({ ...datos, regional: (v || null) as PuntoVentaPayload['regional'] })
              }
              opciones={(opciones?.regionales ?? []).map((r) => ({
                value: r.value,
                label: r.label,
              }))}
            />

            <CampoSelect
              id="pdv-materiales"
              label="Materiales"
              placeholder="Sin dato"
              className="w-full"
              value={datos.materiales ?? ''}
              onChange={(v) =>
                setDatos({ ...datos, materiales: (v || null) as PuntoVentaPayload['materiales'] })
              }
              opciones={(opciones?.materiales ?? []).map((m) => ({
                value: m.value,
                label: m.label,
              }))}
            />
          </FieldGroup>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="pdv-form" disabled={guardar.isPending}>
            {guardar.isPending && <Spinner data-icon="inline-start" />}
            {editando ? 'Guardar' : 'Crear'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
