import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui';
import { EsqueletoPagina } from '@/shared/components/feedback';
import { formatoIndice } from '../api';
import { useOpcionesPlanner } from '../hooks';
import { EstadoHitoTag, Nota } from '../components/Piezas';

const CICLO = [
  {
    cuando: 'Lunes · 18:00 COT',
    titulo: 'Línea base',
    texto:
      'Se fija la base de la semana: tareas WEEKLY e ítems DAILY. Si el lunes es festivo, pasa al martes.',
  },
  {
    cuando: 'Durante la semana',
    titulo: 'Ejecución en Planner',
    texto:
      'La persona trabaja sus tareas y marca su checklist DAILY. appSupli lee Planner cada noche a las 02:00 COT.',
  },
  {
    cuando: 'Domingo · 23:59 COT',
    titulo: 'Cierre de la semana',
    texto: 'Se congela el estado de Weekly y Daily al cierre.',
  },
  {
    cuando: 'Lunes a miércoles de la semana siguiente',
    titulo: 'Validación de Hitos',
    texto:
      'El líder marca cada Hito como Cumplido o No cumplido. Si ese lunes es festivo, la ventana se corre un día.',
  },
  {
    cuando: 'Al cerrar la ventana',
    titulo: 'Resultado final',
    texto: 'Lo no validado pasa a Sin validar y cuenta como Cumplido. El índice queda final.',
  },
];

const ESTADOS = [
  { estado: 'cumplido', label: 'Cumplido', texto: 'Validado por el líder. Suma 100 en el índice.' },
  {
    estado: 'sin_validar',
    label: 'Sin validar',
    texto: 'No se validó antes de cerrar la ventana. Suma 100 en el índice.',
  },
  { estado: 'pendiente', label: 'Pendiente', texto: 'Ventana abierta. Aún se puede validar.' },
  { estado: 'no_cumplido', label: 'No cumplido', texto: 'Validado como no cumplido. Suma 0.' },
  {
    estado: 'sin_registrar',
    label: 'Sin registrar',
    texto: 'No hay tarea HITO en Planner esa semana. Suma 0.',
  },
] as const;

const ROLES = [
  {
    rol: 'Colaborador',
    hace: 'Ejecuta sus tareas en Planner y marca su checklist DAILY.',
    ve: 'Su cumplimiento semanal y mensual.',
  },
  {
    rol: 'Líder',
    hace: 'Valida los Hitos de su equipo de lunes a miércoles.',
    ve: 'Dashboard de su equipo a cargo directo y Hitos por validar.',
  },
  {
    rol: 'People',
    hace: 'Define pesos y cortes, relaciona cada plan con su persona y revisa la calidad del dato.',
    ve: 'Toda la organización, conexión, calidad y parámetros.',
  },
  {
    rol: 'CEO y Dirección',
    hace: 'Consultan la ejecución y sus brechas.',
    ve: 'Toda la organización, en solo lectura.',
  },
];

/** La primera pestaña: el ciclo semanal, las fórmulas y quién hace qué. */
export default function ComoFuncionaPage() {
  const { data: opciones } = useOpcionesPlanner();
  if (!opciones) return <EsqueletoPagina label="Abriendo Ejecución Planner…" />;
  const p = opciones.parametros;
  const ejemplo = Math.min(
    100,
    (p.pesoWeekly * (500 / 6) + p.pesoDaily * 70 + p.pesoHito * 100) / 100,
  );

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Ciclo semanal</CardTitle>
          <CardDescription>
            Cada semana sigue el mismo orden. Así se sabe qué se mide, cuándo y quién lo valida.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-3 md:grid-cols-5">
            {CICLO.map((paso, i) => (
              <li
                key={paso.titulo}
                className="flex flex-col gap-1.5 rounded-xl border border-border p-4"
              >
                <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 font-heading text-sm font-semibold text-primary">
                  {i + 1}
                </span>
                <small className="text-xs text-muted-foreground">{paso.cuando}</small>
                <b className="text-sm font-semibold">{paso.titulo}</b>
                <p className="text-xs text-pretty text-muted-foreground">{paso.texto}</p>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cómo se calcula</CardTitle>
            <CardDescription>
              Pesos vigentes: Weekly {p.pesoWeekly}% · Daily {p.pesoDaily}% · Hito {p.pesoHito}%.
              People los define en Parámetros.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 font-mono text-[13px]">
            <code className="rounded-md bg-muted px-3 py-2">
              % Weekly = tareas WEEKLY completadas al cierre ÷ línea base × 100
            </code>
            <code className="rounded-md bg-muted px-3 py-2">
              % Daily = ítems marcados ÷ total de ítems de la checklist × 100
            </code>
            <code className="rounded-md bg-muted px-3 py-2">
              Hito = 100 si está Cumplido o Sin validar · 0 en otro caso
            </code>
            <code className="rounded-md bg-muted px-3 py-2">
              Índice semanal = mín(100, pW × W + pD × D + pH × H)
            </code>
            <code className="rounded-md bg-muted px-3 py-2">
              Índice mensual = promedio de los índices de las semanas del mes
            </code>
            <p className="mt-2 font-sans text-sm text-muted-foreground">
              Ejemplo: 5 de 6 tareas Weekly, 7 de 10 ítems de Daily y Hito cumplido →{' '}
              <b className="text-foreground tabular-nums">{formatoIndice(ejemplo)}</b>.
            </p>
            <Nota className="font-sans">
              Por confirmar con People: las tareas agregadas a mitad de semana no cuentan, las
              movidas a otro depósito sí cuentan con su línea base, y una semana sin Weekly o sin
              checklist cuenta ese componente como 0.
            </Nota>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Estados del Hito</CardTitle>
            <CardDescription>
              El Hito es la tarea con la etiqueta HITO en el depósito de la semana.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col">
            {ESTADOS.map((e) => (
              <div
                key={e.estado}
                className="flex items-center gap-3 border-b border-border py-2.5 last:border-0"
              >
                <span className="w-28 shrink-0">
                  <EstadoHitoTag estado={e.estado} label={e.label} />
                </span>
                <span className="text-sm text-muted-foreground">{e.texto}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="py-0">
        <CardHeader className="pt-6">
          <CardTitle>Quién hace qué</CardTitle>
          <CardDescription>
            El estándar en Planner: depósitos «WEEK NN» y etiquetas WEEKLY, DAILY e HITO escritas
            igual en todos los planes.
          </CardDescription>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rol</TableHead>
                <TableHead>Qué hace</TableHead>
                <TableHead>Qué ve</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ROLES.map((r) => (
                <TableRow key={r.rol}>
                  <TableCell className="font-medium">{r.rol}</TableCell>
                  <TableCell className="whitespace-normal text-muted-foreground">
                    {r.hace}
                  </TableCell>
                  <TableCell className="whitespace-normal text-muted-foreground">{r.ve}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
