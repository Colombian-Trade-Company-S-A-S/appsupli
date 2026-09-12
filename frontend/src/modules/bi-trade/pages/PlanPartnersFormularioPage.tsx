import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeftIcon,
  ClipboardListIcon,
  PackageIcon,
  PlusIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  StoreIcon,
  TagIcon,
  Trash2Icon,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/shared/components/ui';
import { ConfirmarBorrado } from '@/shared/components/feedback';
import { Encabezado, EstadoTabla, Kpi } from '@/shared/components/layout';
import { formatoNumero } from '@/shared/lib/formato';
import { useAuth } from '@/core/auth';
import { partnersApi, type RegistroPartnerPayload } from '../api';
import { CampoSelect } from '../components/CampoSelect';
import { CompartirFormulario } from '../components/CompartirTablero';
import { FormularioRecomendacion } from '../components/FormularioRecomendacion';
import {
  useBiTradeMutation,
  useOpcionesPartners,
  useProductosPartners,
  usePuntosVentaPartners,
  useRegionalesPartners,
  useRegistrosPartners,
} from '../hooks';

/**
 * El formulario del plan Partners: lo que antes era un Microsoft Forms.
 *
 * Aquí se llena con la cuenta de la plataforma; el mismo formulario se puede
 * compartir por enlace para quien no tiene cuenta. El punto de venta y el
 * producto se eligen con el nombre y el código pegados, como en el formulario
 * viejo, pero se guardan por separado para poder cruzarlos con el resto del BI.
 */
