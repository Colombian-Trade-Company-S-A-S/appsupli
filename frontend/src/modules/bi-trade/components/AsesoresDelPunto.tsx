/**
 * La historia de los asesores Apple de un punto, como línea de tiempo.
 *
 * Los asesores que se suceden forman una cadena sin huecos: cada uno termina
 * el día antes de que empiece el siguiente. Al mover una fecha, el backend
 * ajusta al vecino y reacomoda las recomendaciones según su fecha, así que
 * aquí solo se eligen los rangos con el calendario. El último de cada cadena
 * es el asesor de hoy: el que sale en el formulario. Un punto con dos
 * asesores a la vez tiene dos cadenas.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  CalendarRangeIcon,
  PlusIcon,
  RepeatIcon,
  SaveIcon,
  Trash2Icon,
  UserRoundIcon,
} from 'lucide-react';
import { ConfirmarBorrado } from '@/shared/components/feedback';
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
  Spinner,
} from '@/shared/components/ui';
import { formatoNumero } from '@/shared/lib/formato';
import { cn } from '@/shared/lib/utils';
import { belkinApi, type AsesorApple, type PuntoVentaBelkin } from '../api';
import { useBiTradeMutation } from '../hooks';

const hoyISO = () => new Date().toLocaleDateString('en-CA');

/** Suma días a una fecha AAAA-MM-DD sin pasar por la zona horaria. */
export function masDias(iso: string, dias: number): string {
  const [anio, mes, dia] = iso.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia + dias));
  return fecha.toISOString().slice(0, 10);
}

/** `2026-11-01` → `1 nov 2026`. */
export function fechaCorta(iso: string): string {
  const [anio, mes, dia] = iso.split('-').map(Number);
  return new Date(anio, mes - 1, dia).toLocaleDateString('es-CO', { dateStyle: 'medium' });
}

/** Las cadenas del punto, cada una del primer asesor al último (el de hoy). */
export function cadenasDe(asesores: AsesorApple[]): AsesorApple[][] {
  const porId = new Map(asesores.map((a) => [a.idAsesor, a]));
  const primeros = asesores.filter((a) => !a.reemplaza || !porId.has(a.reemplaza));
  const cadenas = primeros.map((primero) => {
    const eslabones = [primero];
    let actual = primero;
    while (actual.reemplazadoPor && porId.has(actual.reemplazadoPor)) {
      actual = porId.get(actual.reemplazadoPor)!;
      if (eslabones.includes(actual)) break;
      eslabones.push(actual);
    }
    return eslabones;
  });
  // Primero las cadenas con asesor vigente; dentro, por el inicio más viejo.
  return cadenas.sort((a, b) => {
    const vigenteA = !a[a.length - 1].hasta ? 0 : 1;
    const vigenteB = !b[b.length - 1].hasta ? 0 : 1;
    return vigenteA - vigenteB || (a[0].desde ?? '').localeCompare(b[0].desde ?? '');
  });
}

