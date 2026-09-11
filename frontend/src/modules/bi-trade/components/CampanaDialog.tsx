import { useEffect, useState, type FormEvent } from 'react';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import {
  Badge,
  Button,
  Checkbox,
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
  FieldSet,
  Input,
  Separator,
  Spinner,
  Switch,
} from '@/shared/components/ui';
import { biTradeApi, type Campana, type CampanaPayload } from '../api';
import { useBiTradeMutation, useProductos } from '../hooks';

/** Una campaña nueva: los valores del afiche, que son los de siempre. */
const vacia = (): CampanaPayload => ({
  nombre: '',
  desde: new Date().toISOString().slice(0, 10),
  hasta: new Date().toISOString().slice(0, 10),
  activa: true,
  ventasMinimas: 120,
  ticketsMinimos: 3,
  productosFoco: [],
  focoMinimo: 5,
  productosCargador: [],
  bonoVentas: 20,
  bonoCargadores: 5,
  bonoTickets: 3,
  escalas: [
    { ventas: 10, tickets: 1 },
    { ventas: 12, tickets: 2 },
    { ventas: 15, tickets: 3 },
  ],
  aceleradores: [
    { ventasTotales: 150, ticketsPorDia: 1 },
    { ventasTotales: 200, ticketsPorDia: 2 },
  ],
});

/**
 * Crea o edita las reglas del concurso.
 *
 * Todo se guarda de una sola vez —escalas y aceleradores incluidos— porque una
 * campaña a medio configurar calcularía tickets equivocados sin avisar.
 */
