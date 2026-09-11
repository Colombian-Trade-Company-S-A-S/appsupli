import { useState } from 'react';
import { FileUpIcon, UploadIcon } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
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
  Separator,
  Spinner,
  ToggleGroup,
  ToggleGroupItem,
} from '@/shared/components/ui';
import { formatoNumero } from '@/shared/lib/formato';
import type { ModoImportacion, ResultadoInforme } from '../api';
import type { FuenteDatos } from '../fuente';
import { useBiTradeMutation } from '../hooks';
import { aValorMes, desdeValorMes, mesActual, nombreDelMes, type Mes } from './SelectorMes';

/**
 * Importa el informe del ERP: ventas del mes elegido e inventario completo.
 *
 * El mes se elige a mano y no se saca del archivo: el mismo informe puede
 * subirse tarde —estando en abril, cargar marzo— y quien importa es el que
 * sabe a qué periodo van esas ventas.
 *
 * `importar` es el del canal en el que se está: las ventas de Tmk van a las
 * tablas `_tmk`, no a las de Claro.
 */
export function ImportarInforme({
  importar: importarEnCanal,
}: {
  importar: NonNullable<FuenteDatos['importarInforme']>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [mes, setMes] = useState<Mes>(mesActual);
  const [modo, setModo] = useState<ModoImportacion>('completar');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [resultado, setResultado] = useState<ResultadoInforme | null>(null);

  const importar = useBiTradeMutation(
    () => importarEnCanal(archivo!, mes, modo),
    (datos) => datos.message,
  );

  const cerrar = () => {
    setAbierto(false);
    setArchivo(null);
    importar.reset();
  };

  return (
    <>
      <Button variant="outline" onClick={() => setAbierto(true)}>
        <FileUpIcon data-icon="inline-start" />
        Importar
      </Button>

      <Dialog open={abierto} onOpenChange={(v) => (v ? setAbierto(true) : cerrar())}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Importar informe de Coltrade</DialogTitle>
            <DialogDescription>
              El archivo del ERP, con su hoja «base». De ahí salen las ventas (CMv 601) y el
              inventario (CMv 1); el resto de los movimientos se ignora.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="informe-archivo">Archivo</FieldLabel>
              <Input
                id="informe-archivo"
                type="file"
                accept=".xlsx"
                onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              />
              <FieldDescription>
                {archivo
                  ? `${archivo.name} · ${formatoNumero(Math.round(archivo.size / 1024))} KB`
                  : 'Excel .xlsx tal como sale del ERP, sin modificar.'}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="informe-mes">Mes al que van las ventas</FieldLabel>
              <Input
                id="informe-mes"
                type="month"
                className="w-48"
                value={aValorMes(mes)}
                onChange={(e) => {
                  const elegido = desdeValorMes(e.target.value);
                  if (elegido) setMes(elegido);
                }}
              />
              <FieldDescription>
                Solo se cargan las ventas del archivo que caigan en {nombreDelMes(mes)}. El
                inventario no lleva fecha: se reemplaza completo.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Qué hacer con las ventas que ya están cargadas</FieldLabel>
              <ToggleGroup
                value={[modo]}
                onValueChange={(v) => setModo((v[0] as ModoImportacion) ?? 'completar')}
                variant="outline"
              >
                <ToggleGroupItem value="completar">Completar</ToggleGroupItem>
                <ToggleGroupItem value="sobrescribir">Sobrescribir</ToggleGroupItem>
              </ToggleGroup>
              <FieldDescription>
                {modo === 'completar'
                  ? 'Respeta los días que ya tienen ventas y solo llena los vacíos. Es lo normal: subir el informe cada tanto y agregar lo que falta.'
                  : `Borra TODAS las ventas de ${nombreDelMes(mes)} y deja únicamente lo que traiga el archivo.`}
              </FieldDescription>
            </Field>

            {modo === 'sobrescribir' && (
              <Alert variant="destructive">
                <AlertTitle>Se borran las ventas de {nombreDelMes(mes)}</AlertTitle>
                <AlertDescription>
                  Aunque el archivo solo traiga hasta la mitad del mes, el resto del mes queda en
                  cero. Esta acción no se puede deshacer.
                </AlertDescription>
              </Alert>
            )}

            <FieldDescription>
              Los productos y puntos de venta que no existan en la app se omiten: el informe no crea
              catálogo. Al terminar se dice cuántos quedaron fuera.
            </FieldDescription>
          </FieldGroup>

          <DialogFooter>
            <Button variant="outline" onClick={cerrar}>
              Cancelar
            </Button>
            <Button
              disabled={!archivo || importar.isPending}
              onClick={() =>
                importar.mutate(undefined, {
                  onSuccess: (datos) => {
                    setResultado(datos);
                    cerrar();
                  },
                })
              }
            >
              {importar.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <UploadIcon data-icon="inline-start" />
              )}
              {importar.isPending ? 'Leyendo el archivo…' : 'Importar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ResumenImportacion resultado={resultado} onCerrar={() => setResultado(null)} />
    </>
  );
}

/**
 * Qué entró y qué no.
 *
 * Se muestra siempre, no solo cuando hay problemas: en una carga de once mil
 * filas lo importante no es que «salió bien», es saber cuántas quedaron fuera
 * y por qué.
 */
function ResumenImportacion({
  resultado,
  onCerrar,
}: {
  resultado: ResultadoInforme | null;
  onCerrar: () => void;
}) {
  if (!resultado) return null;
  const { ventas, inventario } = resultado;

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importación terminada</DialogTitle>
          <DialogDescription>{resultado.message}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Bloque titulo={`Ventas de ${resultado.periodo}`}>
            <Renglon etiqueta="Registros creados" valor={ventas.creadas} destacado />
            <Renglon etiqueta="Unidades" valor={ventas.unidades} />
            {ventas.eliminadas > 0 && (
              <Renglon etiqueta="Registros borrados del mes" valor={ventas.eliminadas} />
            )}
            {ventas.omitidasPorDia > 0 && (
              <Renglon etiqueta="Omitidos: su día ya tenía ventas" valor={ventas.omitidasPorDia} />
            )}
            {ventas.fueraDelMes > 0 && (
              <Renglon etiqueta="Omitidos: de otro mes" valor={ventas.fueraDelMes} />
            )}
            {ventas.sinProducto > 0 && (
              <Renglon etiqueta="Omitidos: producto no está en la app" valor={ventas.sinProducto} />
            )}
            {ventas.sinPuntoVenta > 0 && (
              <Renglon
                etiqueta="Omitidos: punto de venta no está en la app"
                valor={ventas.sinPuntoVenta}
              />
            )}
            {ventas.diasCargados.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-xs text-muted-foreground">Días cargados:</span>
                {ventas.diasCargados.map((dia) => (
                  <Badge key={dia} variant="secondary">
                    {dia.slice(8)}
                  </Badge>
                ))}
              </div>
            )}
            {ventas.diasRespetados.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Días que ya tenían datos:</span>
                {ventas.diasRespetados.map((dia) => (
                  <Badge key={dia} variant="outline">
                    {dia.slice(8)}
                  </Badge>
                ))}
              </div>
            )}
          </Bloque>

          <Separator />

          <Bloque titulo="Inventario">
            {inventario.reemplazado ? (
              <>
                <Renglon etiqueta="Registros creados" valor={inventario.creados} destacado />
                <Renglon etiqueta="Unidades en stock" valor={inventario.unidades} />
                <Renglon etiqueta="Registros reemplazados" valor={inventario.eliminados} />
                {inventario.sinProducto > 0 && (
                  <Renglon
                    etiqueta="Omitidos: producto no está en la app"
                    valor={inventario.sinProducto}
                  />
                )}
                {inventario.sinPuntoVenta > 0 && (
                  <Renglon
                    etiqueta="Omitidos: punto de venta no está en la app"
                    valor={inventario.sinPuntoVenta}
                  />
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                El archivo no traía filas de inventario (CMv 1), así que el inventario cargado se
                dejó intacto.
              </p>
            )}
          </Bloque>
        </div>

        <DialogFooter>
          <Button onClick={onCerrar}>Entendido</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{titulo}</p>
      {children}
    </div>
  );
}

function Renglon({
  etiqueta,
  valor,
  destacado = false,
}: {
  etiqueta: string;
  valor: number;
  destacado?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{etiqueta}</span>
      <span className={destacado ? 'font-semibold tabular-nums' : 'tabular-nums'}>
        {formatoNumero(valor)}
      </span>
    </div>
  );
}
