import { useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeftIcon, ClipboardCheckIcon, LockIcon, SearchIcon, UsersIcon } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui';
import { Encabezado, EstadoTabla, Kpi } from '@/shared/components/layout';
import { EsqueletoPagina } from '@/shared/components/feedback';
import { useAuth } from '@/core/auth';
import type { EstadoParticipacion, Participacion } from '../api';
import { useOpcionesChallenge, useParticipaciones, useReto } from '../hooks';
import { EstadoEntrega, EstadoReto as EstadoRetoBadge } from '../components/Piezas';
import { FormularioValoracion } from '../components/FormularioValoracion';
import { CalificacionesDeLaEntrega } from '../components/ResultadoDelReto';
import { BASE } from './ChallengeLayout';

const SIN_AREA = 'Sin área';

const ESTADOS: Array<{ value: '' | EstadoParticipacion; label: string }> = [
  { value: '', label: 'Todos los estados' },
  { value: 'entregada', label: 'Por calificar' },
  { value: 'valorada', label: 'Calificadas' },
  { value: 'descalificada', label: 'No cumple' },
];

const areaDe = (fila: Participacion) => fila.participanteArea || SIN_AREA;
const puntaje = (fila: Participacion) =>
  fila.puntajeConBonus === null ? null : Number(fila.puntajeConBonus);
const promedio = (valores: number[]) =>
  valores.length ? valores.reduce((total, valor) => total + valor, 0) / valores.length : null;
const enPuntos = (valor: number | null) =>
  valor === null ? '—' : valor.toFixed(1).replace(/\.0$/, '');

