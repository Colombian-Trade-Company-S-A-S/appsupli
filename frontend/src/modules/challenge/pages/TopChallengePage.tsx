import { TrophyIcon } from 'lucide-react';
import {
  Avatar,
  AvatarFallback,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui';
import { Encabezado, EstadoTabla } from '@/shared/components/layout';
import { cn } from '@/shared/lib/utils';
import { useAuth } from '@/core/auth';
import { useTopChallenge } from '../hooks';
import { iniciales } from '../components/Piezas';

/**
 * El Top Challenge: cultura y participación.
 *
 * Solo entran los retos cerrados o finalizados: mientras un reto sigue
 * abierto, su ganador todavía puede cambiar.
 */
export default function TopChallengePage() {
  const { user } = useAuth();
  const { data, isLoading } = useTopChallenge();
  const ranking = data?.ranking ?? [];
  const [primero] = ranking;

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="Top Challenge"
        descripcion="Por cultura y participación: quién suma más en los retos ya cerrados."
      >
        {data?.miPosicion && (
          <span className="text-sm text-muted-foreground">
            Tu posición: <b className="text-foreground">puesto {data.miPosicion}</b>
          </span>
        )}
      </Encabezado>

      {primero && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex flex-wrap items-center gap-4 pt-6">
            <Avatar className="size-14">
              <AvatarFallback className="bg-amber-500/20 text-lg font-semibold">
                {iniciales(primero.nombre)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <TrophyIcon className="size-3.5 text-amber-500" />
                Lidera el Challenge
              </p>
              <p className="text-lg font-semibold">{primero.nombre}</p>
              <p className="text-sm text-muted-foreground">
                {primero.retos} reto(s) · {primero.ganados} ganado(s) · {primero.puntos} puntos
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="py-0">
        <EstadoTabla
          cargando={isLoading}
          vacio={ranking.length === 0}
          icono={<TrophyIcon />}
          titulo="Todavía no hay retos cerrados"
          descripcion="El ranking aparece cuando se cierre el primer reto con participaciones valoradas."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Colaborador</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead className="text-right">Retos</TableHead>
                <TableHead className="text-right">Ganados</TableHead>
                <TableHead className="text-right">Puntos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ranking.map((fila, indice) => (
                <TableRow
                  key={fila.participante}
                  className={cn(fila.participante === user?.id && 'bg-muted/50')}
                >
                  <TableCell className="tabular-nums text-muted-foreground">{indice + 1}</TableCell>
                  <TableCell className="font-medium">{fila.nombre}</TableCell>
                  <TableCell className="text-muted-foreground">{fila.cargo || '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{fila.retos}</TableCell>
                  <TableCell className="text-right tabular-nums">{fila.ganados}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {fila.puntos}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </EstadoTabla>
      </Card>
    </div>
  );
}
