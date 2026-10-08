import { useMemo, useState, type FormEvent } from 'react';
import {
  CalendarIcon,
  CheckIcon,
  CircleCheckIcon,
  EraserIcon,
  MapPinIcon,
  MessageSquareTextIcon,
  PackageIcon,
  UserRoundIcon,
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
  Textarea,
} from '@/shared/components/ui';
import type { OpcionesBelkin, RegistroBelkinPayload } from '../api';
import { CampoSelect } from './CampoSelect';
import { Paso } from './FormularioRecomendacion';

const hoy = () => new Date().toISOString().slice(0, 10);

/** Lo que se escribe en pantalla: todo texto, aunque los ids viajen como número. */
interface Campos {
  idRegional: string;
  idPuntoVenta: string;
  idAsesor: string;
  fechaRecomendacion: string;
  idCategoria: string;
  idProducto: string;
  observacion: string;
}

const VACIO: Campos = {
  idRegional: '',
  idPuntoVenta: '',
  idAsesor: '',
  fechaRecomendacion: hoy(),
  idCategoria: '',
  idProducto: '',
  observacion: '',
};

/** Los campos que no pueden quedar en blanco. */
const OBLIGATORIOS: Array<keyof Campos> = [
  'idRegional',
  'idPuntoVenta',
  'fechaRecomendacion',
  'idCategoria',
  'idProducto',
];

/**
 * El formulario de una recomendación del plan Recomiéndame Belkin.
 *
 * Lo usan las dos entradas —la de la app y la del enlace público— para que
 * sean el mismo formulario de verdad. Quien lo monta decide a dónde se envía.
 */