export default function PlanPartnersFormularioPage() {
  const { user } = useAuth();
  const puedeAdministrar = !!user?.isAdmin || !!user?.permissions.includes('bi-trade:data:manage');
  const { data: opciones } = useOpcionesPartners();
  const [buscar, setBuscar] = useState('');
  const { data: pagina, isLoading } = useRegistrosPartners({ search: buscar || undefined });

  const guardar = useBiTradeMutation(
    (payload: RegistroPartnerPayload) => partnersApi.registros.create(payload),
    (registro) => registro.message ?? 'Registro guardado',
  );

  const registros = pagina?.items ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="Plan Partners · Formulario"
        descripcion="Registra la recomendación de producto y consulta lo que ya se cargó."
      >
        <Button variant="outline" render={<Link to="/inicio/bi-trade/plan-partners" />}>
          <ArrowLeftIcon data-icon="inline-start" />
          Volver al plan
        </Button>
        <CompartirFormulario />
      </Encabezado>

      {/* El tamaño de lo cargado y de las listas, antes de entrar al detalle. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Registros"
          value={formatoNumero(pagina?.total ?? 0)}
          hint="Recomendaciones cargadas en total"
          cargando={isLoading}
        />
        <Kpi
          label="Puntos de venta"
          value={formatoNumero(opciones?.puntosVenta.length ?? 0)}
          hint="Activos en el formulario"
          extra={<StoreIcon className="size-4 text-muted-foreground" />}
        />
        <Kpi
          label="Productos"
          value={formatoNumero(opciones?.productos.length ?? 0)}
          hint="Protectores que se pueden recomendar"
          extra={<PackageIcon className="size-4 text-muted-foreground" />}
        />
        <Kpi
          label="Marcas"
          value={formatoNumero(opciones?.marcas.length ?? 0)}
          hint="Marcas de equipo disponibles"
          extra={<TagIcon className="size-4 text-muted-foreground" />}
        />
      </div>

      <Tabs defaultValue="registrar">
        <TabsList>
          <TabsTrigger value="registrar">
            <PlusIcon data-icon="inline-start" />
            Registrar
          </TabsTrigger>
          <TabsTrigger value="registros">
            <ClipboardListIcon data-icon="inline-start" />
            Registros
          </TabsTrigger>
          {puedeAdministrar && (
            <TabsTrigger value="listas">
              <SlidersHorizontalIcon data-icon="inline-start" />
              Listas
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="registrar" className="pt-4">
          <Card className="mx-auto max-w-3xl">
            <CardHeader>
              <CardTitle>Nueva recomendación</CardTitle>
              <CardDescription>
                Son tres pasos cortos. Todos los campos son obligatorios y queda a tu nombre.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormularioRecomendacion
                opciones={opciones}
                guardando={guardar.isPending}
                onEnviar={(payload) => guardar.mutateAsync(payload)}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="registros" className="flex flex-col gap-4 pt-4">
          <div className="relative max-w-md">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por serial, documento, factura o punto…"
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
            />
          </div>

          <Card className="py-0">
            <EstadoTabla
              cargando={isLoading}
              vacio={registros.length === 0}
              icono={<ClipboardListIcon />}
              titulo="Sin registros todavía"
              descripcion="Guarda la primera recomendación desde la pestaña «Registrar»."
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Punto de venta</TableHead>
                    <TableHead className="hidden md:table-cell">Regional</TableHead>
                    <TableHead>Marca</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>Serial</TableHead>
                    <TableHead className="hidden lg:table-cell">Promotor</TableHead>
                    <TableHead className="hidden lg:table-cell">Factura</TableHead>
                    <TableHead className="hidden xl:table-cell">Cargado por</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {registros.map((registro) => (
                    <TableRow key={registro.idRegistro}>
                      <TableCell className="tabular-nums">{registro.fechaRecomendacion}</TableCell>
                      <TableCell>
                        {registro.nombrePdv}
                        <span className="text-muted-foreground"> · {registro.idPuntoVenta}</span>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {registro.regional}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{registro.marca}</Badge>
                      </TableCell>
                      <TableCell>
                        {registro.nombreProducto}
                        <span className="text-muted-foreground"> · {registro.idProducto}</span>
                      </TableCell>
                      <TableCell className="tabular-nums">{registro.serial}</TableCell>
                      <TableCell className="hidden tabular-nums lg:table-cell">
                        {registro.documentoPromotor}
                      </TableCell>
                      <TableCell className="hidden tabular-nums lg:table-cell">
                        {registro.factura}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground xl:table-cell">
                        {registro.origen || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </EstadoTabla>
          </Card>

          <p className="text-xs text-muted-foreground">
            {registros.length} de {formatoNumero(pagina?.total ?? 0)} registro
            {(pagina?.total ?? 0) === 1 ? '' : 's'}
          </p>
        </TabsContent>

        {puedeAdministrar && (
          <TabsContent value="listas" className="pt-4">
            <ListasDelFormulario />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

// ── Administrar las listas ─────────────────────────────────────────────────

interface Fila {
  id: string | number;
  texto: string;
  nota?: string;
  onBorrar: () => void;
}

/** Una lista del formulario: su formulario para agregar y lo que ya tiene. */
function Lista({
  titulo,
  ayuda,
  formulario,
  filas,
}: {
  titulo: string;
  ayuda: string;
  formulario: ReactNode;
  filas: Fila[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-medium">
          {titulo} <span className="text-muted-foreground">({filas.length})</span>
        </p>
        <p className="text-xs text-muted-foreground">{ayuda}</p>
      </div>
      {formulario}
      <ul className="flex max-h-72 flex-col gap-0.5 overflow-y-auto rounded-md border p-2">
        {filas.map((fila) => (
          <li
            key={fila.id}
            className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted"
          >
            <span className="flex-1 truncate">{fila.texto}</span>
            {fila.nota && (
              <Badge variant="outline" className="shrink-0">
                {fila.nota}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              aria-label={`Quitar ${fila.texto}`}
              onClick={fila.onBorrar}
            >
              <Trash2Icon />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Las tres listas del formulario, administrables sin pasar por un despliegue.
 *
 * Lo que ya se usó en un registro no se puede borrar —cambiaría lo cargado—,
 * pero sí desactivar: el backend responde con ese mensaje y se muestra tal cual.
 */
function ListasDelFormulario() {
  const { data: regionales = [] } = useRegionalesPartners();
  const { data: puntos = [] } = usePuntosVentaPartners();
  const { data: productos = [] } = useProductosPartners();

  const [nuevaRegional, setNuevaRegional] = useState('');
  const [nuevoPunto, setNuevoPunto] = useState({
    idPuntoVenta: '',
    nombrePdv: '',
    idRegional: '',
  });
  const [nuevoProducto, setNuevoProducto] = useState({ idProducto: '', nombreProducto: '' });
  const [porBorrar, setPorBorrar] = useState<{ etiqueta: string; borrar: () => void } | null>(null);

  const crearRegional = useBiTradeMutation(
    (nombre: string) => partnersApi.regionales.create({ nombre }),
    'Regional agregada',
  );
  const crearPunto = useBiTradeMutation(
    (punto: { idPuntoVenta: string; nombrePdv: string; idRegional: number }) =>
      partnersApi.puntosVenta.create(punto),
    'Punto de venta agregado',
  );
  const crearProducto = useBiTradeMutation(
    (producto: { idProducto: string; nombreProducto: string }) =>
      partnersApi.productos.create(producto),
    'Producto agregado',
  );
  const borrarRegional = useBiTradeMutation(
    (id: number) => partnersApi.regionales.remove(id),
    'Regional eliminada',
  );
  const borrarPunto = useBiTradeMutation(
    (id: string) => partnersApi.puntosVenta.remove(id),
    'Punto de venta eliminado',
  );
  const borrarProducto = useBiTradeMutation(
    (id: string) => partnersApi.productos.remove(id),
    'Producto eliminado',
  );

  const opcionesRegional = regionales.map((regional) => ({
    value: String(regional.idRegional),
    label: regional.nombre,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SlidersHorizontalIcon className="size-4 text-muted-foreground" />
          Listas del formulario
        </CardTitle>
        <CardDescription>
          Agrega o quita regionales, puntos de venta y productos. Lo que ya tenga registros no se
          puede borrar, pero sí desactivar desde el administrador.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-3">
        <Lista
          titulo="Regionales"
          ayuda="Definen qué puntos ve el promotor."
          formulario={
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                crearRegional.mutate(nuevaRegional, { onSuccess: () => setNuevaRegional('') });
              }}
            >
              <Input
                aria-label="Nombre de la regional"
                placeholder="Región Eje Cafetero"
                maxLength={80}
                value={nuevaRegional}
                onChange={(e) => setNuevaRegional(e.target.value)}
                required
              />
              <Button type="submit" size="icon" aria-label="Agregar regional">
                <PlusIcon />
              </Button>
            </form>
          }
          filas={regionales.map((regional) => ({
            id: regional.idRegional,
            texto: regional.nombre,
            nota: `${regional.puntosCount} pdv`,
            onBorrar: () =>
              setPorBorrar({
                etiqueta: regional.nombre,
                borrar: () => borrarRegional.mutate(regional.idRegional),
              }),
          }))}
        />

        <Lista
          titulo="Puntos de venta"
          ayuda="El código va aparte del nombre: «Cav Pereira Victoria» + «C900»."
          formulario={
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                crearPunto.mutate(
                  { ...nuevoPunto, idRegional: Number(nuevoPunto.idRegional) },
                  {
                    onSuccess: () =>
                      setNuevoPunto({ idPuntoVenta: '', nombrePdv: '', idRegional: '' }),
                  },
                );
              }}
            >
              <div className="flex gap-2">
                <Input
                  aria-label="Código del punto de venta"
                  placeholder="C900"
                  className="w-28"
                  maxLength={60}
                  value={nuevoPunto.idPuntoVenta}
                  onChange={(e) => setNuevoPunto({ ...nuevoPunto, idPuntoVenta: e.target.value })}
                  required
                />
                <Input
                  aria-label="Nombre del punto de venta"
                  placeholder="Cav Pereira Victoria"
                  maxLength={100}
                  value={nuevoPunto.nombrePdv}
                  onChange={(e) => setNuevoPunto({ ...nuevoPunto, nombrePdv: e.target.value })}
                  required
                />
              </div>
              <div className="flex items-end gap-2">
                <CampoSelect
                  id="nuevo-punto-regional"
                  label="Regional"
                  placeholder="Regional"
                  className="min-w-0 flex-1"
                  value={nuevoPunto.idRegional}
                  onChange={(idRegional) => setNuevoPunto({ ...nuevoPunto, idRegional })}
                  opciones={opcionesRegional}
                  incluirTodas={false}
                />
                <Button type="submit" size="icon" aria-label="Agregar punto de venta">
                  <PlusIcon />
                </Button>
              </div>
            </form>
          }
          filas={puntos.map((punto) => ({
            id: punto.idPuntoVenta,
            texto: punto.etiqueta,
            nota: punto.activo ? undefined : 'inactivo',
            onBorrar: () =>
              setPorBorrar({
                etiqueta: punto.etiqueta,
                borrar: () => borrarPunto.mutate(punto.idPuntoVenta),
              }),
          }))}
        />

        <Lista
          titulo="Productos"
          ayuda="Igual que los puntos: código y nombre por separado."
          formulario={
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                crearProducto.mutate(nuevoProducto, {
                  onSuccess: () => setNuevoProducto({ idProducto: '', nombreProducto: '' }),
                });
              }}
            >
              <Input
                aria-label="Código del producto"
                placeholder="7020000"
                className="w-28"
                maxLength={60}
                value={nuevoProducto.idProducto}
                onChange={(e) => setNuevoProducto({ ...nuevoProducto, idProducto: e.target.value })}
                required
              />
              <Input
                aria-label="Nombre del producto"
                placeholder="Clear"
                maxLength={60}
                value={nuevoProducto.nombreProducto}
                onChange={(e) =>
                  setNuevoProducto({ ...nuevoProducto, nombreProducto: e.target.value })
                }
                required
              />
              <Button type="submit" size="icon" aria-label="Agregar producto">
                <PlusIcon />
              </Button>
            </form>
          }
          filas={productos.map((producto) => ({
            id: producto.idProducto,
            texto: producto.etiqueta,
            nota: producto.activo ? undefined : 'inactivo',
            onBorrar: () =>
              setPorBorrar({
                etiqueta: producto.etiqueta,
                borrar: () => borrarProducto.mutate(producto.idProducto),
              }),
          }))}
        />
      </CardContent>

      <ConfirmarBorrado
        abierto={!!porBorrar}
        onOpenChange={(abierto) => !abierto && setPorBorrar(null)}
        titulo="¿Quitarlo de la lista?"
        descripcion={`«${porBorrar?.etiqueta}» dejará de aparecer en el formulario. Si ya tiene registros cargados, no se podrá borrar.`}
        onConfirmar={() => {
          porBorrar?.borrar();
          setPorBorrar(null);
        }}
      />
    </Card>
  );
}
