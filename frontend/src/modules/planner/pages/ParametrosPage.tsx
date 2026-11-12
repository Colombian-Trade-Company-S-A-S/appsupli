import { useEffect, useState } from 'react';
import { RotateCcwIcon, SaveIcon } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldLabel,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui';
import { EsqueletoPagina } from '@/shared/components/feedback';
import { formatoFechaHora } from '@/shared/lib/formato';
import { formatoIndice, type ParametrosPayload } from '../api';
import { useGuardarParametros, useParametrosPlanner } from '../hooks';
import { Nota, SemaforoTag } from '../components/Piezas';

const ESTANDAR: ParametrosPayload = {
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
 * Los pesos del índice y los cortes del semáforo. Solo People.
 *
 * Cada vez que se guarda queda una versión nueva y se recalculan las semanas
 * que todavía no son finales; las cerradas conservan los pesos con que se
 * calcularon.
 */
export default function ParametrosPage() {
  const { data } = useParametrosPlanner();
  const guardar = useGuardarParametros();
  const [valores, setValores] = useState<ParametrosPayload>(ESTANDAR);

  useEffect(() => {
    if (data) {
      const { pesoWeekly, pesoDaily, pesoHito, verdeDesde, ambarDesde } = data.vigentes;
      setValores({ pesoWeekly, pesoDaily, pesoHito, verdeDesde, ambarDesde });
    }
  }, [data]);

  if (!data) return <EsqueletoPagina label="Abriendo los parámetros…" />;

  const suma = valores.pesoWeekly + valores.pesoDaily + valores.pesoHito;
  const pesosOk = Math.abs(suma - 100) < 0.001;
  const cortesOk =
    valores.verdeDesde > valores.ambarDesde && valores.ambarDesde >= 0 && valores.verdeDesde <= 100;

  // La persona del ejemplo de la guía: 5 de 6 Weekly, 7 de 10 ítems y Hito cumplido.
  const W = (5 / 6) * 100;
  const D = 70;
  const ejemplo = Math.min(
    100,
    (valores.pesoWeekly * W + valores.pesoDaily * D + valores.pesoHito * 100) / 100,
  );
  const color =
    ejemplo >= valores.verdeDesde ? 'verde' : ejemplo >= valores.ambarDesde ? 'ambar' : 'rojo';

  const cambiar = (campo: keyof ParametrosPayload, texto: string) =>
    setValores((v) => ({ ...v, [campo]: Number(texto.replace(',', '.')) || 0 }));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pesos del índice semanal</CardTitle>
            <CardDescription>Deben sumar 100%.</CardDescription>
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
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!pesosOk || !cortesOk || guardar.isPending}
                onClick={() => guardar.mutate(valores)}
              >
                <SaveIcon /> {guardar.isPending ? 'Guardando…' : 'Guardar versión'}
              </Button>
              <Button variant="outline" onClick={() => setValores(ESTANDAR)}>
                <RotateCcwIcon /> Restaurar estándar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Al guardar, los cambios aplican a las semanas que todavía no son finales.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ejemplo de cálculo</CardTitle>
            <CardDescription>
              Persona de ejemplo con 5 de 6 tareas Weekly, 7 de 10 ítems de Daily y Hito cumplido.
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
            <Nota>
              Por confirmar con People: los cortes del semáforo. El plan los iguala a Supli
              Performance (100 / 85), pero el índice llega como máximo a 100; mientras se decide, se
              usa 80 / 60.
            </Nota>
          </CardContent>
        </Card>
      </div>

      <Card className="py-0">
        <CardHeader className="pt-6">
          <CardTitle>Versiones</CardTitle>
          <CardDescription>Cada resultado guarda con qué versión se calculó.</CardDescription>
        </CardHeader>
        <div className="overflow-x-auto pb-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Guardada</TableHead>
                <TableHead>Por</TableHead>
                <TableHead className="text-right">Weekly</TableHead>
                <TableHead className="text-right">Daily</TableHead>
                <TableHead className="text-right">Hito</TableHead>
                <TableHead className="text-right">Verde</TableHead>
                <TableHead className="text-right">Ámbar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.versiones.map((v, i) => (
                <TableRow key={v.id}>
                  <TableCell className="tabular-nums">
                    {formatoFechaHora(v.createdAt)}
                    {i === 0 && (
                      <span className="ml-2 text-xs text-emerald-700 dark:text-emerald-300">
                        vigente
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {v.creadoPor || 'Estándar'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{v.pesoWeekly}%</TableCell>
                  <TableCell className="text-right tabular-nums">{v.pesoDaily}%</TableCell>
                  <TableCell className="text-right tabular-nums">{v.pesoHito}%</TableCell>
                  <TableCell className="text-right tabular-nums">{v.verdeDesde}</TableCell>
                  <TableCell className="text-right tabular-nums">{v.ambarDesde}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
