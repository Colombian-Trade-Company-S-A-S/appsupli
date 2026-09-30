import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarIcon, PlusIcon, TargetIcon, UsersIcon } from 'lucide-react';
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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@/shared/components/ui';
import { Encabezado } from '@/shared/components/layout';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/shared/components/ui';
import { EsqueletoPagina } from '@/shared/components/feedback';
import { fechaCorta, type Reto } from '../api';
import { useOpcionesChallenge, useRetos } from '../hooks';
import { CategoriaBadge, EstadoReto as EstadoRetoBadge } from '../components/Piezas';
import { FormularioReto } from '../components/FormularioReto';
import { BASE } from './ChallengeLayout';

function TarjetaReto({ reto }: { reto: Reto }) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CategoriaBadge label={reto.categoriaLabel} />
          <EstadoRetoBadge estado={reto.estado} label={reto.estadoLabel} />
        </div>
        <CardTitle className="text-pretty">{reto.titulo}</CardTitle>
        <CardDescription className="text-pretty">{reto.descripcion}</CardDescription>
      </CardHeader>
      <CardContent className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <CalendarIcon className="size-3.5" />
          Cierra el {fechaCorta(reto.cierraEl)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <UsersIcon className="size-3.5" />
          {reto.participacionesCount} participación(es)
        </span>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          render={<Link to={`${BASE}/retos/${reto.id}`} />}
        >
          Ver reto
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * La cartelera de retos.
 *
 * Cada quien ve los retos de su público; People ve además sus borradores, que
 * son los que todavía está armando.
 */
export default function RetosPage() {
  const { data: opciones } = useOpcionesChallenge();
  const [categoria, setCategoria] = useState('');
  const [estado, setEstado] = useState('');
  const [creando, setCreando] = useState(false);
  const { data: retos = [], isLoading } = useRetos({
    categoria: categoria || undefined,
    estado: estado || undefined,
  });

  if (!opciones) return <EsqueletoPagina forma="lista" label="Abriendo Supli Challenge…" />;

  const puedeCrear = opciones.capacidades.puedeGestionarRetos;

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="Supli Challenge"
        descripcion="Participa en los retos, suma tus logros y celebra al equipo."
      >
        {puedeCrear && (
          <Button onClick={() => setCreando(true)}>
            <PlusIcon data-icon="inline-start" />
            Crear reto
          </Button>
        )}
      </Encabezado>

      <div className="grid gap-4 sm:grid-cols-2 lg:max-w-xl">
        <Select
          items={[{ value: '', label: 'Todas las categorías' }, ...opciones.categorias]}
          value={categoria}
          onValueChange={(v) => setCategoria((v as string) ?? '')}
        >
          <SelectTrigger aria-label="Categoría">
            <SelectValue placeholder="Todas las categorías" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="">Todas las categorías</SelectItem>
              {opciones.categorias.map((opcion) => (
                <SelectItem key={opcion.value} value={opcion.value}>
                  {opcion.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select
          items={[{ value: '', label: 'Todos los estados' }, ...opciones.estados]}
          value={estado}
          onValueChange={(v) => setEstado((v as string) ?? '')}
        >
          <SelectTrigger aria-label="Estado">
            <SelectValue placeholder="Todos los estados" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="">Todos los estados</SelectItem>
              {opciones.estados.map((opcion) => (
                <SelectItem key={opcion.value} value={opcion.value}>
                  {opcion.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      ) : retos.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TargetIcon />
            </EmptyMedia>
            <EmptyTitle>Todavía no hay retos para ti</EmptyTitle>
            <EmptyDescription>
              {puedeCrear
                ? 'Crea el primero: defines sus condiciones y, al abrirlo, quedan fijas.'
                : 'Cuando People abra un reto de tu área, aparece acá.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {retos.map((reto) => (
            <TarjetaReto key={reto.id} reto={reto} />
          ))}
        </div>
      )}

      <Dialog open={creando} onOpenChange={setCreando}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Crear reto</DialogTitle>
            <DialogDescription>
              People define el reto y sus condiciones. Al abrirlo, las reglas quedan fijas y
              cualquier cambio queda en un historial visible para el colaborador.
            </DialogDescription>
          </DialogHeader>
          <FormularioReto
            opciones={opciones}
            onListo={() => setCreando(false)}
            onCancelar={() => setCreando(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
