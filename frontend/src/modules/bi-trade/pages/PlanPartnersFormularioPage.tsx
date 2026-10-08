import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeftIcon,
  ClipboardListIcon,
  PackageIcon,
  PlusIcon,
  SearchIcon,
  StoreIcon,
  TagIcon,
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
import { Encabezado, EstadoTabla, Kpi } from '@/shared/components/layout';
import { formatoNumero } from '@/shared/lib/formato';
import { partnersApi, type RegistroPartnerPayload } from '../api';
import { CompartirFormulario } from '../components/CompartirTablero';
import { FormularioRecomendacion } from '../components/FormularioRecomendacion';
import { useBiTradeMutation, useOpcionesPartners, useRegistrosPartners } from '../hooks';

/**
 * El formulario del plan Partners: lo que antes era un Microsoft Forms.
 *
 * Aquí se llena con la cuenta de la plataforma; el mismo formulario se puede
 * compartir por enlace para quien no tiene cuenta. El punto de venta y el
 * producto se eligen con el nombre y el código pegados, como en el formulario
 * viejo, pero se guardan por separado para poder cruzarlos con el resto del BI.
 */
export default function PlanPartnersFormularioPage() {
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
      </Tabs>
    </div>
  );
}
