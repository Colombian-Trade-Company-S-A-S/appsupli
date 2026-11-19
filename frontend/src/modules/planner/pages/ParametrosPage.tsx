import { useEffect, useState } from 'react';
import { HistoryIcon, RefreshCwIcon, RotateCcwIcon, SaveIcon } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@/shared/components/ui';
import { EsqueletoPagina } from '@/shared/components/feedback';
import { formatoFechaHora } from '@/shared/lib/formato';
import { diaCorto, formatoIndice, type ParametrosPayload } from '../api';
import {
  useGuardarParametros,
  useOpcionesPlanner,
  useParametrosPlanner,
  useRecalcular,
} from '../hooks';
import { SelectorSemana, SemaforoTag } from '../components/Piezas';

type Valores = Omit<ParametrosPayload, 'vigenteDesde'>;

const ESTANDAR: Valores = {
  pesoWeekly: 40,
  pesoDaily: 40,
  pesoHito: 20,
  verdeDesde: 80,
  ambarDesde: 60,
};

const CAMPOS_PESO = [
  ['pesoWeekly', 'Weekly (%)'],
  ['pesoDaily', 'Daily (%)'],
  ['pesoHito', 'Hito (%)'],
] as const;

const CAMPOS_CORTE = [
  ['verdeDesde', 'Verde desde'],
  ['ambarDesde', 'Ámbar desde'],
] as const;

/**
 * Los pesos del índice y los cortes del semáforo, versionados. Solo People.
 *
 * Decisión 7: cada versión rige desde un lunes futuro hasta el día antes de
 * la siguiente; lo ya calculado no cambia y cada resultado guarda su versión.
 * Recalcular una semana ya cerrada es una excepción: pide motivo y queda en
 * la bitácora con quién la autorizó.
 */
