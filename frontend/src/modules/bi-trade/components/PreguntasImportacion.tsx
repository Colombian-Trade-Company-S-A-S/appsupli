import { PackagePlusIcon } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui';
import { formatoMoneda, formatoNumero } from '@/shared/lib/formato';
import type { DecisionProductos, DiaConVentas, PreguntaProductos } from '../api';
import { usePuedeEditar } from '../permisos';
import { Faltantes, fechaCorta } from './ImportarQuery';

/**
 * Las preguntas que hace la importación de un reporte de portal (Falabella,
 * HC) antes de guardar. Cada una es una pantalla del mismo diálogo.
 */

const plural = (n: number, singular: string, varios: string) =>
  `${formatoNumero(n)} ${n === 1 ? singular : varios}`;

/**
 * «Hay productos (y puntos de venta) por crear, ¿deseas crearlos?», con la
 * vista previa de cómo quedarían. Nada se guarda hasta elegir.
 */
export function VistaPreviaCatalogo({
  pregunta,
  cargando,
  decisionEnCurso,
  aviso,
  onCancelar,
  onDecidir,
}: {
  pregunta: PreguntaProductos;
  cargando: boolean;
  decisionEnCurso?: DecisionProductos;
  /** Algo que conviene saber antes de crear: por ejemplo, que quedan sin precio. */
  aviso?: { titulo: string; texto: string };
  onCancelar: () => void;
  onDecidir: (decision: DecisionProductos) => void;
}) {
  const { productos, puntos, marcasNuevas, puntosFaltantes } = pregunta;
  // Crear pide poder editar eso; sin el permiso, solo queda importar sin crearlos.
  const puedeProductos = usePuedeEditar('productos');
  const puedePuntos = usePuedeEditar('puntos-venta');
  const sinPermiso = [
    productos.length > 0 && !puedeProductos && 'productos',
    puntos.length > 0 && !puedePuntos && 'puntos de venta',
  ].filter(Boolean);
  // El EAN y el SKU Coltrade solo los trae HC: la columna aparece si alguno los tiene.
  const conCodigos = productos.some((p) => p.ean || p.skuColtrade);
  const partes = [
    productos.length > 0 && plural(productos.length, 'producto', 'productos'),
    puntos.length > 0 && plural(puntos.length, 'punto de venta', 'puntos de venta'),
  ].filter(Boolean);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Hay {partes.join(' y ')} por crear. ¿Deseas crearlos?</DialogTitle>
        <DialogDescription>
          No existen en la app. Así quedarían, con los datos del mismo archivo: el precio es el
          valor de una unidad y va como precio del canal y precio Coltrade. Todavía no se ha
          guardado nada.
        </DialogDescription>
      </DialogHeader>

      {productos.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Productos
          </p>
          <div className="max-h-[38dvh] overflow-y-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Producto</TableHead>
                  {conCodigos && <TableHead>EAN · SKU Coltrade</TableHead>}
                  <TableHead>Marca</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productos.map((producto) => (
                  <TableRow key={producto.idProducto}>
                    <TableCell className="font-mono text-xs">{producto.idProducto}</TableCell>
                    <TableCell className="max-w-64 truncate" title={producto.nombreProducto}>
                      {producto.nombreProducto}
                    </TableCell>
                    {conCodigos && (
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {producto.ean ?? '—'} · {producto.skuColtrade ?? '—'}
                      </TableCell>
                    )}
                    <TableCell>
                      <span className="flex items-center gap-1.5">
                        {producto.marca ?? <span className="text-muted-foreground">Sin marca</span>}
                        {producto.marcaNueva && <Badge variant="secondary">Nueva</Badge>}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {producto.precio ? (
                        formatoMoneda(producto.precio)
                      ) : (
                        <span className="text-muted-foreground">Sin precio</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {puntos.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Puntos de venta
          </p>
          <div className="max-h-[30dvh] overflow-y-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Regional</TableHead>
                  <TableHead>Materiales</TableHead>
                  <TableHead>Categoría</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {puntos.map((punto) => (
                  <TableRow key={punto.idPuntoVenta}>
                    <TableCell className="font-mono text-xs">{punto.idPuntoVenta}</TableCell>
                    <TableCell>{punto.nombrePdv}</TableCell>
                    <TableCell>{punto.regional ?? '—'}</TableCell>
                    <TableCell>{punto.materiales ?? '—'}</TableCell>
                    <TableCell>{punto.categoria ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {aviso && (
        <Alert>
          <AlertTitle>{aviso.titulo}</AlertTitle>
          <AlertDescription>{aviso.texto}</AlertDescription>
        </Alert>
      )}
      {marcasNuevas.length > 0 && (
        <p className="text-sm text-muted-foreground">
          También se crean {marcasNuevas.length === 1 ? 'la marca' : 'las marcas'}{' '}
          {marcasNuevas.join(', ')}.
        </p>
      )}
      {puntosFaltantes.length > 0 && (
        <Alert>
          <AlertTitle>Estos puntos de venta no existen</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            No se crean solos: sus filas no van a entrar.
            <Faltantes titulo="Códigos" codigos={puntosFaltantes} />
          </AlertDescription>
        </Alert>
      )}

      {sinPermiso.length > 0 && (
        <Alert>
          <AlertTitle>No puedes crear {sinPermiso.join(' ni ')}</AlertTitle>
          <AlertDescription>
            Tu usuario no tiene ese permiso. Importa sin crearlos o pídele el permiso a un
            administrador.
          </AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onCancelar} disabled={cargando}>
          Cancelar
        </Button>
        <Button variant="outline" disabled={cargando} onClick={() => onDecidir('omitir')}>
          {decisionEnCurso === 'omitir' && <Spinner data-icon="inline-start" />}
          Importar sin crearlos
        </Button>
        <Button disabled={cargando || sinPermiso.length > 0} onClick={() => onDecidir('crear')}>
          {decisionEnCurso === 'crear' ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <PackagePlusIcon data-icon="inline-start" />
          )}
          Crear e importar
        </Button>
      </DialogFooter>
    </>
  );
}

/** Algunos días del archivo ya tienen ventas: sobrescribirlos o cancelar. */
export function PreguntaDias({
  dias,
  aviso,
  cargando,
  onCancelar,
  onSobrescribir,
}: {
  dias: DiaConVentas[];
  /** Una línea más bajo la explicación: qué más pasa al sobrescribir. */
  aviso?: string;
  cargando: boolean;
  onCancelar: () => void;
  onSobrescribir: () => void;
}) {
  const registros = dias.reduce((total, dia) => total + dia.registros, 0);
  return (
    <>
      <DialogHeader>
        <DialogTitle>Ya hay ventas de esos días</DialogTitle>
        <DialogDescription>
          No se guardó nada. Si sobrescribes, se borran las {formatoNumero(registros)} ventas de
          estos días y quedan las del archivo.{aviso ? ` ${aviso}` : ''}
        </DialogDescription>
      </DialogHeader>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Día</TableHead>
            <TableHead className="text-right">Ventas cargadas</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {dias.map((dia) => (
            <TableRow key={dia.fecha}>
              <TableCell>{fechaCorta(dia.fecha)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatoNumero(dia.registros)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <DialogFooter>
        <Button variant="outline" onClick={onCancelar} disabled={cargando}>
          Cancelar
        </Button>
        <Button variant="destructive" disabled={cargando} onClick={onSobrescribir}>
          {cargando && <Spinner data-icon="inline-start" />}
          Sobrescribir
        </Button>
      </DialogFooter>
    </>
  );
}