export function FormularioBelkin({
  opciones,
  guardando,
  onEnviar,
}: {
  opciones?: OpcionesBelkin;
  guardando: boolean;
  onEnviar: (payload: RegistroBelkinPayload) => Promise<unknown>;
}) {
  const [datos, setDatos] = useState<Campos>(VACIO);
  const [ultimo, setUltimo] = useState<{ producto: string; total: number } | null>(null);

  // Cada lista se filtra con la anterior, como las columnas «Zona Norte /
  // Zona Sur» y «Case Apple / Lámina / Cable / Cargador» del formulario viejo.
  const regionales = useMemo(
    () => (opciones?.regionales ?? []).map((r) => ({ value: String(r.value), label: r.label })),
    [opciones],
  );
  const puntos = useMemo(
    () =>
      (opciones?.puntosVenta ?? [])
        .filter((p) => String(p.idRegional) === datos.idRegional)
        .map((p) => ({ value: p.value, label: p.label })),
    [opciones, datos.idRegional],
  );
  const asesores = useMemo(
    () =>
      (opciones?.asesores ?? [])
        .filter((a) => a.idPuntoVenta === datos.idPuntoVenta)
        .map((a) => ({ value: String(a.value), label: a.label })),
    [opciones, datos.idPuntoVenta],
  );
  const categorias = useMemo(
    () => (opciones?.categorias ?? []).map((c) => ({ value: String(c.value), label: c.label })),
    [opciones],
  );
  const productos = useMemo(
    () =>
      (opciones?.productos ?? [])
        .filter((p) => String(p.idCategoria) === datos.idCategoria)
        .map((p) => ({ value: p.value, label: p.label })),
    [opciones, datos.idCategoria],
  );

  const listos = OBLIGATORIOS.filter((campo) => datos[campo].trim() !== '').length;
  const avance = Math.round((listos / OBLIGATORIOS.length) * 100);
  const completo = listos === OBLIGATORIOS.length;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!completo) return;
    try {
      await onEnviar({
        idPuntoVenta: datos.idPuntoVenta,
        idAsesor: datos.idAsesor ? Number(datos.idAsesor) : null,
        idProducto: datos.idProducto,
        fechaRecomendacion: datos.fechaRecomendacion,
        observacion: datos.observacion,
      });
      const producto = productos.find((p) => p.value === datos.idProducto);
      setUltimo((anterior) => ({
        producto: producto?.label ?? '',
        total: (anterior?.total ?? 0) + 1,
      }));
      // Se conserva dónde y quién: lo siguiente suele ser otra venta del mismo
      // asesor en el mismo punto.
      setDatos((actuales) => ({ ...actuales, idProducto: '', observacion: '' }));
    } catch {
      // El aviso del error lo da la mutación con su propio toast.
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="font-medium">
            {listos} de {OBLIGATORIOS.length} obligatorios
          </span>
          <span className="text-muted-foreground">
            {completo ? 'Listo para guardar' : 'Asesor y observación son opcionales'}
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
              id="bel-regional"
              label="Regional"
              placeholder="Selecciona la regional"
              className="min-w-0"
              value={datos.idRegional}
              onChange={(idRegional) =>
                setDatos({ ...datos, idRegional, idPuntoVenta: '', idAsesor: '' })
              }
              opciones={regionales}
              incluirTodas={false}
            />
            <CampoSelect
              id="bel-punto"
              label="Punto de venta"
              placeholder={datos.idRegional ? 'Selecciona el punto' : 'Elige primero la regional'}
              className="min-w-0"
              value={datos.idPuntoVenta}
              onChange={(idPuntoVenta) => setDatos({ ...datos, idPuntoVenta, idAsesor: '' })}
              opciones={puntos}
              incluirTodas={false}
            />
          </div>
        </Paso>

        <Paso
          numero={2}
          icono={UserRoundIcon}
          titulo="Quién y cuándo"
          ayuda="La fecha de la recomendación y el asesor Apple que la hizo."
          completo={!!datos.fechaRecomendacion}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field className="min-w-0">
              <FieldLabel htmlFor="bel-fecha">Fecha de la recomendación</FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <CalendarIcon />
                </InputGroupAddon>
                <InputGroupInput
                  id="bel-fecha"
                  type="date"
                  max={hoy()}
                  value={datos.fechaRecomendacion}
                  onChange={(e) => setDatos({ ...datos, fechaRecomendacion: e.target.value })}
                  required
                />
              </InputGroup>
              <FieldDescription>No puede ser una fecha futura.</FieldDescription>
            </Field>

            <div className="flex min-w-0 flex-col gap-1.5">
              <CampoSelect
                id="bel-asesor"
                label="Asesor Apple (opcional)"
                placeholder="Sin asesor"
                className="min-w-0"
                value={datos.idAsesor}
                onChange={(idAsesor) => setDatos({ ...datos, idAsesor })}
                opciones={asesores}
              />
              <p className="text-xs text-muted-foreground">
                {!datos.idPuntoVenta
                  ? 'Elige primero el punto de venta.'
                  : asesores.length === 0
                    ? 'Este punto no tiene asesores cargados.'
                    : `${asesores.length} asesor${asesores.length === 1 ? '' : 'es'} en este punto.`}
              </p>
            </div>
          </div>
        </Paso>

        <Paso
          numero={3}
          icono={PackageIcon}
          titulo="Qué se recomendó"
          ayuda="Elige la categoría y te aparecen solo sus productos."
          completo={!!datos.idCategoria && !!datos.idProducto}
        >
          <div className="grid gap-4 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
            <CampoSelect
              id="bel-categoria"
              label="Categoría"
              placeholder="Selecciona la categoría"
              className="min-w-0"
              value={datos.idCategoria}
              onChange={(idCategoria) => setDatos({ ...datos, idCategoria, idProducto: '' })}
              opciones={categorias}
              incluirTodas={false}
            />
            <CampoSelect
              id="bel-producto"
              label="Producto"
              placeholder={
                datos.idCategoria ? 'Selecciona el producto' : 'Elige primero la categoría'
              }
              className="min-w-0"
              value={datos.idProducto}
              onChange={(idProducto) => setDatos({ ...datos, idProducto })}
              opciones={productos}
              incluirTodas={false}
            />
          </div>
        </Paso>

        <Paso
          numero={4}
          icono={MessageSquareTextIcon}
          titulo="¿Alguna observación?"
          ayuda="Es opcional."
          completo={!!datos.observacion.trim()}
          ultimo
        >
          <Textarea
            id="bel-observacion"
            aria-label="Observación"
            rows={3}
            maxLength={1000}
            value={datos.observacion}
            onChange={(e) => setDatos({ ...datos, observacion: e.target.value })}
          />
        </Paso>
      </div>

      <div className="sticky bottom-0 -mx-2 flex flex-wrap items-center gap-2 border-t bg-background/95 px-2 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <Button type="submit" disabled={guardando || !opciones || !completo}>
          {guardando ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <CheckIcon data-icon="inline-start" />
          )}
          Guardar recomendación
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setDatos({ ...VACIO, fechaRecomendacion: hoy() })}
        >
          <EraserIcon data-icon="inline-start" />
          Limpiar
        </Button>
        {ultimo && (
          <Badge variant="secondary" className="ml-auto">
            {ultimo.total} guardada{ultimo.total === 1 ? '' : 's'} en esta sesión
          </Badge>
        )}
      </div>

      {ultimo && (
        <p
          role="status"
          className="flex flex-wrap items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs"
        >
          <CircleCheckIcon className="size-4 text-primary" />
          <span className="font-medium">Guardado: {ultimo.producto}.</span>
          <span className="text-muted-foreground">
            Dejamos puestos el punto, el asesor y la categoría para la siguiente.
          </span>
        </p>
      )}
    </form>
  );
}
