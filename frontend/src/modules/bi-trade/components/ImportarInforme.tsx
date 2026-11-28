import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileUpIcon, MailIcon, UploadIcon } from 'lucide-react';
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
import type { DecisionInforme, ModoImportacion, PreguntaInforme, ResultadoInforme } from '../api';
import { informeDelCorreo, type InformeEnCorreo } from '../correo';
import { useFuente, type FuenteDatos } from '../fuente';
import { biTradeKeys, mensajeDeError } from '../hooks';
import { ElegirProductosInforme } from './ProductosDelInforme';
import { aValorMes, desdeValorMes, mesActual, nombreDelMes, type Mes } from './SelectorMes';

/**
 * Importa el informe del ERP: ventas del mes elegido e inventario completo.
 *
 * El mes se elige a mano y no se saca del archivo: el mismo informe puede
 * subirse tarde —estando en abril, cargar marzo— y quien importa es el que
 * sabe a qué periodo van esas ventas. Al traerlo del correo se propone el mes
 * de la fecha del nombre del adjunto, pero se puede cambiar igual.
 *
 * `importar` es el del canal en el que se está: las ventas de Tmk van a las
 * tablas `_tmk`, no a las de Claro.
 *
 * El archivo se puede elegir del equipo o traer del correo: «Traer del correo»
 * le pide al backend el último informe que llegó al buzón compartido (el mismo
 * para Claro y Tmk) y lo deja elegido. El archivo no pasa por el navegador: al
 * importar se mandan los identificadores del correo y el backend lo baja.
 *
 * En Tmk entra toda venta de un producto que exista, tenga meta o no. Si el
 * archivo vende productos que no existen, el backend no guarda nada y devuelve
 * la lista: el diálogo pasa a una segunda pantalla para elegir cuáles crear, y
 * al decidir se vuelve a subir el mismo archivo con la decisión.
 */
export function ImportarInforme({
  importar: importarEnCanal,
}: {
  importar: NonNullable<FuenteDatos['importarInforme']>;
}) {
  const { canal } = useFuente();
  const queryClient = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [mes, setMes] = useState<Mes>(mesActual);
  const [modo, setModo] = useState<ModoImportacion>('completar');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [resultado, setResultado] = useState<ResultadoInforme | null>(null);
  // El informe del buzón compartido, cuando se trajo del correo en vez de elegirlo.
  const [delCorreo, setDelCorreo] = useState<InformeEnCorreo | null>(null);
  // Solo Tmk: los productos del archivo que no existen, para elegir cuáles crear.
  const [pregunta, setPregunta] = useState<PreguntaInforme | null>(null);

  const importar = useMutation({
    mutationFn: (decision?: DecisionInforme) =>
      importarEnCanal(
        delCorreo ? { mensaje: delCorreo.mensaje, adjunto: delCorreo.adjunto } : archivo!,
        mes,
        modo,
        decision,
      ),
    onSuccess: (respuesta) => {
      if (respuesta.tipo === 'productos') {
        setPregunta(respuesta.pregunta);
        return;
      }
      void queryClient.invalidateQueries({ queryKey: biTradeKeys.todo });
      toast.success(respuesta.resultado.message);
      setResultado(respuesta.resultado);
      cerrar();
    },
    onError: (error) => toast.error(mensajeDeError(error)),
  });

  const traer = useMutation({
    mutationFn: informeDelCorreo,
    onSuccess: (informe) => {
      setDelCorreo(informe);
      setArchivo(null);
      // El mes sale de la fecha del nombre del archivo (AAAA-MM-DD); se puede cambiar.
      const fecha = informe.fechaArchivo ? desdeValorMes(informe.fechaArchivo.slice(0, 7)) : null;
      if (fecha) setMes(fecha);
    },
  });
  const errorDelCorreo = traer.error ? mensajeDeError(traer.error) : null;

  function cerrar() {
    setAbierto(false);
    setArchivo(null);
    setDelCorreo(null);
    setPregunta(null);
    importar.reset();
    traer.reset();
  }

  return (
    <>
      <Button variant="outline" onClick={() => setAbierto(true)}>
        <FileUpIcon data-icon="inline-start" />
        Importar
      </Button>

      <Dialog open={abierto} onOpenChange={(v) => (v ? setAbierto(true) : cerrar())}>
        <DialogContent
          className={`max-h-[85dvh] overflow-y-auto ${pregunta ? 'sm:max-w-4xl' : 'sm:max-w-xl'}`}
        >
          {pregunta ? (
            <ElegirProductosInforme
              pregunta={pregunta}
              mes={mes}
              cargando={importar.isPending}
              decisionEnCurso={importar.isPending ? importar.variables?.productos : undefined}
              onCancelar={cerrar}
              onDecidir={(decision) => importar.mutate(decision)}
            />
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Importar informe de Coltrade</DialogTitle>
                <DialogDescription>
                  El archivo del ERP, con su hoja «base». De ahí salen las ventas (CMv 601) y el
                  inventario (CMv 1); el resto de los movimientos se ignora.
                  {canal === 'claro' &&
                    ' Solo entran las ventas de productos con meta ese mes en ese punto de venta, y las de los productos del plan Recomiéndame Belkin: sube primero las metas del mes.'}
                  {canal === 'tmk' &&
                    ' Entran todas las ventas de los productos que existan en Tmk, tengan meta o no. Si el archivo vende productos que no están en la app, antes de importar te mostramos cuáles para que elijas cuáles crear.'}
                </DialogDescription>
              </DialogHeader>

              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="informe-archivo">Archivo</FieldLabel>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      id="informe-archivo"
                      type="file"
                      accept=".xlsx"
                      className="min-w-0 flex-1"
                      onChange={(e) => {
                        setArchivo(e.target.files?.[0] ?? null);
                        setDelCorreo(null);
                      }}
                    />
                    <Button
                      variant="secondary"
                      disabled={traer.isPending || importar.isPending}
                      onClick={() => traer.mutate()}
                    >
                      {traer.isPending ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <MailIcon data-icon="inline-start" />
                      )}
                      {traer.isPending ? 'Buscando…' : 'Traer del correo'}
                    </Button>
                  </div>
                  <FieldDescription>
                    {delCorreo
                      ? `Del correo del ${formatoFechaHora(new Date(delCorreo.recibido))} · ${delCorreo.nombre} · ${formatoNumero(Math.round(delCorreo.tamano / 1024))} KB`
                      : archivo
                        ? `${archivo.name} · ${formatoNumero(Math.round(archivo.size / 1024))} KB`
                        : 'Excel .xlsx tal como sale del ERP, sin modificar. O tráelo del correo: se busca el último informe que llegó al buzón de informes.'}
                  </FieldDescription>
                  {errorDelCorreo && (
                    <Alert variant="destructive">
                      <AlertTitle>No se trajo el informe del correo</AlertTitle>
                      <AlertDescription>{errorDelCorreo}</AlertDescription>
                    </Alert>
                  )}
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
                      Aunque el archivo solo traiga hasta la mitad del mes, el resto del mes queda
                      en cero. Esta acción no se puede deshacer.
                    </AlertDescription>
                  </Alert>
                )}

                <FieldDescription>
                  {canal === 'tmk'
                    ? 'Los puntos de venta que no existan en la app se omiten. Los productos que falten se te muestran para que elijas cuáles crear. Al terminar se dice cuántos quedaron fuera.'
                    : 'Los productos y puntos de venta que no existan en la app se omiten: el informe no crea catálogo. Al terminar se dice cuántos quedaron fuera.'}
                </FieldDescription>
              </FieldGroup>

              <DialogFooter>
                <Button variant="outline" onClick={cerrar}>
                  Cancelar
                </Button>
                <Button
                  disabled={(!archivo && !delCorreo) || importar.isPending}
                  onClick={() => importar.mutate(undefined)}
                >
                  {importar.isPending ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <UploadIcon data-icon="inline-start" />
                  )}
                  {importar.isPending ? 'Leyendo el archivo…' : 'Importar'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ResumenImportacion resultado={resultado} onCerrar={() => setResultado(null)} />
    </>
  );
}

