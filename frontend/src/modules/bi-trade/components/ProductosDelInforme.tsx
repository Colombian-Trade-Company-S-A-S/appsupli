import { useState } from 'react';
import { PackagePlusIcon } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Checkbox,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui';
import { formatoNumero } from '@/shared/lib/formato';
import type { DecisionInforme, PreguntaInforme } from '../api';
import { usePuedeEditar } from '../permisos';
import { nombreDelMes, type Mes } from './SelectorMes';

/** Lo que la persona decide de cada producto antes de crearlo. */
interface Eleccion {
  elegido: boolean;
  nombre: string;
  /** Solo dígitos. Vacío: el producto queda en $0. */
  precio: string;
}

const plural = (n: number, singular: string, varios: string) =>
  `${formatoNumero(n)} ${n === 1 ? singular : varios}`;

/**
 * El informe del ERP vende en Tmk productos que no existen en la app: aquí se
 * elige cuáles crear, con su nombre y su precio Coltrade, antes de importar.
 *
 * Arrancan todos marcados, con el nombre y la marca que trae el archivo. El
 * precio va vacío porque el informe no lo trae (su «Precio Venta» es el precio
 * al público): si se deja así, el producto queda en $0 y sus ventas cuentan
 * en unidades pero no en dinero hasta que se le ponga precio en Productos.
 *
 * Los que no se marquen no se crean y sus ventas no entran. Nada se guarda
 * hasta elegir.
 */
export function ElegirProductosInforme({
  pregunta,
  mes,
  cargando,
  decisionEnCurso,
  onCancelar,
  onDecidir,
}: {
  pregunta: PreguntaInforme;
  mes: Mes;
  cargando: boolean;
  decisionEnCurso?: DecisionInforme['productos'];
  onCancelar: () => void;
  onDecidir: (decision: DecisionInforme) => void;
}) {
  const { productos } = pregunta;
  const puedeProductos = usePuedeEditar('productos');
  const [elecciones, setElecciones] = useState<Record<string, Eleccion>>(() =>
    Object.fromEntries(
      productos.map((p) => [p.idProducto, { elegido: true, nombre: p.nombreProducto, precio: '' }]),
    ),
  );

  const cambiar = (codigo: string, cambio: Partial<Eleccion>) =>
    setElecciones((actual) => ({ ...actual, [codigo]: { ...actual[codigo], ...cambio } }));

  const elegidos = productos.filter((p) => elecciones[p.idProducto]?.elegido);
  const todos = elegidos.length === productos.length;
  const unidadesElegidas = elegidos.reduce((total, p) => total + p.unidades, 0);
  const marcasNuevas = [
    ...new Set(elegidos.filter((p) => p.marcaNueva && p.marca).map((p) => p.marca!)),
  ].sort();

  const crear = () =>
    onDecidir({
      productos: 'crear',
      crear: elegidos.map((p) => {
        const { nombre, precio } = elecciones[p.idProducto];
        return {
          codigo: p.idProducto,
          nombre: nombre.trim(),
          precio: precio === '' ? null : Number(precio),
        };
      }),
    });

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          El archivo vende {plural(productos.length, 'producto', 'productos')} que no{' '}
          {productos.length === 1 ? 'está' : 'están'} en la app
        </DialogTitle>
        <DialogDescription>
          Se vendieron en {nombreDelMes(mes)} en puntos de venta de Tmk. Marca los que quieres
          crear: se crean con estos datos y sus ventas entran aunque no tengan meta. Los que no
          marques se omiten. Todavía no se ha guardado nada.
        </DialogDescription>
      </DialogHeader>

      <div className="max-h-[45dvh] overflow-auto rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  aria-label="Elegir todos"
                  checked={todos}
                  onCheckedChange={() =>
                    setElecciones((actual) =>
                      Object.fromEntries(
                        Object.entries(actual).map(([codigo, e]) => [
                          codigo,
                          { ...e, elegido: !todos },
                        ]),
                      ),
                    )
                  }
                />
              </TableHead>
              <TableHead>Código</TableHead>
              <TableHead className="min-w-64">Nombre</TableHead>
              <TableHead>Marca</TableHead>
              <TableHead className="text-right">Unidades</TableHead>
              <TableHead className="min-w-36">Precio Coltrade</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {productos.map((producto) => {
              const eleccion = elecciones[producto.idProducto];
              return (
                <TableRow
                  key={producto.idProducto}
                  data-state={eleccion.elegido ? 'selected' : undefined}
                >
                  <TableCell>
                    <Checkbox
                      aria-label={`Crear ${producto.nombreProducto}`}
                      checked={eleccion.elegido}
                      onCheckedChange={(marcado) =>
                        cambiar(producto.idProducto, { elegido: Boolean(marcado) })
                      }
                    />
                  </TableCell>
                  <TableCell className="font-mono text-xs">{producto.idProducto}</TableCell>
                  <TableCell>
                    <Input
                      aria-label={`Nombre de ${producto.idProducto}`}
                      className="h-8"
                      maxLength={60}
                      value={eleccion.nombre}
                      disabled={!eleccion.elegido}
                      placeholder={producto.nombreProducto}
                      onChange={(e) => cambiar(producto.idProducto, { nombre: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                      {producto.marca ?? <span className="text-muted-foreground">Sin marca</span>}
                      {producto.marcaNueva && <Badge variant="secondary">Nueva</Badge>}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatoNumero(producto.unidades)}
                  </TableCell>
                  <TableCell>
                    <Input
                      aria-label={`Precio Coltrade de ${producto.idProducto}`}
                      className="h-8 tabular-nums"
                      inputMode="numeric"
                      maxLength={9}
                      placeholder="Sin precio"
                      value={eleccion.precio}
                      disabled={!eleccion.elegido}
                      onChange={(e) =>
                        cambiar(producto.idProducto, { precio: e.target.value.replace(/\D/g, '') })
                      }
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="text-sm text-muted-foreground">
        {elegidos.length > 0 &&
          `Con ${elegidos.length === 1 ? 'el marcado' : 'los marcados'} entran ${plural(unidadesElegidas, 'unidad', 'unidades')} más. `}
        El informe no trae el precio Coltrade: escríbelo en pesos, sin puntos (va también como
        precio Tmk), o déjalo vacío y pónselo después en Productos. Mientras esté en $0, sus ventas
        cuentan en unidades pero no en dinero.
        {marcasNuevas.length > 0 &&
          ` También se ${marcasNuevas.length === 1 ? 'crea la marca' : 'crean las marcas'} ${marcasNuevas.join(', ')}.`}
      </p>

      {!puedeProductos && (
        <Alert>
          <AlertTitle>No puedes crear productos</AlertTitle>
          <AlertDescription>
            Tu usuario no tiene ese permiso en Tmk. Importa sin crearlos o pídele el permiso a un
            administrador.
          </AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onCancelar} disabled={cargando}>
          Cancelar
        </Button>
        <Button
          variant="outline"
          disabled={cargando}
          onClick={() => onDecidir({ productos: 'omitir' })}
        >
          {decisionEnCurso === 'omitir' && <Spinner data-icon="inline-start" />}
          Importar sin crearlos
        </Button>
        <Button disabled={cargando || !puedeProductos || elegidos.length === 0} onClick={crear}>
          {decisionEnCurso === 'crear' ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <PackagePlusIcon data-icon="inline-start" />
          )}
          {elegidos.length === 0
            ? 'Crear e importar'
            : `Crear ${plural(elegidos.length, 'producto', 'productos')} e importar`}
        </Button>
      </DialogFooter>
    </>
  );
}