export default function ParametrosPage() {
  const { data } = useParametrosPlanner();
  const { data: opciones } = useOpcionesPlanner();
  const guardar = useGuardarParametros();
  const recalcular = useRecalcular();
  const [valores, setValores] = useState<Valores>(ESTANDAR);
  const [desde, setDesde] = useState('');
  const [semanaRecalculo, setSemanaRecalculo] = useState('');
  const [motivo, setMotivo] = useState('');

  useEffect(() => {
    if (data) {
      const { pesoWeekly, pesoDaily, pesoHito, verdeDesde, ambarDesde } = data.vigentes;
      setValores({ pesoWeekly, pesoDaily, pesoHito, verdeDesde, ambarDesde });
      setDesde(data.proximoLunes);
    }
  }, [data]);

  if (!data || !opciones) return <EsqueletoPagina label="Abriendo los parámetros…" />;

  const suma = valores.pesoWeekly + valores.pesoDaily + valores.pesoHito;
  const pesosOk = Math.abs(suma - 100) < 0.001;
  const cortesOk =
    valores.verdeDesde > valores.ambarDesde && valores.ambarDesde >= 0 && valores.verdeDesde <= 100;
  const fechaOk = !!desde && desde >= data.proximoLunes;

  // La persona del ejemplo de la guía: 5 de 6 Weekly, 7 de 10 ítems y Hito registrado.
  const W = (5 / 6) * 100;
  const D = 70;
  const ejemplo = Math.min(
    100,
    (valores.pesoWeekly * W + valores.pesoDaily * D + valores.pesoHito * 100) / 100,
  );
  const color =
    ejemplo >= valores.verdeDesde ? 'verde' : ejemplo >= valores.ambarDesde ? 'ambar' : 'rojo';

  const cambiar = (campo: keyof Valores, texto: string) =>
    setValores((v) => ({ ...v, [campo]: Number(texto.replace(',', '.')) || 0 }));

  // Solo las semanas ya cerradas tienen sentido para un recálculo excepcional.
  const cerradas = opciones.semanas.filter((s) => s.cerrada);
  const semanaElegida = semanaRecalculo || cerradas[0]?.codigo || '';

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Nueva versión</CardTitle>
            <CardDescription>
              Rige desde la semana que elijas, que tiene que ser una que todavía no empieza. Lo ya
              calculado no cambia.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-3">
              {CAMPOS_PESO.map(([campo, label]) => (
                <Field key={campo}>
                  <FieldLabel htmlFor={campo}>{label}</FieldLabel>
                  <Input
                    id={campo}
                    type="number"
                    min={0}
                    max={100}
                    inputMode="decimal"
                    value={valores[campo]}
                    onChange={(e) => cambiar(campo, e.target.value)}
                  />
                </Field>
              ))}
            </div>
            <p
              className={
                pesosOk ? 'text-sm text-muted-foreground' : 'text-sm text-red-700 dark:text-red-300'
              }
            >
              Suma de pesos: <b className="tabular-nums">{suma}%</b>
              {pesosOk ? ' · correcto' : '. Debe sumar 100% para guardar.'}
            </p>

            <h3 className="mt-2 text-sm font-semibold">Cortes del semáforo</h3>
            <div className="grid grid-cols-2 gap-3">
              {CAMPOS_CORTE.map(([campo, label]) => (
                <Field key={campo}>
                  <FieldLabel htmlFor={campo}>{label}</FieldLabel>
                  <Input
                    id={campo}
                    type="number"
                    min={0}
                    max={100}
                    inputMode="decimal"
                    value={valores[campo]}
                    onChange={(e) => cambiar(campo, e.target.value)}
                  />
                </Field>
              ))}
            </div>
            {!cortesOk && (
              <p className="text-sm text-red-700 dark:text-red-300">
                El corte verde debe ser mayor que el ámbar, y ambos entre 0 y 100.
              </p>
            )}

            <Field>
              <FieldLabel htmlFor="vigente-desde">Rige desde</FieldLabel>
              <Input
                id="vigente-desde"
                type="date"
                className="w-48"
                min={data.proximoLunes}
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
              />
              <FieldDescription>
                Se toma el lunes de la semana elegida. Lo más pronto: el{' '}
                {diaCorto(data.proximoLunes)}. La versión actual queda hasta el día antes.
              </FieldDescription>
            </Field>

            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!pesosOk || !cortesOk || !fechaOk || guardar.isPending}
                onClick={() => guardar.mutate({ ...valores, vigenteDesde: desde })}
              >
                <SaveIcon /> {guardar.isPending ? 'Guardando…' : 'Guardar versión'}
              </Button>
              <Button variant="outline" onClick={() => setValores(ESTANDAR)}>
                <RotateCcwIcon /> Restaurar estándar
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ejemplo de cálculo</CardTitle>
            <CardDescription>
              Persona de ejemplo con 5 de 6 tareas Weekly, 7 de 10 ítems de Daily y Hito registrado.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <code className="rounded-md bg-muted px-3 py-2 font-mono text-[13px]">
              Weekly {W.toFixed(0)}% · Daily {D}% · Hito 100%
            </code>
            <code className="rounded-md bg-muted px-3 py-2 font-mono text-[13px]">
              Índice = {valores.pesoWeekly}% × {W.toFixed(0)} + {valores.pesoDaily}% × {D} +{' '}
              {valores.pesoHito}% × 100 = <b>{formatoIndice(ejemplo)}</b>
            </code>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              Semáforo con estos cortes: <SemaforoTag semaforo={color} />
            </p>
            <p className="text-xs text-muted-foreground">
              Si una semana no tiene Weekly o no tiene ítems Daily, ese componente sale y su peso se
              reparte entre los demás.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="py-0">
        <CardHeader className="pt-6">
          <CardTitle>Versiones</CardTitle>
          <CardDescription>
            Cada semana se calcula con la versión que regía y el resultado la guarda.
          </CardDescription>
        </CardHeader>
        <div className="overflow-x-auto pb-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vigencia</TableHead>
                <TableHead className="hidden md:table-cell">Guardada por</TableHead>
                <TableHead className="text-right">Weekly</TableHead>
                <TableHead className="text-right">Daily</TableHead>
                <TableHead className="text-right">Hito</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Verde</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Ámbar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.versiones.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {diaCorto(v.vigenteDesde)} → {v.vigenteHasta ? diaCorto(v.vigenteHasta) : 'hoy'}
                    {v.id === data.vigentes.id && (
                      <Badge variant="success" className="ml-2">
                        Vigente
                      </Badge>
                    )}
                    {v.programada && (
                      <Badge variant="outline" className="ml-2">
                        Programada
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {v.creadoPor || 'Estándar'}
                    {v.createdAt && (
                      <span className="block text-xs">{formatoFechaHora(v.createdAt)}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{v.pesoWeekly}%</TableCell>
                  <TableCell className="text-right tabular-nums">{v.pesoDaily}%</TableCell>
                  <TableCell className="text-right tabular-nums">{v.pesoHito}%</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {v.verdeDesde}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {v.ambarDesde}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCwIcon className="size-4 text-primary" />
              Recálculo excepcional
            </CardTitle>
            <CardDescription>
              Vuelve a calcular una semana ya cerrada con la versión que regía en ella. Es una
              excepción: queda registrado quién la autorizó y por qué.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {cerradas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no hay semanas cerradas.</p>
            ) : (
              <>
                <SelectorSemana
                  id="recalculo-semana"
                  semanas={cerradas}
                  value={semanaElegida}
                  onChange={setSemanaRecalculo}
                />
                <Field>
                  <FieldLabel htmlFor="recalculo-motivo">Motivo</FieldLabel>
                  <Textarea
                    id="recalculo-motivo"
                    rows={3}
                    placeholder="Por qué hay que recalcular y con quién se autorizó"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                  />
                </Field>
                <Button
                  className="self-start"
                  variant="outline"
                  disabled={motivo.trim().length < 10 || !semanaElegida || recalcular.isPending}
                  onClick={() =>
                    recalcular.mutate(
                      { semana: semanaElegida, motivo },
                      { onSuccess: () => setMotivo('') },
                    )
                  }
                >
                  {recalcular.isPending ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <RefreshCwIcon data-icon="inline-start" />
                  )}
                  Recalcular semana
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HistoryIcon className="size-4 text-primary" />
              Bitácora de recálculos
            </CardTitle>
            <CardDescription>Cada recálculo excepcional, con su motivo.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.recalculos.length === 0 ? (
              <p className="text-sm text-muted-foreground">No se ha hecho ningún recálculo.</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {data.recalculos.map((r) => (
                  <li key={r.id} className="flex flex-col gap-0.5 py-2.5">
                    <span className="text-sm font-medium">
                      {r.etiqueta} · {r.resultados} resultado(s)
                    </span>
                    <span className="text-sm text-pretty text-muted-foreground">{r.motivo}</span>
                    <span className="text-xs text-muted-foreground">
                      {r.autorizadoPor || '—'} · {formatoFechaHora(r.hechoAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
