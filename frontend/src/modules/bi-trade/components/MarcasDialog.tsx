import { useMemo, useState, type FormEvent } from 'react';
import {
  CheckIcon,
  MergeIcon,
  PencilIcon,
  PlusIcon,
  TagsIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui';
import { ConfirmarBorrado } from '@/shared/components/feedback';
import { useAuth } from '@/core/auth';
import { formatoNumero } from '@/shared/lib/formato';
import { marcasApi, type Marca } from '../api';
import { useBiTradeMutation, useMarcas } from '../hooks';
import { CampoSelect } from './CampoSelect';

const PERMISO = 'bi-trade:data:manage';

/** «Bélkin » y «BELKIN» son la misma: así compara también el backend. */
const normalizar = (texto: string) =>
  texto.normalize('NFD').replace(/\p{M}/gu, '').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * El catálogo de marcas, desde la pantalla de productos.
 *
 * Es una sola lista para Claro, Homecenter, Falabella y Tmk. Renombrar una
 * marca la renombra en todos sus productos; fusionar dos —«Generico» en
 * «Generica»— deja todos sus productos en la que queda y borra la otra. Una
 * marca con productos no se borra: se fusiona.
 */
export function MarcasDialog() {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <Button variant="outline" onClick={() => setAbierto(true)}>
        <TagsIcon data-icon="inline-start" />
        Marcas
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Marcas</DialogTitle>
            <DialogDescription>
              Una sola lista para los cuatro canales: los productos eligen de aquí. Renombrar una
              marca la cambia en todos sus productos; si dos son la misma, fusiónalas.
            </DialogDescription>
          </DialogHeader>
          {abierto && <ListaMarcas />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ListaMarcas() {
  const { user } = useAuth();
  const puedeEditar = !!user && (user.isAdmin || user.permissions.includes(PERMISO));
  const { data: marcas = [], isLoading } = useMarcas();
  const [buscar, setBuscar] = useState('');
  const [nueva, setNueva] = useState('');
  const [editando, setEditando] = useState<{ id: number; nombre: string } | null>(null);
  const [fusionando, setFusionando] = useState<{ marca: Marca; destino: string } | null>(null);
  const [porBorrar, setPorBorrar] = useState<Marca | null>(null);

  const crear = useBiTradeMutation(
    (nombre: string) => marcasApi.create({ nombre }),
    'Marca creada',
  );
  const renombrar = useBiTradeMutation(
    ({ id, nombre }: { id: number; nombre: string }) => marcasApi.update(id, { nombre }),
    'Marca renombrada en todos sus productos',
  );
  const fusionar = useBiTradeMutation(
    ({ id, destino }: { id: number; destino: string }) => marcasApi.fusionar(id, destino),
    (datos) => datos.message,
  );
  const borrar = useBiTradeMutation((id: number) => marcasApi.remove(id), 'Marca eliminada');

  const visibles = useMemo(() => {
    const termino = normalizar(buscar);
    return marcas.filter((m) => !termino || normalizar(m.nombre).includes(termino));
  }, [marcas, buscar]);

  const onCrear = (event: FormEvent) => {
    event.preventDefault();
    if (nueva.trim()) crear.mutate(nueva.trim(), { onSuccess: () => setNueva('') });
  };

  return (
    <div className="flex flex-col gap-4">
      {puedeEditar && (
        <form onSubmit={onCrear} className="flex gap-2">
          <Input
            aria-label="Nueva marca"
            placeholder="Nueva marca"
            maxLength={60}
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
          />
          <Button type="submit" disabled={!nueva.trim() || crear.isPending}>
            {crear.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <PlusIcon data-icon="inline-start" />
            )}
            Agregar
          </Button>
        </form>
      )}

      <Input
        aria-label="Buscar marca"
        placeholder="Buscar…"
        value={buscar}
        onChange={(e) => setBuscar(e.target.value)}
      />

      {fusionando && (
        <div className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-3">
          <p className="text-sm">
            Fusionar <span className="font-medium">«{fusionando.marca.nombre}»</span>: sus{' '}
            {formatoNumero(fusionando.marca.productosCount)} producto(s) pasan a la marca que elijas
            y «{fusionando.marca.nombre}» se borra.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <CampoSelect
              id="marca-destino"
              label="Queda como"
              placeholder="Elige la marca"
              className="min-w-56 flex-1"
              value={fusionando.destino}
              onChange={(destino) => setFusionando({ ...fusionando, destino })}
              opciones={marcas
                .filter((m) => m.idMarca !== fusionando.marca.idMarca)
                .map((m) => ({ value: m.nombre, label: m.nombre }))}
              incluirTodas={false}
            />
            <Button variant="ghost" onClick={() => setFusionando(null)}>
              Cancelar
            </Button>
            <Button
              disabled={!fusionando.destino || fusionar.isPending}
              onClick={() =>
                fusionar.mutate(
                  { id: fusionando.marca.idMarca, destino: fusionando.destino },
                  { onSuccess: () => setFusionando(null) },
                )
              }
            >
              {fusionar.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <MergeIcon data-icon="inline-start" />
              )}
              Fusionar
            </Button>
          </div>
        </div>
      )}

      <div className="max-h-[50dvh] overflow-y-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Marca</TableHead>
              <TableHead className="text-right">Productos</TableHead>
              {puedeEditar && <TableHead className="text-right">Acciones</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground">
                  Cargando…
                </TableCell>
              </TableRow>
            )}
            {visibles.map((marca) => (
              <TableRow key={marca.idMarca}>
                <TableCell>
                  {editando?.id === marca.idMarca ? (
                    <form
                      className="flex gap-1"
                      onSubmit={(event) => {
                        event.preventDefault();
                        renombrar.mutate(editando, { onSuccess: () => setEditando(null) });
                      }}
                    >
                      <Input
                        aria-label={`Nuevo nombre de ${marca.nombre}`}
                        maxLength={60}
                        value={editando.nombre}
                        onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
                        autoFocus
                      />
                      <Button
                        type="submit"
                        size="icon"
                        variant="ghost"
                        aria-label="Guardar"
                        disabled={!editando.nombre.trim() || renombrar.isPending}
                      >
                        <CheckIcon />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Cancelar"
                        onClick={() => setEditando(null)}
                      >
                        <XIcon />
                      </Button>
                    </form>
                  ) : (
                    <span className="font-medium">{marca.nombre}</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {marca.productosCount ? (
                    formatoNumero(marca.productosCount)
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Sin productos
                    </Badge>
                  )}
                </TableCell>
                {puedeEditar && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Renombrar ${marca.nombre}`}
                        onClick={() => setEditando({ id: marca.idMarca, nombre: marca.nombre })}
                      >
                        <PencilIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Fusionar ${marca.nombre} con otra`}
                        onClick={() => setFusionando({ marca, destino: '' })}
                      >
                        <MergeIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Eliminar ${marca.nombre}`}
                        disabled={marca.productosCount > 0}
                        onClick={() => setPorBorrar(marca)}
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">{formatoNumero(marcas.length)} marcas</p>

      <ConfirmarBorrado
        abierto={!!porBorrar}
        onOpenChange={(v) => !v && setPorBorrar(null)}
        titulo={`¿Eliminar «${porBorrar?.nombre}»?`}
        descripcion="No la usa ningún producto. Si alguien la necesita después, se vuelve a crear."
        onConfirmar={() => {
          if (porBorrar) borrar.mutate(porBorrar.idMarca);
          setPorBorrar(null);
        }}
      />
    </div>
  );
}
