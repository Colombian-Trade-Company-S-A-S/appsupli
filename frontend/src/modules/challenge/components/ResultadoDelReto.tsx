import { useEffect, type ReactNode } from 'react';
import {
  CircleXIcon,
  CrownIcon,
  LockIcon,
  MedalIcon,
  SparklesIcon,
  TrophyIcon,
  UsersIcon,
} from 'lucide-react';
import {
  Avatar,
  AvatarFallback,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui';
import { celebrar } from '@/shared/lib/celebrar';
import { cn } from '@/shared/lib/utils';
import type { FilaRanking, Participacion, ResultadoReto } from '../api';
import { EstadoEntrega, iniciales } from './Piezas';

const puntos = (valor: number | string | null | undefined) =>
  valor === null || valor === undefined ? '—' : Number(valor).toFixed(1).replace(/\.0$/, '');

/** Los tres primeros puestos en los tonos de la marca: del más fuerte al más suave. */
const MEDALLA: Record<number, { anillo: string; fondo: string; texto: string; etiqueta: string }> =
  {
    1: {
      anillo: 'ring-primary',
      fondo: 'bg-primary/25',
      texto: 'text-foreground',
      etiqueta: '1.º',
    },
    2: {
      anillo: 'ring-primary/60',
      fondo: 'bg-primary/15',
      texto: 'text-foreground/80',
      etiqueta: '2.º',
    },
    3: {
      anillo: 'ring-primary/30',
      fondo: 'bg-primary/10',
      texto: 'text-foreground/70',
      etiqueta: '3.º',
    },
  };

/** Una barra de 0 a 100 que crece al aparecer (respeta «menos movimiento»). */
function Barra({ valor, className }: { valor: number | null; className?: string }) {
  const ancho = valor === null ? 0 : Math.max(0, Math.min(100, valor));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
      <div
        className={cn(
          'h-full rounded-full bg-primary transition-[width] duration-700 ease-out motion-reduce:transition-none',
          className,
        )}
        style={{ width: `${ancho}%` }}
      />
    </div>
  );
}

function Persona({
  nombre,
  tamano = 'size-10',
  anillo,
  className,
}: {
  nombre: string;
  tamano?: string;
  anillo?: string;
  className?: string;
}) {
  return (
    <Avatar
      className={cn(
        tamano,
        anillo && `ring-2 ring-offset-2 ring-offset-background ${anillo}`,
        className,
      )}
    >
      <AvatarFallback className="font-semibold">{iniciales(nombre)}</AvatarFallback>
    </Avatar>
  );
}

/** La portada del resultado: quién ganó, con cuánto y si hubo desempate. */
function Ganador({
  ganador,
  huboDesempate,
  esMio,
}: {
  ganador: FilaRanking;
  huboDesempate: boolean;
  esMio: boolean;
}) {
  return (
    <Card className="relative overflow-hidden border-primary/40 bg-gradient-to-br from-primary/20 via-primary/5 to-chart-2/10">
      <TrophyIcon
        className="pointer-events-none absolute -top-6 -right-6 size-40 text-primary/10"
        aria-hidden
      />
      <CardContent className="relative flex flex-col items-center gap-4 py-8 text-center sm:flex-row sm:text-left">
        <div className="relative">
          <Persona
            nombre={ganador.participanteNombre}
            tamano="size-20 text-2xl"
            anillo="ring-primary"
          />
          <span className="absolute -top-3 left-1/2 flex size-8 -translate-x-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
            <CrownIcon className="size-4" />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary uppercase">
            <SparklesIcon className="size-3.5" />
            {esMio ? '¡Ganaste este reto!' : 'Ganador del reto'}
          </p>
          <p className="text-2xl font-semibold text-balance">{ganador.participanteNombre}</p>
          {ganador.cargo && <p className="text-sm text-muted-foreground">{ganador.cargo}</p>}
          {huboDesempate && (
            <p className="mt-2 inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs font-medium text-foreground">
              Ganó el desempate · +20 puntos
            </p>
          )}
        </div>
        <div className="shrink-0 rounded-2xl border border-primary/30 bg-background/70 px-5 py-3 text-center backdrop-blur">
          <p className="text-4xl font-bold tabular-nums">{puntos(ganador.total)}</p>
          <p className="text-xs text-muted-foreground">de 100 puntos</p>
        </div>
      </CardContent>
    </Card>
  );
}