const formatoFechaHora = (fecha: Date) =>
  fecha.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });

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
  const { ventas, inventario, belkin } = resultado;
  const productosCreados = resultado.productosCreados ?? 0;
  const sinPrecio = resultado.productosSinPrecio ?? 0;
  const marcasCreadas = resultado.marcasCreadas ?? [];

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importación terminada</DialogTitle>
          <DialogDescription>{resultado.message}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {productosCreados > 0 && (
            <>
              <Bloque titulo="Productos nuevos">
                <Renglon etiqueta="Productos creados" valor={productosCreados} destacado />
                {sinPrecio > 0 && (
                  <Renglon
                    etiqueta="Quedaron en $0: ponles precio en Productos"
                    valor={sinPrecio}
                  />
                )}
                {marcasCreadas.length > 0 && (
                  <Renglon etiqueta="Marcas creadas" valor={marcasCreadas.length} />
                )}
              </Bloque>
              <Separator />
            </>
          )}

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
            {ventas.sinMeta > 0 && (
              <Renglon
                etiqueta="Omitidos: sin meta ese mes en ese punto de venta"
                valor={ventas.sinMeta}
              />
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

          {belkin && (
            <>
              <Separator />
              <Bloque titulo="Plan Recomiéndame Belkin · puntos fuera de Coltrade">
                <Renglon etiqueta="Registros creados" valor={belkin.creados} destacado />
                {belkin.eliminados > 0 && (
                  <Renglon
                    etiqueta="Registros del informe reemplazados"
                    valor={belkin.eliminados}
                  />
                )}
                {belkin.omitidosPorDia > 0 && (
                  <Renglon
                    etiqueta="Omitidos: su día ya tenía registros del informe"
                    valor={belkin.omitidosPorDia}
                  />
                )}
                {belkin.puntos.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-xs text-muted-foreground">Puntos:</span>
                    {belkin.puntos.map((punto) => (
                      <Badge key={punto} variant="secondary">
                        {punto}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  belkin.creados === 0 && (
                    <p className="text-sm text-muted-foreground">
                      El archivo no traía ventas de productos del plan en puntos fuera de Coltrade.
                    </p>
                  )
                )}
              </Bloque>
            </>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onCerrar}>Entendido</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{titulo}</p>
      {children}
    </div>
  );
}

export function Renglon({
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
