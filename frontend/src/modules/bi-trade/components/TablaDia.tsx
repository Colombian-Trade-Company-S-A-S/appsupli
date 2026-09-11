import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui';
import { formatoMoneda, formatoNumero } from '@/shared/lib/formato';
import { cn } from '@/shared/lib/utils';
import type { CorteDia, FilaDia } from '../api';
import { BadgeCumplimiento, BarraCumplimiento } from './Cumplimiento';
import { BotonExportar, type ColumnaCopia } from './BotonExportar';
import { ACCION_TARJETA } from './estilos';
import { useFuente } from '../fuente';

/** Qué medida se está mirando. Las tres tienen su propia meta. */
export type Medida = 'dinero' | 'cantidad' | 'puntos';

export const MEDIDAS: Array<{ value: Medida; label: string }> = [
  { value: 'dinero', label: 'Dinero' },
  { value: 'cantidad', label: 'Unidades' },
  { value: 'puntos', label: 'Puntos' },
];

/** Las medidas de un canal: los puntos solo existen en Claro. */
export const medidasDe = (conPuntos: boolean) =>
  conPuntos ? MEDIDAS : MEDIDAS.filter((m) => m.value !== 'puntos');

const real = (fila: FilaDia, medida: Medida) =>
  medida === 'dinero'
    ? fila.realDinero
    : medida === 'cantidad'
      ? fila.realCantidad
      : fila.realPuntos;

const meta = (fila: FilaDia, medida: Medida) =>
  medida === 'dinero'
    ? fila.metaDinero
    : medida === 'cantidad'
      ? fila.metaCantidad
      : fila.metaPuntos;

const pct = (fila: FilaDia, medida: Medida) =>
  medida === 'dinero'
    ? fila.cumplimientoDinero
    : medida === 'cantidad'
      ? fila.cumplimientoCantidad
      : fila.cumplimientoPuntos;

/** El dinero va en pesos; las unidades y los puntos, como número pelado. */
export const formatear = (valor: number, medida: Medida) =>
  medida === 'dinero' ? formatoMoneda(valor) : formatoNumero(valor);

const COLUMNAS_COPIA: Array<ColumnaCopia<FilaDia>> = [
  { encabezado: 'Nombre', valor: (f) => f.label },
  { encabezado: 'Meta del día ($)', valor: (f) => f.metaDinero },
  { encabezado: 'Vendido ($)', valor: (f) => f.realDinero },
  { encabezado: 'Cumplimiento $ (%)', valor: (f) => f.cumplimientoDinero },
  { encabezado: 'Meta del día (u.)', valor: (f) => f.metaCantidad },
  { encabezado: 'Vendido (u.)', valor: (f) => f.realCantidad },
  { encabezado: 'Cumplimiento u. (%)', valor: (f) => f.cumplimientoCantidad },
  { encabezado: 'Meta del día (pts)', valor: (f) => f.metaPuntos },
  { encabezado: 'Vendido (pts)', valor: (f) => f.realPuntos },
  { encabezado: 'Cumplimiento pts (%)', valor: (f) => f.cumplimientoPuntos },
];

const COLUMNAS_SIN_PUNTOS = COLUMNAS_COPIA.filter((c) => !c.encabezado.includes('pts'));

/** Cuántas filas se ven antes de pedir «ver todas». */
const TOPE = 10;

type CampoOrden = 'label' | 'meta' | 'real' | 'cumplimiento';

/**
 * Un corte del día: la venta contra la cuota, por una dimensión.
 *
 * La medida la manda la hoja, no la tarjeta: mirando dinero se quiere ver
 * dinero en los cuatro cortes a la vez, no ir cambiándolo en cada uno.
 */
