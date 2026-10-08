import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftIcon, ClipboardListIcon, PlusIcon, SearchIcon, Trash2Icon } from 'lucide-react';
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
import { Encabezado, EstadoTabla } from '@/shared/components/layout';
import { useAuth } from '@/core/auth';
import { belkinApi, type RegistroBelkinPayload } from '../api';
import { CompartirFormularioBelkin } from '../components/CompartirTablero';
import { FormularioBelkin } from '../components/FormularioBelkin';
import { Paginacion } from '../components/Paginacion';
import { useBiTradeMutation, useOpcionesBelkin, useRegistrosBelkin } from '../hooks';
import { PLANES } from '../planes';

const BASE = PLANES.belkin.ruta;
const POR_PAGINA = 15;

/**
 * El formulario del plan Recomiéndame Belkin: lo que antes era un Microsoft Forms.
 *
 * Sigue el mismo orden del formulario anterior —regional, punto, fecha, asesor,
 * categoría y producto— pero el punto y el producto se eligen de listas que
 * se administran en el panel del plan, y el asesor sale de los cargados para
 * el punto elegido en vez de escribirse a mano.
 */
export default function PlanBelkinFormularioPage() {
  const { user } = useAuth();
  const puedeAdministrar = !!user?.isAdmin || !!user?.permissions.includes('bi-trade:data:manage');
  const { data: opciones } = useOpcionesBelkin();
  const [buscar, setBuscar] = useState('');
  const [pagina, setPagina] = useState(1);
  const { data: registros, isLoading } = useRegistrosBelkin({
    search: buscar || undefined,
    page: pagina,
  });
  const [porBorrar, setPorBorrar] = useState<number | null>(null);

  const guardar = useBiTradeMutation(
    (payload: RegistroBelkinPayload) => belkinApi.registros.create(payload),
    'Recomendación guardada',
  );
  const borrar = useBiTradeMutation(
    (id: number) => belkinApi.registros.remove(id),
    'Registro eliminado',
  );

  const filas = registros?.items ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="Plan Recomiéndame Belkin · Formulario"
        descripcion="Registra la recomendación de producto y consulta lo que ya se cargó."
      >
        <Button variant="outline" render={<Link to={BASE} />}>
          <ArrowLeftIcon data-icon="inline-start" />
          Volver al plan
        </Button>
        <CompartirFormularioBelkin />
      </Encabezado>

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
        </TabsList>

        <TabsContent value="registrar" className="pt-4">
          <Card className="mx-auto max-w-3xl">
            <CardHeader>
              <CardTitle>Nueva recomendación</CardTitle>
              <CardDescription>
                El asesor y la observación son opcionales; lo demás es obligatorio.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormularioBelkin
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
              placeholder="Buscar por punto, regional, asesor, producto o categoría…"
              value={buscar}
              onChange={(e) => {
                setBuscar(e.target.value);
                setPagina(1);
              }}
            />
          </div>

          <Card className="py-0">
            <EstadoTabla
              cargando={isLoading}
              vacio={filas.length === 0}
              icono={<ClipboardListIcon />}
              titulo="Sin registros todavía"
              descripcion="Guarda la primera recomendación desde la pestaña «Registrar»."
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead className="hidden md:table-cell">Regional</TableHead>
                    <TableHead>Punto de venta</TableHead>
                    <TableHead className="hidden lg:table-cell">Asesor Apple</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead className="hidden xl:table-cell">Observación</TableHead>
                    <TableHead className="hidden xl:table-cell">Cargado por</TableHead>
                    {puedeAdministrar && <TableHead className="w-10" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filas.map((registro) => (
                    <TableRow key={registro.idRegistro}>
                      <TableCell className="tabular-nums">{registro.fechaRecomendacion}</TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {registro.regional}
                      </TableCell>
                      <TableCell>
                        {registro.nombrePdv}
                        <span className="text-muted-foreground"> · {registro.idPuntoVenta}</span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {registro.asesor || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{registro.categoria}</Badge>
                      </TableCell>
                      <TableCell className="max-w-64 truncate" title={registro.productoEtiqueta}>
                        <span className="font-mono text-xs text-muted-foreground">
                          {registro.idProducto}
                        </span>{' '}
                        {registro.nombreProducto}
                      </TableCell>
                      <TableCell
                        className="hidden max-w-48 truncate text-muted-foreground xl:table-cell"
                        title={registro.observacion}
                      >
                        {registro.observacion || '—'}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground xl:table-cell">
                        {registro.origen || '—'}
                      </TableCell>
                      {puedeAdministrar && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Eliminar registro"
                            onClick={() => setPorBorrar(registro.idRegistro)}
                          >
                            <Trash2Icon />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </EstadoTabla>
          </Card>

          <Paginacion
            pagina={pagina}
            onPaginaChange={setPagina}
            total={registros?.total ?? 0}
            porPagina={POR_PAGINA}
            cargando={isLoading}
          />
        </TabsContent>
      </Tabs>

      <ConfirmarBorrado
        abierto={porBorrar !== null}
        onOpenChange={(abierto) => !abierto && setPorBorrar(null)}
        titulo="¿Eliminar el registro?"
        descripcion="La recomendación se borra y no se puede recuperar."
        onConfirmar={() => {
          if (porBorrar !== null) borrar.mutate(porBorrar);
          setPorBorrar(null);
        }}
      />
    </div>
  );
}
