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
import { HitoTag, Nota } from '../components/Piezas';

// El ciclo acordado con People (v3): un solo corte el lunes a las 9:00 que
// cierra la semana anterior y abre la nueva.
const CICLO = [
  {
    cuando: 'Lunes · 9:00 a. m. COT',
    titulo: 'Corte',
    texto:
      'Cierra la semana anterior y toma la línea base de la nueva: tareas WEEKLY e ítems DAILY. Si el lunes es festivo, el corte pasa al martes a la misma hora.',
  },
  {
    cuando: 'Durante la semana',
    titulo: 'Ejecución en Planner',
    texto:
      'La persona trabaja sus tareas, marca su checklist DAILY y registra su Hito. appSupli lee Planner cada noche a las 2:00 a. m.',
  },
  {
    cuando: 'Si se agregan tareas',
    titulo: 'También cuentan',
    texto:
      'Una tarea WEEKLY creada después del corte cuenta en esa misma semana. Queda la fecha en que entró a la medición y sus cambios de depósito.',
  },
  {
    cuando: 'Lunes siguiente · 9:00 a. m.',
    titulo: 'Resultado final',
    texto:
      'El corte congela Weekly, Daily e Hito y el índice queda final con la versión de parámetros que regía esa semana.',
  },
];

const HITO = [
  {
    registrado: true,
    texto:
      'Hay una tarea HITO en el depósito de la semana con al menos un ítem en su checklist. Suma 100.',
  },
  {
    registrado: false,
    texto: 'No hay tarea HITO, o la que hay no tiene ítems en su checklist. Suma 0.',
  },
];

const ROLES = [
  {
    rol: 'Colaborador',
    hace: 'Ejecuta sus tareas en Planner, marca su checklist DAILY y registra su Hito.',
    ve: 'Su cumplimiento semanal y mensual, sus Hitos y la trazabilidad de sus tareas.',
  },
  {
    rol: 'Líder',
    hace: 'Hace seguimiento a la ejecución de su equipo.',
    ve: 'Todo su equipo, no solo sus directos, con el ranking de su equipo.',
  },
  {
    rol: 'Director',
    hace: 'Hace seguimiento a la ejecución de su dirección.',
    ve: 'Toda su dirección por área y por persona, con su ranking.',
  },
  {
    rol: 'CEO',
    hace: 'Consulta la ejecución y sus brechas. Se mide con la misma regla del Hito.',
    ve: 'Toda la compañía por dirección, área y persona.',
  },
  {
    rol: 'People',
    hace: 'En Gestión de usuarios decide quién se mide (switch «Planner», solo correos @supli.tech) y pone la URL de Planner de cada persona, que es el plan que se mide. Además versiona pesos y semáforo y revisa la calidad del dato.',
    ve: 'Toda la compañía, conexión, calidad, parámetros y recálculos.',
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
            La semana va de corte a corte: de lunes 9:00 a. m. al lunes siguiente a la misma hora.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
              People los versiona en Parámetros; un cambio solo rige hacia adelante.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 font-mono text-[13px]">
            <code className="rounded-md bg-muted px-3 py-2">
              % Weekly = WEEKLY completadas ÷ (línea base + agregadas después del corte) × 100
            </code>
            <code className="rounded-md bg-muted px-3 py-2">
              % Daily = ítems marcados ÷ total de ítems de la checklist × 100
            </code>
            <code className="rounded-md bg-muted px-3 py-2">
              Hito = 100 si está registrado · 0 si no
            </code>
            <code className="rounded-md bg-muted px-3 py-2">
              Índice semanal = mín(100, pW × W + pD × D + pH × H)
            </code>
            <code className="rounded-md bg-muted px-3 py-2">
              Índice mensual = promedio de los índices de las semanas del mes
            </code>
            <p className="mt-2 font-sans text-sm text-muted-foreground">
              Ejemplo: 5 de 6 tareas Weekly, 7 de 10 ítems de Daily y Hito registrado →{' '}
              <b className="text-foreground tabular-nums">{formatoIndice(ejemplo)}</b>.
            </p>
            <Nota className="font-sans">
              Si una semana no tiene tareas Weekly o no tiene ítems Daily, ese componente sale y su
              peso se reparte entre los demás; sin ninguno de los dos, la semana no tiene índice.
              Una tarea de la línea base que se mueve a otro depósito sigue contando en su semana.
            </Nota>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>El Hito</CardTitle>
            <CardDescription>
              Es la tarea con la etiqueta HITO en el depósito de la semana. No se valida: basta con
              registrarlo. Si hay varios, con uno registrado alcanza.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col">
            {HITO.map((h) => (
              <div
                key={String(h.registrado)}
                className="flex items-center gap-3 border-b border-border py-2.5 last:border-0"
              >
                <span className="w-28 shrink-0">
                  <HitoTag registrado={h.registrado} />
                </span>
                <span className="text-sm text-muted-foreground">{h.texto}</span>
              </div>
            ))}
            <p className="mt-3 text-xs text-pretty text-muted-foreground">
              No hace falta completar la tarea ni marcar los ítems. En el detalle de cada persona se
              ve el contenido de la checklist tal como está en Planner.
            </p>
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