export function CampanaDialog({
  abierto,
  onOpenChange,
  campana,
  onGuardada,
}: {
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
  campana: Campana | null;
  onGuardada?: (id: number) => void;
}) {
  const editando = !!campana;
  const [datos, setDatos] = useState<CampanaPayload>(vacia);
  const { data: productos = [] } = useProductos();

  const guardar = useBiTradeMutation(
    (payload: CampanaPayload) =>
      editando
        ? biTradeApi.campanas.update(campana.idCampana, payload)
        : biTradeApi.campanas.create(payload),
    editando ? 'Reglas actualizadas' : 'Campaña creada',
  );

  useEffect(() => {
    if (!abierto) return;
    setDatos(
      campana
        ? {
            nombre: campana.nombre,
            desde: campana.desde,
            hasta: campana.hasta,
            activa: campana.activa,
            ventasMinimas: campana.ventasMinimas,
            ticketsMinimos: campana.ticketsMinimos,
            productosFoco: campana.productosFoco,
            focoMinimo: campana.focoMinimo,
            productosCargador: campana.productosCargador,
            bonoVentas: campana.bonoVentas,
            bonoCargadores: campana.bonoCargadores,
            bonoTickets: campana.bonoTickets,
            escalas: campana.escalas.map((e) => ({ ventas: e.ventas, tickets: e.tickets })),
            aceleradores: campana.aceleradores.map((a) => ({
              ventasTotales: a.ventasTotales,
              ticketsPorDia: a.ticketsPorDia,
            })),
          }
        : vacia(),
    );
  }, [abierto, campana]);

  const alternar = (lista: string[], codigo: string) =>
    lista.includes(codigo) ? lista.filter((c) => c !== codigo) : [...lista, codigo];

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    guardar.mutate(datos, {
      onSuccess: (creada) => {
        onGuardada?.(creada.idCampana);
        onOpenChange(false);
      },
    });
  };

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editando ? 'Reglas del concurso' : 'Nueva campaña'}</DialogTitle>
          <DialogDescription>
            Las reglas son datos, no código: cambian cada campaña y el tablero recalcula con lo que
            quede guardado aquí.
          </DialogDescription>
        </DialogHeader>

        <form id="campana-form" onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="campana-nombre">Nombre</FieldLabel>
              <Input
                id="campana-nombre"
                value={datos.nombre}
                placeholder="Vamos por todo · ago-sep 2026"
                onChange={(e) => setDatos({ ...datos, nombre: e.target.value })}
                required
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="campana-desde">Vigente desde</FieldLabel>
                <Input
                  id="campana-desde"
                  type="date"
                  value={datos.desde}
                  onChange={(e) => setDatos({ ...datos, desde: e.target.value })}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="campana-hasta">Hasta</FieldLabel>
                <Input
                  id="campana-hasta"
                  type="date"
                  value={datos.hasta}
                  onChange={(e) => setDatos({ ...datos, hasta: e.target.value })}
                  required
                />
              </Field>
              <Field orientation="horizontal">
                <Switch
                  id="campana-activa"
                  checked={datos.activa}
                  onCheckedChange={(v) => setDatos({ ...datos, activa: !!v })}
                />
                <FieldLabel htmlFor="campana-activa">Activa</FieldLabel>
              </Field>
            </div>

            <Separator />

            <FieldSet>
              <FieldLabel>Condición para participar</FieldLabel>
              <div className="grid gap-4 sm:grid-cols-2">
                <Numero
                  id="campana-ventas-min"
                  label="Ventas totales mínimas"
                  value={datos.ventasMinimas}
                  onChange={(v) => setDatos({ ...datos, ventasMinimas: v })}
                />
                <Numero
                  id="campana-tickets-min"
                  label="Tickets mínimos"
                  value={datos.ticketsMinimos}
                  onChange={(v) => setDatos({ ...datos, ticketsMinimos: v })}
                />
              </div>
              <FieldDescription>Hay que cumplir las dos para entrar al sorteo.</FieldDescription>
            </FieldSet>

            <FieldSet>
              <FieldLabel>Escalas diarias</FieldLabel>
              <FieldDescription>
                Se aplica la más alta que alcancen las ventas del día.
              </FieldDescription>
              <Tramos
                filas={datos.escalas.map((e) => [e.ventas, e.tickets])}
                etiquetas={['Ventas del día', 'Tickets']}
                onChange={(filas) =>
                  setDatos({
                    ...datos,
                    escalas: filas.map(([ventas, tickets]) => ({ ventas, tickets })),
                  })
                }
              />
            </FieldSet>

            <FieldSet>
              <FieldLabel>Acelerador</FieldLabel>
              <FieldDescription>
                Tickets extra por cada día cumplido, si el total de la campaña pasa el umbral.
              </FieldDescription>
              <Tramos
                filas={datos.aceleradores.map((a) => [a.ventasTotales, a.ticketsPorDia])}
                etiquetas={['Ventas totales', 'Tickets por día']}
                onChange={(filas) =>
                  setDatos({
                    ...datos,
                    aceleradores: filas.map(([ventasTotales, ticketsPorDia]) => ({
                      ventasTotales,
                      ticketsPorDia,
                    })),
                  })
                }
              />
            </FieldSet>

            <Separator />

            <FieldSet>
              <FieldLabel>Doble ticket por producto foco</FieldLabel>
              <FieldDescription>
                «Bluelight» y «Privacy» son categorías del concurso, no del catálogo: hay que marcar
                a mano qué productos cuentan.
              </FieldDescription>
              <Numero
                id="campana-foco-min"
                label="Mínimo de unidades foco al día"
                value={datos.focoMinimo}
                onChange={(v) => setDatos({ ...datos, focoMinimo: v })}
                ayuda="0 apaga el doble ticket."
              />
              <ListaProductos
                nombre="foco"
                productos={productos}
                elegidos={datos.productosFoco}
                onToggle={(codigo) =>
                  setDatos({ ...datos, productosFoco: alternar(datos.productosFoco, codigo) })
                }
              />
            </FieldSet>

            <FieldSet>
              <FieldLabel>Bono por venta alta con cargadores</FieldLabel>
              <div className="grid gap-4 sm:grid-cols-3">
                <Numero
                  id="campana-bono-ventas"
                  label="Ventas del día"
                  value={datos.bonoVentas}
                  onChange={(v) => setDatos({ ...datos, bonoVentas: v })}
                />
                <Numero
                  id="campana-bono-carg"
                  label="Cargadores del día"
                  value={datos.bonoCargadores}
                  onChange={(v) => setDatos({ ...datos, bonoCargadores: v })}
                />
                <Numero
                  id="campana-bono-tickets"
                  label="Tickets del bono"
                  value={datos.bonoTickets}
                  onChange={(v) => setDatos({ ...datos, bonoTickets: v })}
                />
              </div>
              <FieldDescription>
                Se suman a los de la escala, no la reemplazan. 0 tickets apaga el bono.
              </FieldDescription>
              <ListaProductos
                nombre="cargador"
                productos={productos}
                elegidos={datos.productosCargador}
                onToggle={(codigo) =>
                  setDatos({
                    ...datos,
                    productosCargador: alternar(datos.productosCargador, codigo),
                  })
                }
              />
            </FieldSet>
          </FieldGroup>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="campana-form"
            disabled={guardar.isPending || !datos.nombre.trim()}
          >
            {guardar.isPending && <Spinner data-icon="inline-start" />}
            {editando ? 'Guardar reglas' : 'Crear campaña'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Numero({
  id,
  label,
  value,
  onChange,
  ayuda,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (valor: number) => void;
  ayuda?: string;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="number"
        min={0}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {ayuda && <FieldDescription>{ayuda}</FieldDescription>}
    </Field>
  );
}

/** Editor de una lista de tramos «umbral → tickets». */
function Tramos({
  filas,
  etiquetas,
  onChange,
}: {
  filas: Array<[number, number]>;
  etiquetas: [string, string];
  onChange: (filas: Array<[number, number]>) => void;
}) {
  const cambiar = (indice: number, columna: 0 | 1, valor: number) =>
    onChange(
      filas.map((fila, i) =>
        i === indice
          ? ((columna === 0 ? [valor, fila[1]] : [fila[0], valor]) as [number, number])
          : fila,
      ),
    );

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs text-muted-foreground">
        <span>{etiquetas[0]}</span>
        <span>{etiquetas[1]}</span>
        <span className="w-8" />
      </div>
      {filas.map((fila, indice) => (
        <div key={indice} className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <Input
            type="number"
            min={0}
            value={fila[0]}
            aria-label={etiquetas[0]}
            onChange={(e) => cambiar(indice, 0, Number(e.target.value))}
          />
          <Input
            type="number"
            min={0}
            value={fila[1]}
            aria-label={etiquetas[1]}
            onChange={(e) => cambiar(indice, 1, Number(e.target.value))}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Quitar el tramo"
            onClick={() => onChange(filas.filter((_, i) => i !== indice))}
          >
            <Trash2Icon />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() => onChange([...filas, [0, 0]])}
      >
        <PlusIcon data-icon="inline-start" />
        Agregar tramo
      </Button>
    </div>
  );
}

/** Selector de productos con buscador: el catálogo es largo. */
function ListaProductos({
  nombre,
  productos,
  elegidos,
  onToggle,
}: {
  nombre: string;
  productos: Array<{ idProducto: string; nombreProducto: string; marca: string }>;
  elegidos: string[];
  onToggle: (codigo: string) => void;
}) {
  const [buscar, setBuscar] = useState('');
  const texto = buscar.trim().toLowerCase();
  const visibles = texto
    ? productos.filter(
        (p) =>
          p.nombreProducto.toLowerCase().includes(texto) ||
          p.marca.toLowerCase().includes(texto) ||
          p.idProducto.includes(texto),
      )
    : productos;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Input
          className="h-8"
          placeholder={`Buscar producto ${nombre}…`}
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
        />
        <Badge variant="secondary">{elegidos.length} elegidos</Badge>
      </div>
      <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-lg border p-2">
        {visibles.length === 0 ? (
          <p className="px-1 py-2 text-xs text-muted-foreground">Ningún producto coincide.</p>
        ) : (
          visibles.map((producto) => (
            <label
              key={producto.idProducto}
              className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted"
            >
              <Checkbox
                checked={elegidos.includes(producto.idProducto)}
                onCheckedChange={() => onToggle(producto.idProducto)}
              />
              <span className="truncate">{producto.nombreProducto}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                {producto.marca}
              </span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}
