import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRightIcon,
  HammerIcon,
  HeadsetIcon,
  LockIcon,
  ShoppingBagIcon,
  StoreIcon,
  type LucideIcon,
} from 'lucide-react';
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
import { usePermisosBi, type Informe } from '../permisos';
import { CLAVES_PLANES, PLANES } from '../planes';

/** Portada del módulo: desde aquí se entra a cada tablero que la persona ve. */
export default function BiTradeHomePage() {
  const { verInforme } = usePermisosBi();
  const veClaro = verInforme('claro');
  const planes = CLAVES_PLANES.filter((clave) => verInforme(clave));
  const ninguno =
    !veClaro && !(['hc', 'falabella', 'tmk'] as const).some(verInforme) && planes.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="Hola, bienvenido a Bi trade"
        descripcion="Inteligencia de negocio para trade marketing."
      />

      {ninguno ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LockIcon className="size-4" />
              Aún no tienes informes asignados
            </CardTitle>
            <CardDescription>
              Tienes la app, pero ningún informe. Pídele a un administrador que te marque los que
              debes ver en Administración → Usuarios.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(18rem,1fr))]">
          {veClaro && <TarjetaClaro />}

          {CANALES.filter(({ informe }) => verInforme(informe)).map(
            ({ informe, ruta, icono, titulo, descripcion }) => (
              <Tarjeta
                key={informe}
                ruta={ruta}
                canal={informe}
                icono={icono}
                titulo={titulo}
                descripcion={descripcion}
              />
            ),
          )}

          {/* Cada plan lleva a su página; el que aún no tiene informe lo avisa. */}
          {planes.map((clave) => {
            const { titulo, ruta, icono, enConstruccion, descripcion } = PLANES[clave];
            return (
              <Tarjeta
                key={clave}
                ruta={ruta}
                icono={icono}
                titulo={titulo}
                descripcion={descripcion}
                enConstruccion={enConstruccion}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

const CANALES: Array<{
  informe: Extract<Informe, 'hc' | 'falabella' | 'tmk'>;
  ruta: string;
  icono: LucideIcon;
  titulo: string;
  descripcion: string;
}> = [
  {
    informe: 'hc',
    ruta: '/inicio/bi-trade/ventas-hc',
    icono: HammerIcon,
    titulo: 'Informe de Ventas HC',
    descripcion:
      'Avance del mes y cumplimiento diario del canal Homecenter, con sus propias tiendas, productos y metas.',
  },
  {
    informe: 'falabella',
    ruta: '/inicio/bi-trade/ventas-falabella',
    icono: ShoppingBagIcon,
    titulo: 'Informe de Ventas Falabella',
    descripcion:
      'Avance del mes y cumplimiento diario del canal Falabella, con sus propias tiendas, productos y metas.',
  },
  {
    informe: 'tmk',
    ruta: '/inicio/bi-trade/ventas-tmk',
    icono: HeadsetIcon,
    titulo: 'Informe Tmk Ecommerce Claro',
    descripcion:
      'Avance del mes y cumplimiento diario del canal Tmk Ecommerce Claro, con sus propios puntos, productos y metas.',
  },
];

/** Claro lleva sus totales: solo se piden si la persona ve ese informe. */
function TarjetaClaro() {
  const { data } = useDashboard({});
  return (
    <Tarjeta
      ruta="/inicio/bi-trade/claro"
      icono={StoreIcon}
      titulo="BI Claro punto de venta"
      descripcion="Ventas por punto de venta, marca y regional, con el detalle de productos y materiales."
    >
      {data && (
        <CardContent className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
          <span>{formatoNumero(data.totales.puntosVenta)} puntos de venta</span>
          <span>{formatoNumero(data.totales.productos)} productos</span>
          <span>{formatoNumero(data.totales.operaciones)} ventas registradas</span>
        </CardContent>
      )}
    </Tarjeta>
  );
}

function Tarjeta({
  ruta,
  canal,
  icono: Icono,
  titulo,
  descripcion,
  enConstruccion = false,
  children,
}: {
  ruta: string;
  /** El acento del canal (ver `index.css`). Sin canal, el ícono va en gris. */
  canal?: string;
  icono: LucideIcon;
  titulo: string;
  descripcion: string;
  enConstruccion?: boolean;
  children?: ReactNode;
}) {
  return (
    <Link to={ruta} className="group rounded-xl" data-canal={canal}>
      <Card className="h-full transition-shadow hover:ring-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span
              className={
                !canal
                  ? 'flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted'
                  : 'flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground'
              }
            >
              <Icono className="size-4" />
            </span>
            <span className="flex-1">{titulo}</span>
            {enConstruccion ? (
              <Badge variant="outline">En construcción</Badge>
            ) : (
              <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            )}
          </CardTitle>
          <CardDescription>{descripcion}</CardDescription>
        </CardHeader>
        {children}
      </Card>
    </Link>
  );
}