/** Un desplegable de filtro, con la opción «todos» como valor vacío. */
function Filtro({
  etiqueta,
  valor,
  opciones,
  onChange,
}: {
  etiqueta: string;
  valor: string;
  opciones: Array<{ value: string; label: string }>;
  onChange: (valor: string) => void;
}) {
  return (
    <Select items={opciones} value={valor} onValueChange={(v) => onChange((v as string) ?? '')}>
      <SelectTrigger className="w-full sm:w-52" aria-label={etiqueta}>
        <SelectValue placeholder={opciones[0]?.label} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {opciones.map((opcion) => (
            <SelectItem key={opcion.value} value={opcion.value}>
              {opcion.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

/**
 * Los detalles del reto, para People: la calificación de toda la empresa.
 *
 * Aquí viven los números del reto (respuestas, calificadas, por calificar,
 * promedio), el resumen por área y la tabla de respuestas con sus filtros,
 * desde donde se califica. Los puntajes aparecen cuando el reto se finaliza,
 * igual que para todos, y desde ese momento la calificación queda en firme:
 * el botón solo la muestra.
 */
export default function RetoGestionPage() {
  const { id } = useParams();
  const retoId = Number(id);
  const { user } = useAuth();
  const { data: opciones } = useOpcionesChallenge();
  const { data: reto, isLoading } = useReto(retoId);
  const { data: participaciones = [], isLoading: cargando } = useParticipaciones(retoId);

  const [area, setArea] = useState('');
  const [estado, setEstado] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [calificando, setCalificando] = useState<Participacion | null>(null);

  const finalizado = reto?.estado === 'finalizado';

  // Publicado, de mayor a menor puntaje; antes, en el orden en que llegaron.
  const ordenadas = useMemo(
    () =>
      finalizado
        ? [...participaciones].sort((a, b) => (puntaje(b) ?? -1) - (puntaje(a) ?? -1))
        : participaciones,
    [participaciones, finalizado],
  );

  const areas = useMemo(
    () => [...new Set(participaciones.map(areaDe))].sort((a, b) => a.localeCompare(b)),
    [participaciones],
  );

  const porArea = useMemo(
    () =>
      areas
        .map((nombre) => {
          const filas = participaciones.filter((fila) => areaDe(fila) === nombre);
          const calificadas = filas.filter((fila) => fila.estado !== 'entregada');
          const puntajes = filas
            .filter((fila) => fila.estado === 'valorada')
            .map(puntaje)
            .filter((valor): valor is number => valor !== null);
          return {
            nombre,
            total: filas.length,
            calificadas: calificadas.length,
            promedio: promedio(puntajes),
          };
        })
        .sort((a, b) => b.total - a.total),
    [areas, participaciones],
  );

  if (isLoading || !reto || !opciones)
    return <EsqueletoPagina forma="lista" label="Abriendo los detalles del reto…" />;

  const { puedeGestionarRetos, esEvaluador } = opciones.capacidades;
  // Solo People: quien participa no tiene detalles que ver, vuelve al reto.
  if (!puedeGestionarRetos && !esEvaluador)
    return <Navigate to={`${BASE}/retos/${retoId}`} replace />;

  const texto = busqueda.trim().toLowerCase();
  const filtradas = ordenadas.filter(
    (fila) =>
      (!area || areaDe(fila) === area) &&
      (!estado || fila.estado === estado) &&
      (!texto ||
        fila.participanteNombre.toLowerCase().includes(texto) ||
        fila.participanteCargo.toLowerCase().includes(texto)),
  );
  const porCalificar = participaciones.filter((fila) => fila.estado === 'entregada').length;
  const promedioEmpresa = promedio(
    participaciones
      .filter((fila) => fila.estado === 'valorada')
      .map(puntaje)
      .filter((valor): valor is number => valor !== null),
  );
  const masParticipacion = Math.max(...porArea.map((fila) => fila.total), 1);
  const posicion = new Map(ordenadas.map((fila, indice) => [fila.id, indice + 1]));

  return (
    <div className="flex flex-col gap-6">
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        render={<Link to={`${BASE}/retos/${reto.id}`} />}
      >
        <ArrowLeftIcon />
        Volver al reto
      </Button>

      <Encabezado
        titulo={`Detalles · ${reto.titulo}`}
        descripcion="La calificación de toda la empresa: quién participó, cómo va la calificación y cómo le fue a cada área."
      >
        <EstadoRetoBadge estado={reto.estado} label={reto.estadoLabel} />
      </Encabezado>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Respuestas recibidas" value={participaciones.length} />
        <Kpi label="Calificadas" value={participaciones.length - porCalificar} />
        <Kpi
          label="Por calificar"
          value={porCalificar}
          hint={
            !finalizado && porCalificar > 0
              ? 'Con al menos una calificación ya se puede finalizar'
              : undefined
          }
        />
        <Kpi
          label="Promedio de la empresa"
          value={finalizado ? enPuntos(promedioEmpresa) : '—'}
          hint={finalizado ? 'De 100 puntos, sin las que no cumplen' : 'Se calcula al publicar'}
        />
      </div>

      {porArea.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UsersIcon className="size-4 text-primary" />
              Por área
            </CardTitle>
            <CardDescription>
              Cuántas personas de cada área participaron
              {finalizado ? ' y su promedio.' : ' y cuántas ya están calificadas.'} Toca un área
              para filtrar la tabla.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-x-8 gap-y-3 md:grid-cols-2">
              {porArea.map((fila) => (
                <li key={fila.nombre}>
                  <button
                    type="button"
                    onClick={() => setArea(area === fila.nombre ? '' : fila.nombre)}
                    aria-pressed={area === fila.nombre}
                    className="flex w-full flex-col gap-1.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/60 aria-pressed:bg-primary/10"
                  >
                    <span className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate font-medium">{fila.nombre}</span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {fila.total} {fila.total === 1 ? 'respuesta' : 'respuestas'} ·{' '}
                        {finalizado
                          ? `promedio ${enPuntos(fila.promedio)}`
                          : `${fila.calificadas} calificada${fila.calificadas === 1 ? '' : 's'}`}
                      </span>
                    </span>
                    <span
                      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                      aria-hidden
                    >
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${(fila.total / masParticipacion) * 100}%` }}
                      />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card className="py-0">
        <CardHeader className="gap-4 pt-6">
          <div>
            <CardTitle>Respuestas</CardTitle>
            <CardDescription>
              {filtradas.length} de {participaciones.length} · la evidencia se muestra según la
              visibilidad del reto: {reto.visibilidadLabel.toLowerCase()}.
            </CardDescription>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative min-w-56 flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por nombre o cargo…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
            <Filtro
              etiqueta="Área"
              valor={area}
              onChange={setArea}
              opciones={[
                { value: '', label: 'Todas las áreas' },
                ...areas.map((nombre) => ({ value: nombre, label: nombre })),
              ]}
            />
            <Filtro etiqueta="Estado" valor={estado} onChange={setEstado} opciones={ESTADOS} />
          </div>
        </CardHeader>
        <EstadoTabla
          cargando={cargando}
          vacio={filtradas.length === 0}
          icono={<ClipboardCheckIcon />}
          titulo={
            participaciones.length ? 'Nadie coincide con los filtros' : 'Todavía no hay respuestas'
          }
          descripcion={
            participaciones.length
              ? 'Cambia el área, el estado o la búsqueda.'
              : 'Cuando alguien cargue su evidencia, aparece acá con su estado.'
          }
        >
          <Table>
            <TableHeader>
              <TableRow>
                {finalizado && <TableHead className="w-12">#</TableHead>}
                <TableHead>Participante</TableHead>
                <TableHead>Área</TableHead>
                <TableHead>Evidencia</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Puntaje</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((fila) => (
                <TableRow key={fila.id}>
                  {finalizado && (
                    <TableCell className="text-muted-foreground tabular-nums">
                      {posicion.get(fila.id)}
                    </TableCell>
                  )}
                  <TableCell>
                    <p className="font-medium">{fila.participanteNombre}</p>
                    <p className="text-xs text-muted-foreground">{fila.participanteCargo || '—'}</p>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{areaDe(fila)}</TableCell>
                  <TableCell>
                    {!fila.evidenciaVisible ? (
                      <span className="text-xs text-muted-foreground">Restringida</span>
                    ) : fila.entregaLink ? (
                      <a
                        href={fila.entregaLink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-primary underline-offset-4 hover:underline"
                      >
                        Ver soporte
                      </a>
                    ) : (
                      <span className="line-clamp-2 max-w-xs text-sm">{fila.entregaTexto}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <EstadoEntrega estado={fila.estado} label={fila.estadoLabel} />
                  </TableCell>
                  <TableCell
                    className="text-right font-medium tabular-nums"
                    title={finalizado ? undefined : 'Los puntajes se publican al finalizar'}
                  >
                    {finalizado ? enPuntos(puntaje(fila)) : '—'}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {esEvaluador && fila.participante !== user?.id && (
                      <Button
                        variant={!finalizado && fila.estado === 'entregada' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setCalificando(fila)}
                      >
                        {finalizado
                          ? 'Ver calificación'
                          : fila.estado === 'entregada'
                            ? 'Calificar'
                            : 'Editar calificación'}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </EstadoTabla>
      </Card>

      <Dialog open={!!calificando} onOpenChange={(abierta) => !abierta && setCalificando(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {finalizado ? 'Calificación' : 'Calificar respuesta'} ·{' '}
              {calificando?.participanteNombre}
            </DialogTitle>
            <DialogDescription>
              {finalizado
                ? 'El resultado ya se publicó: la calificación quedó en firme y no se modifica.'
                : 'Cada criterio de 1 a 10. El sistema promedia y lo lleva a 0–100. Puedes corregirla hasta que el reto se finalice.'}
            </DialogDescription>
          </DialogHeader>
          {calificando &&
            (finalizado ? (
              <div className="flex flex-col gap-4">
                <p className="flex items-start gap-2 rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  <LockIcon className="mt-0.5 size-3.5 shrink-0" />
                  Las calificaciones se corrigen hasta que se finaliza el reto; con el resultado
                  publicado ya no se modifican.
                </p>
                <CalificacionesDeLaEntrega participacion={calificando} conNombre />
              </div>
            ) : (
              <FormularioValoracion
                reto={reto}
                participacion={calificando}
                opciones={opciones}
                onListo={() => setCalificando(null)}
              />
            ))}
        </DialogContent>
      </Dialog>
    </div>
  );
}
