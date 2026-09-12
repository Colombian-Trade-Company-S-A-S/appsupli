import { useMemo, useState, type ComponentType, type FormEvent, type ReactNode } from 'react';
import {
  CalendarIcon,
  CheckIcon,
  CircleCheckIcon,
  EraserIcon,
  IdCardIcon,
  MapPinIcon,
  ReceiptIcon,
  ScanBarcodeIcon,
  SmartphoneIcon,
  SparklesIcon,
} from 'lucide-react';
import {
  Badge,
  Button,
  Field,
  FieldDescription,
  FieldLabel,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Spinner,
} from '@/shared/components/ui';
import { formatoMoneda } from '@/shared/lib/formato';
import { cn } from '@/shared/lib/utils';
import type { OpcionesPartners, RegistroPartnerPayload } from '../api';
import { CampoSelect } from './CampoSelect';

const hoy = () => new Date().toISOString().slice(0, 10);

/** Lo que se escribe en pantalla: todo texto, aunque la regional viaje como id. */
interface Campos {
  idRegional: string;
  marca: string;
  idPuntoVenta: string;
  idProducto: string;
  fechaRecomendacion: string;
  serial: string;
  documentoPromotor: string;
  factura: string;
}

const VACIO: Campos = {
  idRegional: '',
  marca: '',
  idPuntoVenta: '',
  idProducto: '',
  fechaRecomendacion: hoy(),
  serial: '',
  documentoPromotor: '',
  factura: '',
};

/** Los ocho campos del registro, en el orden en que se llenan. */
const CAMPOS = Object.keys(VACIO) as Array<keyof Campos>;

/**
 * Un paso del formulario: número, título y sus campos.
 *
 * El número se vuelve un visto cuando el paso queda completo. Es la única
 * señal de avance dentro del formulario: quien diligencia ve de un vistazo
 * qué le falta sin tener que intentar guardar.
 */
function Paso({
  numero,
  icono: Icono,
  titulo,
  ayuda,
  completo,
  ultimo = false,
  children,
}: {
  numero: number;
  icono: ComponentType<{ className?: string }>;
  titulo: string;
  ayuda: string;
  completo: boolean;
  ultimo?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="flex gap-3 sm:gap-4">
      {/* Riel del paso: la ficha y la línea que lo une con el siguiente. */}
      <div className="flex flex-col items-center">
        <span
          aria-hidden
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors',
            completo
              ? 'border-primary bg-primary text-primary-foreground'
              : 'bg-background text-muted-foreground',
          )}
        >
          {completo ? <CheckIcon className="size-3.5" /> : numero}
        </span>
        {!ultimo && <span aria-hidden className="mt-1 w-px flex-1 bg-border" />}
      </div>

      <div className={cn('min-w-0 flex-1', ultimo ? 'pb-0' : 'pb-6')}>
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Icono className="size-4 text-muted-foreground" />
          {titulo}
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{ayuda}</p>
        <div className="mt-3">{children}</div>
      </div>
    </section>
  );
}

/**
 * El formulario de una recomendación del plan Partners.
 *
 * Lo usan las dos entradas —la de la app y la del enlace público— para que
 * sean el mismo formulario de verdad: si cambia un campo o una ayuda, cambia
 * en los dos lados. Quien lo monta decide a dónde se envía.
 */
