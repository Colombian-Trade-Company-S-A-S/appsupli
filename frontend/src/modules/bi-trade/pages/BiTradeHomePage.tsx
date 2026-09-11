import { Link } from 'react-router-dom';
import { ArrowRightIcon, HammerIcon, HeadsetIcon, ShoppingBagIcon, StoreIcon } from 'lucide-react';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui';
import { Encabezado } from '@/shared/components/layout';
import { formatoNumero } from '@/shared/lib/formato';
import { useDashboard } from '../hooks';
import { CLAVES_PLANES, PLANES } from '../planes';

/** Portada del módulo: desde aquí se entra a cada tablero. */
export default function BiTradeHomePage() {
  const { data } = useDashboard({});

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="Hola, bienvenido a Bi trade"
        descripcion="Inteligencia de negocio para trade marketing."
      />

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(18rem,1fr))]">
        <Link to="/inicio/bi-trade/claro" className="group rounded-xl">
          <Card className="h-full transition-shadow hover:ring-primary/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <StoreIcon className="size-4" />
                </span>
                <span className="flex-1">BI Claro punto de venta</span>
                <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </CardTitle>
              <CardDescription>
                Ventas por punto de venta, marca y regional, con el detalle de productos y
                materiales.
              </CardDescription>
            </CardHeader>
            {data && (
              <CardContent className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                <span>{formatoNumero(data.totales.puntosVenta)} puntos de venta</span>
                <span>{formatoNumero(data.totales.productos)} productos</span>
                <span>{formatoNumero(data.totales.operaciones)} ventas registradas</span>
              </CardContent>
            )}
          </Card>
        </Link>

        <Link to="/inicio/bi-trade/ventas-hc" className="group rounded-xl" data-canal="hc">
          <Card className="h-full transition-shadow hover:ring-primary/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <HammerIcon className="size-4" />
                </span>
                <span className="flex-1">Informe de Ventas HC</span>
                <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </CardTitle>
              <CardDescription>
                Avance del mes y cumplimiento diario del canal Homecenter, con sus propias tiendas,
                productos y metas.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link
          to="/inicio/bi-trade/ventas-falabella"
          className="group rounded-xl"
          data-canal="falabella"
        >
          <Card className="h-full transition-shadow hover:ring-primary/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <ShoppingBagIcon className="size-4" />
                </span>
                <span className="flex-1">Informe de Ventas Falabella</span>
                <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </CardTitle>
              <CardDescription>
                Avance del mes y cumplimiento diario del canal Falabella, con sus propias tiendas,
                productos y metas.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link to="/inicio/bi-trade/ventas-tmk" className="group rounded-xl" data-canal="tmk">
          <Card className="h-full transition-shadow hover:ring-primary/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <HeadsetIcon className="size-4" />
                </span>
                <span className="flex-1">Informe Tmk Ecommerce Claro</span>
                <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </CardTitle>
              <CardDescription>
                Avance del mes y cumplimiento diario del canal Tmk Ecommerce Claro, con sus propios
                puntos, productos y metas.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        {/* Los planes aún no tienen informe: la tarjeta ya lleva a su página. */}
        {CLAVES_PLANES.map((clave) => {
          const { titulo, ruta, icono: Icono } = PLANES[clave];
          return (
            <Link key={clave} to={ruta} className="group rounded-xl">
              <Card className="h-full transition-shadow hover:ring-primary/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <Icono className="size-4" />
                    </span>
                    <span className="flex-1">{titulo}</span>
                    <Badge variant="outline">En construcción</Badge>
                  </CardTitle>
                  <CardDescription>
                    Este informe está en construcción. Muy pronto vas a poder verlo aquí.
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