/** Un asesor de la cadena, con su rango editable en el calendario. */
function Eslabon({
  asesor,
  anterior,
  siguiente,
  puedeAdministrar,
  onCambiar,
}: {
  asesor: AsesorApple;
  anterior?: AsesorApple;
  siguiente?: AsesorApple;
  puedeAdministrar: boolean;
  onCambiar: (asesor: AsesorApple) => void;
}) {
  const [desde, setDesde] = useState(asesor.desde ?? '');
  const [hasta, setHasta] = useState(asesor.hasta ?? '');
  useEffect(() => {
    setDesde(asesor.desde ?? '');
    setHasta(asesor.hasta ?? '');
  }, [asesor.desde, asesor.hasta]);

  const [borrando, setBorrando] = useState(false);
  const borrar = useBiTradeMutation(
    () => belkinApi.asesores.remove(asesor.idAsesor),
    anterior
      ? `Se deshizo el cambio: ${anterior.nombre} vuelve a ser el asesor`
      : 'Asesor eliminado',
  );

  const guardar = useBiTradeMutation(
    () =>
      belkinApi.asesores.vigencia(asesor.idAsesor, { desde: desde || null, hasta: hasta || null }),
    (datos) => datos.message,
  );

  const actual = !siguiente && !asesor.hasta;
  const cambio = desde !== (asesor.desde ?? '') || hasta !== (asesor.hasta ?? '');
  // Los límites del calendario: no cruzarse con el anterior ni con el siguiente.
  const desdeMin = anterior?.desde ? masDias(anterior.desde, 1) : undefined;
  const desdeMax = hasta || hoyISO();
  const hastaMax = siguiente?.hasta ? masDias(siguiente.hasta, -1) : undefined;
  const faltaDesde = !!anterior && !desde;
  const faltaHasta = !!siguiente && !hasta;

  return (
    <li className="relative pb-6 pl-8 last:pb-0">
      {/* La línea y el punto de la línea de tiempo. */}
      {siguiente && (
        <span aria-hidden className="absolute top-2 bottom-0 left-[0.6875rem] w-px bg-border" />
      )}
      <span
        aria-hidden
        className={cn(
          'absolute top-1.5 left-1 flex size-4 items-center justify-center rounded-full border-2 bg-background',
          actual ? 'border-primary' : 'border-muted-foreground/40',
        )}
      >
        {actual && <span className="size-1.5 rounded-full bg-primary" />}
      </span>

      <div className="flex flex-col gap-3 rounded-lg border p-3 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col">
            <span className="flex flex-wrap items-center gap-2 font-medium">
              <UserRoundIcon className="size-4 shrink-0 text-muted-foreground" />
              {asesor.nombre}
              {actual && <Badge variant="success">Actual · sale en el formulario</Badge>}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatoNumero(asesor.registrosCount)} recomendación(es) a su nombre
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {puedeAdministrar && actual && (
              <Button variant="outline" size="sm" onClick={() => onCambiar(asesor)}>
                <RepeatIcon data-icon="inline-start" />
                Cambiar asesor
              </Button>
            )}
            {/* Solo el último de la cadena y sin recomendaciones: no se pierde nada. */}
            {puedeAdministrar && !siguiente && asesor.registrosCount === 0 && (
              <Button variant="ghost" size="sm" onClick={() => setBorrando(true)}>
                <Trash2Icon data-icon="inline-start" />
                Eliminar
              </Button>
            )}
          </div>
        </div>

        <ConfirmarBorrado
          abierto={borrando}
          onOpenChange={setBorrando}
          titulo={`¿Eliminar a ${asesor.nombre}?`}
          descripcion={
            anterior
              ? `No tiene recomendaciones. Al eliminarlo se deshace el cambio: ${anterior.nombre} vuelve a ser el asesor actual del punto, sin fecha de fin.`
              : 'No tiene recomendaciones. Deja de ser asesor del punto y no sale más en el formulario.'
          }
          onConfirmar={() => {
            borrar.mutate(undefined);
            setBorrando(false);
          }}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`desde-${asesor.idAsesor}`}>Desde</FieldLabel>
            <Input
              id={`desde-${asesor.idAsesor}`}
              type="date"
              value={desde}
              min={desdeMin}
              max={desdeMax}
              disabled={!puedeAdministrar}
              onChange={(e) => setDesde(e.target.value)}
            />
            <FieldDescription>
              {anterior
                ? `${anterior.nombre} termina el día antes.`
                : desde
                  ? 'Primer asesor del punto.'
                  : 'Vacío: era el asesor antes de llevar fechas.'}
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor={`hasta-${asesor.idAsesor}`}>Hasta</FieldLabel>
            <Input
              id={`hasta-${asesor.idAsesor}`}
              type="date"
              value={hasta}
              min={desde || undefined}
              max={hastaMax}
              disabled={!puedeAdministrar}
              onChange={(e) => setHasta(e.target.value)}
            />
            <FieldDescription>
              {siguiente
                ? hasta
                  ? `${siguiente.nombre} empieza el ${fechaCorta(masDias(hasta, 1))}.`
                  : `Lo reemplazó ${siguiente.nombre}: elige el último día.`
                : hasta
                  ? 'Deja de ser asesor ese día. Vacío: sigue siéndolo.'
                  : 'Sigue siendo el asesor del punto.'}
            </FieldDescription>
          </Field>
        </div>

        {puedeAdministrar && cambio && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDesde(asesor.desde ?? '');
                setHasta(asesor.hasta ?? '');
              }}
            >
              Descartar
            </Button>
            <Button
              size="sm"
              disabled={guardar.isPending || faltaDesde || faltaHasta}
              onClick={() => guardar.mutate(undefined)}
            >
              {guardar.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <SaveIcon data-icon="inline-start" />
              )}
              Guardar fechas
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