export function TablaDia({
  titulo,
  descripcion,
  encabezado,
  filas,
  medida,
  corte,
  onExportar,
  cargando = false,
}: {
  titulo: string;
  descripcion: string;
  encabezado: string;
  filas: FilaDia[];
  medida: Medida;
  corte: CorteDia;
  onExportar: (corte: CorteDia) => Promise<unknown>;
  cargando?: boolean;
}) {
  const [orden, setOrden] = useState<{ campo: CampoOrden; desc: boolean }>({
    campo: 'cumplimiento',
    desc: true,
  });
  const [buscar, setBuscar] = useState('');
  const [verTodas, setVerTodas] = useState(false);
  const { conPuntos } = useFuente();

  const valorDe = (fila: FilaDia, campo: CampoOrden) => {
    if (campo === 'label') return fila.label;
    if (campo === 'meta') return meta(fila, medida);
    if (campo === 'real') return real(fila, medida);
    return pct(fila, medida);
  };

  const visibles = useMemo(() => {
    const texto = buscar.trim().toLowerCase();
    const filtradas = texto
      ? filas.filter((fila) => fila.label.toLowerCase().includes(texto))
      : filas;
    return [...filtradas].sort((a, b) => {
      const izq = valorDe(a, orden.campo);
      const der = valorDe(b, orden.campo);
      const comparacion =
        typeof izq === 'string' && typeof der === 'string'
          ? izq.localeCompare(der, 'es')
          : Number(izq) - Number(der);
      return orden.desc ? -comparacion : comparacion;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, buscar, orden, medida]);

  const total = visibles.reduce(
    (suma, fila) => ({
      meta: suma.meta + meta(fila, medida),
      real: suma.real + real(fila, medida),
    }),
    { meta: 0, real: 0 },
  );
  const cumplimientoTotal = total.meta ? Math.round((total.real * 1000) / total.meta) / 10 : 0;

  const recortadas = verTodas ? visibles : visibles.slice(0, TOPE);
  const mejor = orden.campo === 'cumplimiento' && orden.desc ? visibles[0]?.key : undefined;

  const Columna = ({
    campo,
    children,
    className,
  }: {
    campo: CampoOrden;
    children: ReactNode;
    className?: string;
  }) => {
    const activo = orden.campo === campo;
    const Icono = !activo ? ChevronsUpDownIcon : orden.desc ? ArrowDownIcon : ArrowUpIcon;
    return (
      <TableHead className={className}>
        <Button
          variant="ghost"
          size="sm"
          className={cn('-mx-2 font-medium', !activo && 'text-muted-foreground')}
          onClick={() =>
            setOrden((previo) =>
              previo.campo === campo ? { campo, desc: !previo.desc } : { campo, desc: true },
            )
          }
        >
          {children}
          <Icono data-icon="inline-end" />
        </Button>
      </TableHead>
    );
  };

  return (
    <Card className="gap-0 pb-0">
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
        <CardDescription>{descripcion}</CardDescription>
        <CardAction className={ACCION_TARJETA}>
          {filas.length > TOPE && (
            <Input
              className="h-8 w-full sm:w-40"
              placeholder={`Filtrar ${encabezado.toLowerCase()}…`}
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
            />
          )}
          <BotonExportar
            etiqueta={titulo.toLowerCase()}
            descargar={() => onExportar(corte)}
            columnas={conPuntos ? COLUMNAS_COPIA : COLUMNAS_SIN_PUNTOS}
            filas={visibles}
          />
        </CardAction>
      </CardHeader>

      <CardContent className="px-0">
        {cargando ? (
          <div className="flex flex-col gap-3 px-6 py-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : visibles.length === 0 ? (
          <p className="px-6 py-6 text-sm text-muted-foreground">
            {buscar
              ? `Nada coincide con «${buscar}».`
              : 'Sin ventas ni metas para este corte del día.'}
          </p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <Columna campo="label">{encabezado}</Columna>
                  <Columna campo="meta" className="text-right">
                    Meta del día
                  </Columna>
                  <Columna campo="real" className="text-right">
                    Vendido
                  </Columna>
                  <Columna campo="cumplimiento" className="text-right">
                    Cumplimiento
                  </Columna>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recortadas.map((fila) => (
                  <TableRow key={fila.key}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        {fila.label}
                        {fila.key === mejor && pct(fila, medida) > 0 && (
                          <Badge variant="success">Mejor</Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatear(meta(fila, medida), medida)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatear(real(fila, medida), medida)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <BarraCumplimiento
                          porcentaje={pct(fila, medida)}
                          className="hidden w-16 sm:block"
                        />
                        <BadgeCumplimiento porcentaje={pct(fila, medida)} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell>Total{buscar && ' de lo filtrado'}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatear(total.meta, medida)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatear(total.real, medida)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{cumplimientoTotal}%</TableCell>
                </TableRow>
              </TableFooter>
            </Table>

            {visibles.length > TOPE && (
              <div className="flex justify-center border-t py-2">
                <Button variant="ghost" size="sm" onClick={() => setVerTodas(!verTodas)}>
                  {verTodas ? `Ver solo los primeros ${TOPE}` : `Ver los ${visibles.length}`}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
