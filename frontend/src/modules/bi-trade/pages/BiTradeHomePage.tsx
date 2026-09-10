import { Link } from 'react-router-dom';
import { ArrowRightIcon, StoreIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui';
import { Encabezado } from '@/shared/components/layout';
import { formatoNumero } from '@/shared/lib/formato';
import { useDashboard } from '../hooks';

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
      </div>
    </div>
  );
}