/** Cambia el asesor desde una fecha: el anterior conserva su nombre y lo suyo. */
function CambiarAsesor({ asesor, onCerrar }: { asesor: AsesorApple | null; onCerrar: () => void }) {
  const [nombre, setNombre] = useState('');
  const [desde, setDesde] = useState(hoyISO);
  useEffect(() => {
    if (asesor) {
      setNombre('');
      setDesde(hoyISO());
    }
  }, [asesor]);
  const cambiar = useBiTradeMutation(
    () => belkinApi.asesores.cambiar(asesor!.idAsesor, { nombre, desde }),
    (datos) => datos.message,
  );
  const minimo = asesor?.desde ? masDias(asesor.desde, 1) : undefined;

  return (
    <Dialog open={!!asesor} onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar el asesor</DialogTitle>
          <DialogDescription>
            {asesor?.nombre} termina el día antes de la fecha que elijas y sus recomendaciones de
            antes siguen a su nombre. Desde ese día, el asesor del punto es el nuevo.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="cambiar-nombre">Nuevo asesor</FieldLabel>
            <Input
              id="cambiar-nombre"
              maxLength={120}
              placeholder="Nombre y apellido"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
            <FieldDescription>
              Si es la misma persona con el nombre mal escrito, no lo cambies: corrígelo en la lista
              de asesores.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="cambiar-desde">Es el asesor desde</FieldLabel>
            <Input
              id="cambiar-desde"
              type="date"
              className="w-48"
              min={minimo}
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
            />
            {desde && (
              <FieldDescription>
                {asesor?.nombre} queda hasta el {fechaCorta(masDias(desde, -1))}.
              </FieldDescription>
            )}
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={!nombre.trim() || !desde || cambiar.isPending}
            onClick={() => cambiar.mutate(undefined, { onSuccess: onCerrar })}
          >
            {cambiar.isPending && <Spinner data-icon="inline-start" />}
            Cambiar asesor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Un asesor más en el punto, a la vez que los que ya tiene (otra cadena). */
function AgregarAsesor({
  punto,
  abierto,
  onCerrar,
}: {
  punto: PuntoVentaBelkin;
  abierto: boolean;
  onCerrar: () => void;
}) {
  const [nombre, setNombre] = useState('');
  const [desde, setDesde] = useState(hoyISO);
  useEffect(() => {
    if (abierto) {
      setNombre('');
      setDesde(hoyISO());
    }
  }, [abierto]);
  const crear = useBiTradeMutation(
    () =>
      belkinApi.asesores.create({
        nombre,
        idPuntoVenta: punto.idPuntoVenta,
        activo: true,
        desde: desde || null,
      }),
    'Asesor agregado',
  );
  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar un asesor a {punto.nombrePdv}</DialogTitle>
          <DialogDescription>
            Para un asesor que trabaja a la vez que los que ya tiene el punto. Si reemplaza a
            alguien, usa «Cambiar asesor» en el actual.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="agregar-nombre">Nombre y apellido</FieldLabel>
            <Input
              id="agregar-nombre"
              maxLength={120}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="agregar-desde">Asesor desde</FieldLabel>
            <Input
              id="agregar-desde"
              type="date"
              className="w-48"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            disabled={!nombre.trim() || crear.isPending}
            onClick={() => crear.mutate(undefined, { onSuccess: onCerrar })}
          >
            {crear.isPending && <Spinner data-icon="inline-start" />}
            Agregar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** La tarjeta con la historia de asesores del punto. */
export function AsesoresDelPunto({
  punto,
  asesores,
  puedeAdministrar,
}: {
  punto: PuntoVentaBelkin;
  asesores: AsesorApple[];
  puedeAdministrar: boolean;
}) {
  const [cambiando, setCambiando] = useState<AsesorApple | null>(null);
  const [agregando, setAgregando] = useState(false);
  const cadenas = useMemo(() => cadenasDe(asesores), [asesores]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarRangeIcon className="size-4 text-primary" />
          Asesores del punto
        </CardTitle>
        <CardDescription>
          Quién fue el asesor y cuándo. Al mover una fecha, el asesor de al lado se ajusta solo y
          cada recomendación queda a nombre de quien era el asesor ese día.
        </CardDescription>
        {puedeAdministrar && (
          <CardAction>
            <Button variant="outline" size="sm" onClick={() => setAgregando(true)}>
              <PlusIcon data-icon="inline-start" />
              Agregar asesor
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {cadenas.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Este punto todavía no tiene asesores.
          </p>
        ) : (
          cadenas.map((cadena, indice) => (
            <section key={cadena[0].idAsesor} className="flex flex-col gap-3">
              {cadenas.length > 1 && (
                <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Asesor {indice + 1} del punto
                </h3>
              )}
              <ol>
                {cadena.map((asesor, i) => (
                  <Eslabon
                    key={asesor.idAsesor}
                    asesor={asesor}
                    anterior={cadena[i - 1]}
                    siguiente={cadena[i + 1]}
                    puedeAdministrar={puedeAdministrar}
                    onCambiar={setCambiando}
                  />
                ))}
              </ol>
            </section>
          ))
        )}
      </CardContent>

      <CambiarAsesor asesor={cambiando} onCerrar={() => setCambiando(null)} />
      <AgregarAsesor punto={punto} abierto={agregando} onCerrar={() => setAgregando(false)} />
    </Card>
  );
}