export function FormularioRecomendacion({
  opciones,
  guardando,
  onEnviar,
}: {
  opciones?: OpcionesPartners;
  guardando: boolean;
  onEnviar: (payload: RegistroPartnerPayload) => Promise<unknown>;
}) {
  const [datos, setDatos] = useState<Campos>(VACIO);
  /** Lo último guardado en esta sesión: confirma sin tapar el formulario. */
  const [ultimo, setUltimo] = useState<{ serial: string; punto: string; total: number } | null>(
    null,
  );

  // Solo los puntos de la regional elegida: eso resolvían las tres preguntas
  // «zona sur / zona norte / zona costa» del formulario anterior.
  const puntos = useMemo(
    () =>
      (opciones?.puntosVenta ?? [])
        .filter((punto) => !datos.idRegional || String(punto.idRegional) === datos.idRegional)
        .map((punto) => ({ value: punto.value, label: punto.label })),
    [opciones, datos.idRegional],
  );

  const regionales = useMemo(
    () =>
      (opciones?.regionales ?? []).map((regional) => ({
        value: String(regional.value),
        label: regional.label,
      })),
    [opciones],
  );

  const producto = opciones?.productos.find((p) => p.value === datos.idProducto);
  const listos = CAMPOS.filter((campo) => datos[campo].trim() !== '').length;
  const avance = Math.round((listos / CAMPOS.length) * 100);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await onEnviar({ ...datos, idRegional: Number(datos.idRegional) });
      const punto = puntos.find((p) => p.value === datos.idPuntoVenta);
      setUltimo((anterior) => ({
        serial: datos.serial,
        punto: punto?.label ?? '',
        total: (anterior?.total ?? 0) + 1,
      }));
      // Un promotor registra varios equipos seguidos en el mismo punto: se
      // conserva el encabezado y se limpia solo lo que cambia en cada uno.
      setDatos((actuales) => ({ ...actuales, serial: '', factura: '' }));
    } catch {
      // El aviso del error lo da quien envía, con su propio toast.
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {/* Avance: cuántos campos van de los ocho. */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="font-medium">
            {listos} de {CAMPOS.length} campos
          </span>
          <span className="text-muted-foreground">
            {listos === CAMPOS.length ? 'Listo para guardar' : 'Todos son obligatorios'}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${avance}%` }}
          />
        </div>
      </div>

      <div className="flex flex-col">
        <Paso
          numero={1}
          icono={MapPinIcon}
          titulo="Dónde se hizo"
          ayuda="Elige la regional y te aparecen solo sus puntos de venta."
          completo={!!datos.idRegional && !!datos.idPuntoVenta}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoSelect
              id="par-regional"
              label="Regional"
              placeholder="Selecciona la regional"
              className="min-w-0"
              value={datos.idRegional}
              onChange={(idRegional) =>
                // Al cambiar de regional el punto anterior ya no aplica.
                setDatos({ ...datos, idRegional, idPuntoVenta: '' })
              }
              opciones={regionales}
              incluirTodas={false}
            />

            <CampoSelect
              id="par-punto"
              label="Punto de venta"
              placeholder={datos.idRegional ? 'Selecciona el punto' : 'Elige primero la regional'}
              className="min-w-0"
              value={datos.idPuntoVenta}
              onChange={(idPuntoVenta) => setDatos({ ...datos, idPuntoVenta })}
              opciones={puntos}
              incluirTodas={false}
            />
          </div>
        </Paso>

        <Paso
          numero={2}
          icono={SmartphoneIcon}
          titulo="Qué se recomendó"
          ayuda="La marca del equipo del cliente y el protector que se instaló."
          completo={!!datos.marca && !!datos.idProducto}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoSelect
              id="par-marca"
              label="Marca del equipo"
              placeholder="Selecciona la marca"
              className="min-w-0"
              value={datos.marca}
              onChange={(marca) => setDatos({ ...datos, marca })}
              opciones={opciones?.marcas ?? []}
              incluirTodas={false}
            />

            <div className="flex min-w-0 flex-col gap-1.5">
              <CampoSelect
                id="par-producto"
                label="Producto recomendado"
                placeholder="Selecciona el producto"
                className="min-w-0"
                value={datos.idProducto}
                onChange={(idProducto) => setDatos({ ...datos, idProducto })}
                opciones={opciones?.productos ?? []}
                incluirTodas={false}
              />
              {producto && (
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <Badge variant="secondary" className="font-mono">
                    {producto.value}
                  </Badge>
                  {producto.precio > 0 && <span>Precio {formatoMoneda(producto.precio)}</span>}
                </p>
              )}
            </div>
          </div>
        </Paso>

        <Paso
          numero={3}
          icono={ReceiptIcon}
          titulo="Datos de la venta"
          ayuda="Lo que permite verificar el registro después: serial, documento y factura."
          completo={
            !!datos.fechaRecomendacion &&
            !!datos.serial &&
            !!datos.documentoPromotor &&
            !!datos.factura
          }
          ultimo
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field className="min-w-0">
              <FieldLabel htmlFor="par-fecha">Fecha de recomendación</FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <CalendarIcon />
                </InputGroupAddon>
                <InputGroupInput
                  id="par-fecha"
                  type="date"
                  max={hoy()}
                  value={datos.fechaRecomendacion}
                  onChange={(e) => setDatos({ ...datos, fechaRecomendacion: e.target.value })}
                  required
                />
              </InputGroup>
              <FieldDescription>No puede ser una fecha futura.</FieldDescription>
            </Field>

            <Field className="min-w-0">
              <FieldLabel htmlFor="par-serial">Número de serial</FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <ScanBarcodeIcon />
                </InputGroupAddon>
                <InputGroupInput
                  id="par-serial"
                  maxLength={40}
                  autoComplete="off"
                  placeholder="RZ8N70ABCDE"
                  value={datos.serial}
                  onChange={(e) => setDatos({ ...datos, serial: e.target.value })}
                  required
                />
              </InputGroup>
              <FieldDescription>Si ya estaba registrado, te avisamos al guardar.</FieldDescription>
            </Field>

            <Field className="min-w-0">
              <FieldLabel htmlFor="par-documento">Documento del promotor</FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <IdCardIcon />
                </InputGroupAddon>
                <InputGroupInput
                  id="par-documento"
                  inputMode="numeric"
                  maxLength={20}
                  autoComplete="off"
                  placeholder="1092389375"
                  value={datos.documentoPromotor}
                  onChange={(e) => setDatos({ ...datos, documentoPromotor: e.target.value })}
                  required
                />
              </InputGroup>
              <FieldDescription>Solo números, sin puntos.</FieldDescription>
            </Field>

            <Field className="min-w-0">
              <FieldLabel htmlFor="par-factura">Factura</FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <ReceiptIcon />
                </InputGroupAddon>
                <InputGroupInput
                  id="par-factura"
                  maxLength={40}
                  autoComplete="off"
                  placeholder="FE-10234"
                  value={datos.factura}
                  onChange={(e) => setDatos({ ...datos, factura: e.target.value })}
                  required
                />
              </InputGroup>
              <FieldDescription>El número que quedó en el sistema de la tienda.</FieldDescription>
            </Field>
          </div>
        </Paso>
      </div>

      {/* La barra de acciones se queda a la vista al hacer scroll en el móvil. */}
      <div className="sticky bottom-0 -mx-2 flex flex-wrap items-center gap-2 border-t bg-background/95 px-2 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <Button type="submit" disabled={guardando || !opciones}>
          {guardando ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <CheckIcon data-icon="inline-start" />
          )}
          Guardar recomendación
        </Button>
        <Button type="button" variant="ghost" onClick={() => setDatos(VACIO)}>
          <EraserIcon data-icon="inline-start" />
          Limpiar
        </Button>
        {ultimo && (
          <Badge variant="secondary" className="ml-auto gap-1.5">
            <SparklesIcon className="size-3.5" />
            {ultimo.total} guardado{ultimo.total === 1 ? '' : 's'} en esta sesión
          </Badge>
        )}
      </div>

      {ultimo && (
        <p
          role="status"
          className="flex flex-wrap items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs"
        >
          <CircleCheckIcon className="size-4 text-primary" />
          <span className="font-medium">Serial {ultimo.serial} registrado</span>
          {ultimo.punto && <span className="text-muted-foreground">en {ultimo.punto}.</span>}
          <span className="text-muted-foreground">
            Sigue con el próximo equipo: dejamos puesto el punto de venta.
          </span>
        </p>
      )}
    </form>
  );
}
