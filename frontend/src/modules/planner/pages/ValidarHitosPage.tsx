import { useState } from 'react';
import { CheckIcon, FlagIcon, XIcon } from 'lucide-react';
import {
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldLabel,
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
import { EstadoTabla } from '@/shared/components/layout';
import { EsqueletoPagina } from '@/shared/components/feedback';
import { cn } from '@/shared/lib/utils';
import { diaCorto, type Hito } from '../api';
import { useHitos, useOpcionesPlanner, useValidarHito } from '../hooks';
import { EstadoHitoTag, SelectorSemana } from '../components/Piezas';

/**
 * Los Hitos de la semana para validar.
 *
 * El líder valida los de su equipo directo de lunes a miércoles de la semana
 * siguiente; lo que no valide pasa a «Sin validar» y cuenta como Cumplido.
 * People ve todos (puede filtrar por líder) y corrige fuera de la ventana.
 */
export default function ValidarHitosPage() {
  const { data: opciones } = useOpcionesPlanner();
  const [semana, setSemana] = useState<string>();
  const [lider, setLider] = useState<number>();
  const { data, isLoading } = useHitos(semana, lider);

  if (!opciones) return <EsqueletoPagina label="Abriendo los Hitos…" />;

  const lideres = [
    { value: '0', label: 'Todos los líderes' },
    ...(data?.lideres ?? []).map((l) => ({ value: String(l.id), label: l.nombre })),
  ];
  const s = data?.semana;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <SelectorSemana
          id="hitos-semana"
          label="Semana del Hito"
          semanas={opciones.semanas}
          value={semana ?? s?.codigo ?? ''}
          onChange={setSemana}
        />
        {opciones.capacidades.puedeGestionar && (
          <Field className="w-full min-w-0 sm:w-64">
            <FieldLabel htmlFor="hitos-lider">Líder</FieldLabel>
            <Select
              items={lideres}
              value={String(lider ?? 0)}
              onValueChange={(v) => setLider(Number(v) || undefined)}
            >
              <SelectTrigger id="hitos-lider">
                <SelectValue placeholder="Todos los líderes" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {lideres.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        )}
      </div>

      {s && (
        <div
          role="status"
          className={cn(
            'rounded-xl border px-4 py-3 text-sm text-pretty',
            data?.ventanaAbierta
              ? 'border-sky-500/40 bg-sky-500/10 text-sky-900 dark:text-sky-200'
              : 'border-border bg-muted/40 text-muted-foreground',
          )}
        >
          {data?.ventanaAbierta
            ? `Ventana abierta: del ${diaCorto(s.ventanaDesde)} al ${diaCorto(s.ventanaHasta)}. Lo que no se valide antes de cerrar la ventana pasa a «Sin validar» y cuenta como Cumplido.`
            : `La ventana de ${s.etiqueta} es del ${diaCorto(s.ventanaDesde)} al ${diaCorto(s.ventanaHasta)}.${
                data?.puedeFueraDeVentana
                  ? ' Como People, puedes corregir fuera de la ventana.'
                  : ''
              }`}
        </div>
      )}

      <Card className="py-0">
        <CardHeader className="pt-6">
          <CardTitle>Hitos de {s?.etiqueta ?? 'la semana'}</CardTitle>
          <CardDescription>
            El Hito es la tarea con la etiqueta HITO en el depósito de esa semana.
          </CardDescription>
        </CardHeader>
        <EstadoTabla
          cargando={isLoading}
          vacio={(data?.hitos.length ?? 0) === 0}
          icono={<FlagIcon />}
          titulo="No hay Hitos para validar"
          descripcion="Aparecen cuando la lectura de Planner encuentra la semana en los planes de tu equipo."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Persona</TableHead>
                <TableHead>Hito de la semana</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Comentario</TableHead>
                <TableHead>Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.hitos.map((hito) => (
                <FilaHito
                  key={hito.id}
                  hito={hito}
                  mostrarLider={opciones.capacidades.puedeGestionar}
                />
              ))}
            </TableBody>
          </Table>
        </EstadoTabla>
      </Card>
    </div>
  );
}

function FilaHito({ hito, mostrarLider }: { hito: Hito; mostrarLider: boolean }) {
  const [comentario, setComentario] = useState(hito.comentario);
  const validar = useValidarHito();
  const enviar = (estado: 'cumplido' | 'no_cumplido') =>
    validar.mutate({ id: hito.id, estado, comentario });

  return (
    <TableRow>
      <TableCell className="font-medium">
        {hito.persona}
        {mostrarLider && hito.lider && (
          <span className="block text-xs font-normal text-muted-foreground">
            Líder: {hito.lider}
          </span>
        )}
      </TableCell>
      <TableCell className="max-w-80 whitespace-normal text-muted-foreground">
        {hito.texto || <i>Sin tarea HITO</i>}
      </TableCell>
      <TableCell>
        <EstadoHitoTag estado={hito.estado} label={hito.estadoLabel} />
        {hito.validadoPor && (
          <span className="mt-1 block text-[11px] text-muted-foreground">
            por {hito.validadoPor}
          </span>
        )}
      </TableCell>
      <TableCell className="min-w-48">
        <Input
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          disabled={!hito.puedeValidar}
          aria-label={`Comentario de ${hito.persona}`}
          placeholder="Opcional"
        />
      </TableCell>
      <TableCell>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={hito.estado === 'cumplido' ? 'default' : 'outline'}
            disabled={!hito.puedeValidar || validar.isPending}
            onClick={() => enviar('cumplido')}
          >
            <CheckIcon /> Cumplido
          </Button>
          <Button
            size="sm"
            variant={hito.estado === 'no_cumplido' ? 'destructive' : 'outline'}
            disabled={!hito.puedeValidar || validar.isPending}
            onClick={() => enviar('no_cumplido')}
          >
            <XIcon /> No cumplido
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