/** El podio: segundo, primero y tercero, con el primero más alto. */
function Podio({ ranking, miId }: { ranking: FilaRanking[]; miId?: number }) {
  const [primero, segundo, tercero] = ranking;
  if (!primero || !segundo) return null;
  const columnas = [segundo, primero, tercero].filter(Boolean) as FilaRanking[];
  const altura: Record<number, string> = { 1: 'h-28', 2: 'h-20', 3: 'h-14' };

  return (
    <div className="grid grid-cols-3 items-end gap-2 sm:gap-4">
      {columnas.map((fila) => {
        // El lugar dentro del podio (1.º, 2.º, 3.º), no el puesto global.
        const lugar = ranking.indexOf(fila) + 1;
        const medalla = MEDALLA[lugar];
        return (
          <div key={fila.participacion} className="flex min-w-0 flex-col items-center gap-2">
            <Persona
              nombre={fila.participanteNombre}
              tamano={lugar === 1 ? 'size-14 text-lg' : 'size-11'}
              anillo={medalla.anillo}
            />
            <div className="w-full min-w-0 text-center">
              <p className="truncate text-sm font-medium">
                {fila.participanteNombre}
                {fila.participante === miId && <span className="text-primary"> (tú)</span>}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">{puntos(fila.total)} pts</p>
            </div>
            <div
              className={cn(
                'flex w-full items-start justify-center rounded-t-xl border border-b-0 pt-2 text-lg font-bold',
                altura[lugar],
                medalla.fondo,
                medalla.texto,
              )}
            >
              {medalla.etiqueta}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FilaDelRanking({
  fila,
  esMia,
  mejor,
}: {
  fila: FilaRanking;
  esMia: boolean;
  mejor: number;
}) {
  const medalla = MEDALLA[fila.posicion];
  const descalificada = fila.estado === 'descalificada';
  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-xl border px-3 py-2.5',
        esMia && 'border-primary/50 bg-primary/5',
        descalificada && 'opacity-70',
      )}
    >
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums',
          medalla ? `${medalla.fondo} ${medalla.texto}` : 'bg-muted text-muted-foreground',
        )}
      >
        {fila.posicion}
      </span>
      <Persona nombre={fila.participanteNombre} tamano="size-9" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate text-sm font-medium">
          <span className="truncate">{fila.participanteNombre}</span>
          {esMia && (
            <span className="shrink-0 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
              Tú
            </span>
          )}
          {fila.esGanador && <TrophyIcon className="size-3.5 shrink-0 text-primary" />}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <Barra
            valor={descalificada ? 0 : mejor ? ((Number(fila.total) || 0) / mejor) * 100 : 0}
            className={fila.esGanador ? undefined : 'bg-primary/50'}
          />
        </div>
      </div>
      <div className="shrink-0 text-right">
        {descalificada ? (
          <EstadoEntrega estado="descalificada" label="No cumple" />
        ) : (
          <>
            <p className="font-semibold tabular-nums">{puntos(fila.total)}</p>
            <p className="text-[11px] text-muted-foreground">pts</p>
          </>
        )}
      </div>
    </li>
  );
}

/** Dónde quedó la persona que mira, aunque no esté en el top. */
function MiResultado({
  mia,
  ganador,
  total,
}: {
  mia: FilaRanking;
  ganador: FilaRanking | null;
  total: number;
}) {
  const distancia =
    ganador && !mia.esGanador ? Number(ganador.total ?? 0) - Number(mia.total ?? 0) : 0;
  const descalificada = mia.estado === 'descalificada';
  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardContent className="flex flex-wrap items-center gap-4 py-5">
        <div className="flex size-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <span className="text-[10px] leading-none font-medium uppercase">Puesto</span>
          <span className="text-xl leading-tight font-bold tabular-nums">{mia.posicion}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wide text-primary uppercase">Tu resultado</p>
          <p className="text-sm text-pretty">
            {descalificada ? (
              'Tu entrega no cumplió las condiciones del reto. Abajo ves el motivo.'
            ) : mia.esGanador ? (
              <>Quedaste en el primer puesto de {total} participantes. ¡Felicitaciones!</>
            ) : (
              <>
                Quedaste {mia.posicion}.º de {total} participantes
                {distancia > 0 && <>, a {puntos(distancia)} puntos del ganador</>}.
              </>
            )}
          </p>
        </div>
        {!descalificada && (
          <div className="shrink-0 text-right">
            <p className="text-2xl font-bold tabular-nums">{puntos(mia.total)}</p>
            <p className="text-xs text-muted-foreground">de 100</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * El resultado publicado de un reto.
 *
 * Arriba el ganador; luego el podio y el ranking —top 10 para quien participa,
 * completo para People— y el puesto propio. Si quien mira es el ganador, se
 * celebra una sola vez.
 */
export function ResultadoPublicado({
  resultado,
  retoId,
  miId,
  esPeople,
}: {
  resultado: ResultadoReto;
  retoId: number;
  miId?: number;
  esPeople: boolean;
}) {
  const { ganador, ranking, miResultado, totalParticipantes, huboDesempate } = resultado;
  const gane = !!ganador && ganador.participante === miId;
  const mejor = Math.max(...ranking.map((fila) => Number(fila.total) || 0), 0);

  useEffect(() => {
    if (!gane) return;
    const clave = `challenge:celebrado:${retoId}`;
    try {
      if (localStorage.getItem(clave)) return;
      localStorage.setItem(clave, '1');
    } catch {
      // Sin almacenamiento (modo privado): se celebra igual, solo que no se recuerda.
    }
    void celebrar();
  }, [gane, retoId]);

  if (!ganador) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
          <TrophyIcon className="size-5" />
          El reto se finalizó sin un ganador: ninguna entrega cumplió las condiciones.
        </CardContent>
      </Card>
    );
  }

  const enElTop = ranking.some((fila) => fila.participante === miId);
  // El podio es de quienes cumplieron (una descalificada no lleva medalla); con
  // podio, la lista sigue con el resto: los del podio ya están arriba.
  const enCompetencia = ranking.filter((fila) => fila.estado !== 'descalificada');
  const podio = enCompetencia.length >= 2 ? enCompetencia.slice(0, 3) : [];
  const resto = ranking.filter((fila) => !podio.includes(fila));

  return (
    <div className="flex flex-col gap-4">
      <Ganador ganador={ganador} huboDesempate={huboDesempate} esMio={gane} />
      {miResultado && !gane && (
        <MiResultado mia={miResultado} ganador={ganador} total={totalParticipantes} />
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <MedalIcon className="size-4 text-primary" />
            {esPeople ? 'Ranking completo' : 'Top 10 del reto'}
          </CardTitle>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <UsersIcon className="size-3.5" />
            {totalParticipantes} participante{totalParticipantes === 1 ? '' : 's'}
          </span>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <Podio ranking={podio} miId={miId} />
          {resto.length > 0 && (
            <ol className="flex flex-col gap-2">
              {resto.map((fila) => (
                <FilaDelRanking
                  key={fila.participacion}
                  fila={fila}
                  esMia={fila.participante === miId}
                  mejor={mejor}
                />
              ))}
            </ol>
          )}
          {miResultado && !enElTop && (
            <>
              <p className="text-center text-xs text-muted-foreground">···</p>
              <FilaDelRanking fila={miResultado} esMia mejor={mejor} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Mientras People califica: lo que se ve en el reto antes de publicar el resultado. */
export function ResultadoPorPublicar({
  participo,
  abierto,
  esPeople = false,
}: {
  participo: boolean;
  abierto: boolean;
  esPeople?: boolean;
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted">
          <LockIcon className="size-5 text-muted-foreground" />
        </span>
        <div className="max-w-md">
          <p className="font-medium">El resultado se publica cuando People finalice el reto</p>
          <p className="text-sm text-pretty text-muted-foreground">
            {esPeople
              ? 'Califica las respuestas desde «Ver detalles del reto». Al finalizar, todos ven al ganador y el top 10.'
              : participo
                ? 'Tu evidencia quedó registrada. Cuando se publique, aquí verás al ganador, el top 10, tu puesto y el detalle de tu calificación.'
                : abierto
                  ? 'Todavía estás a tiempo de participar: carga tu evidencia antes del cierre.'
                  : 'Ya no se reciben evidencias. Cuando se publique, aquí verás al ganador y el top 10.'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function NivelCriterio({ nombre, nivel }: { nombre: string; nivel: number }) {
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{nombre}</span>
        <b className="tabular-nums">{nivel} / 10</b>
      </div>
      <Barra
        valor={nivel * 10}
        className={nivel >= 8 ? undefined : nivel >= 6 ? 'bg-primary/70' : 'bg-primary/40'}
      />
    </li>
  );
}

/** Mi entrega: el estado, el puntaje y, ya publicado, cómo me calificaron criterio por criterio. */
export function MiEntrega({
  mia,
  finalizado,
  accion,
}: {
  mia: Participacion;
  finalizado: boolean;
  accion?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center gap-3">
        <CardTitle className="text-base">Mi entrega</CardTitle>
        <EstadoEntrega estado={mia.estado} label={mia.estadoLabel} />
        {finalizado && mia.puntajeConBonus && (
          <span className="text-sm font-semibold tabular-nums">
            {puntos(mia.puntajeConBonus)} / 100
          </span>
        )}
        {accion && <div className="ml-auto">{accion}</div>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!finalizado || mia.valoraciones.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {finalizado
              ? 'Tu evidencia quedó registrada sin calificaciones.'
              : 'Tu evidencia quedó registrada. El puntaje y el detalle de la calificación se publican cuando el reto finalice.'}
          </p>
        ) : (
          <CalificacionesDeLaEntrega participacion={mia} />
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Cómo se calificó una entrega, criterio por criterio, en solo lectura.
 *
 * Lo usa «Mi entrega» (sin nombres: «Calificación de People») y los detalles
 * del reto, donde People ve quién calificó.
 */
export function CalificacionesDeLaEntrega({
  participacion,
  conNombre = false,
}: {
  participacion: Participacion;
  conNombre?: boolean;
}) {
  if (participacion.valoraciones.length === 0) {
    return <p className="text-sm text-muted-foreground">Esta entrega no tiene calificaciones.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {participacion.valoraciones.map((valoracion) => (
        <div key={valoracion.id} className="rounded-xl border p-4 text-sm">
          <p className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            {conNombre ? `Calificación de ${valoracion.evaluadorNombre}` : 'Calificación de People'}
            <span className="ml-auto text-base font-semibold text-foreground tabular-nums">
              {puntos(valoracion.puntaje)} / 100
            </span>
          </p>
          {valoracion.noCumple ? (
            <p className="flex items-start gap-2 text-red-700 dark:text-red-300">
              <CircleXIcon className="mt-0.5 size-4 shrink-0" />
              Marcada como «no cumple»: {participacion.motivoDescalificacion}
            </p>
          ) : (
            <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {valoracion.puntajes.map((puntaje) => (
                <NivelCriterio
                  key={puntaje.criterio}
                  nombre={puntaje.criterioNombre}
                  nivel={puntaje.nivel}
                />
              ))}
            </ul>
          )}
          {valoracion.comentario && (
            <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-pretty">
              «{valoracion.comentario}»
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
