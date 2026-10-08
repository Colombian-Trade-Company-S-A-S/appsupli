import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftIcon, PencilIcon, PlusIcon, SearchIcon, Trash2Icon } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Input,
  Label,
  Spinner,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui';
import { ConfirmarBorrado } from '@/shared/components/feedback';
import { Encabezado, EstadoTabla } from '@/shared/components/layout';
import { formatoNumero } from '@/shared/lib/formato';
import { useBiTradeMutation } from '../hooks';
import { CampoSelect } from './CampoSelect';

/**
 * El CRUD de una lista de un plan: buscar, filtrar, crear, editar, desactivar
 * y borrar.
 *
 * Las listas de los planes —regionales, puntos, asesores, categorías,
 * productos— son la misma pantalla con distintos campos. Cada una se describe
 * con una configuración y `Catalogo` arma la tabla y el diálogo.
 */
export type Valores = Record<string, string | boolean>;
export type Opcion = { value: string; label: string };

export interface Campo {
  clave: string;
  label: string;
  tipo: 'texto' | 'select' | 'activo';
  placeholder?: string;
  maxLength?: number;
  /** Para los números (un precio): abre el teclado numérico en el móvil. */
  numerico?: boolean;
  /** La llave del negocio: se escribe al crear y no se cambia después. */
  esCodigo?: boolean;
  opciones?: Opcion[];
  ayuda?: string;
}

export interface Columna<T> {
  titulo: string;
  celda: (fila: T) => ReactNode;
  className?: string;
}

export interface Config<T> {
  /** Identifica la lista en los `id` del formulario: `regionales`, `productos`… */
  clave: string;
  titulo: string;
  descripcion: string;
  /** A dónde lleva «Volver»: la página del plan. */
  volverA: string;
  singular: string;
  filas: T[];
  cargando: boolean;
  id: (fila: T) => string | number;
  nombre: (fila: T) => string;
  activo: (fila: T) => boolean;
  /** Texto en el que busca la caja de búsqueda. */
  textoDe: (fila: T) => string;
  filtro?: { label: string; opciones: Opcion[]; valorDe: (fila: T) => string };
  columnas: Columna<T>[];
  campos: Campo[];
  valores: (fila: T | null) => Valores;
  /** De lo escrito en el diálogo a lo que se manda al backend. */
  payload: (valores: Valores, editando: boolean) => Record<string, unknown>;
  crear: (payload: Record<string, unknown>) => Promise<unknown>;
  editar: (id: string | number, payload: Record<string, unknown>) => Promise<unknown>;
  borrar: (id: string | number) => Promise<unknown>;
  /** Lo que se le advierte a quien edita: qué más cambia con el cambio. */
  avisoEdicion?: string;
}

export const Estado = ({ activo }: { activo: boolean }) =>
  activo ? (
    <Badge variant="secondary">Activo</Badge>
  ) : (
    <Badge variant="outline" className="text-muted-foreground">
      Inactivo
    </Badge>
  );

export const Cuenta = ({ n }: { n: number }) => (
  <span className="tabular-nums">{formatoNumero(n)}</span>
);

const normalizar = (texto: string) => texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function Catalogo<T>({
  config,
  puedeAdministrar,
}: {
  config: Config<T>;
  puedeAdministrar: boolean;
}) {
  const { titulo, descripcion } = config;
  const [buscar, setBuscar] = useState('');
  const [filtro, setFiltro] = useState('');
  const [editando, setEditando] = useState<T | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [porBorrar, setPorBorrar] = useState<T | null>(null);

  const borrar = useBiTradeMutation(
    (id: string | number) => config.borrar(id),
    `${config.singular} eliminado`,
  );

  const visibles = useMemo(() => {
    const termino = normalizar(buscar.trim());
    return config.filas.filter(
      (fila) =>
        (!termino || normalizar(config.textoDe(fila)).includes(termino)) &&
        (!filtro || !config.filtro || config.filtro.valorDe(fila) === filtro),
    );
  }, [config, buscar, filtro]);

  return (
    <div className="flex flex-col gap-6">
      <Encabezado titulo={titulo} descripcion={descripcion}>
        <Button variant="outline" render={<Link to={config.volverA} />}>
          <ArrowLeftIcon data-icon="inline-start" />
          Volver al plan
        </Button>
        {puedeAdministrar && (
          <Button
            onClick={() => {
              setEditando(null);
              setAbierto(true);
            }}
          >
            <PlusIcon data-icon="inline-start" />
            Nuevo
          </Button>
        )}
      </Encabezado>

      {!puedeAdministrar && (
        <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Puedes consultar la lista, pero para cambiarla necesitas el permiso de editar los datos de
          BI Trade.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative w-full max-w-md">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar…"
            aria-label="Buscar"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
          />
        </div>
        {config.filtro && (
          <CampoSelect
            id="filtro-lista"
            label={config.filtro.label}
            placeholder="Todos"
            className="w-full min-w-0 sm:w-64"
            value={filtro}
            onChange={setFiltro}
            opciones={config.filtro.opciones}
          />
        )}
      </div>

      <Card className="py-0">
        <EstadoTabla
          cargando={config.cargando}
          vacio={visibles.length === 0}
          icono={<SearchIcon />}
          titulo={config.filas.length === 0 ? 'La lista está vacía' : 'Nada coincide'}
          descripcion={
            config.filas.length === 0
              ? 'Crea el primero con el botón «Nuevo».'
              : 'Prueba con otra búsqueda o quita el filtro.'
          }
        >
          <Table>
            <TableHeader>
              <TableRow>
                {config.columnas.map((columna) => (
                  <TableHead key={columna.titulo} className={columna.className}>
                    {columna.titulo}
                  </TableHead>
                ))}
                <TableHead>Estado</TableHead>
                {puedeAdministrar && <TableHead className="text-right">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibles.map((fila) => (
                <TableRow key={config.id(fila)}>
                  {config.columnas.map((columna) => (
                    <TableCell key={columna.titulo} className={columna.className}>
                      {columna.celda(fila)}
                    </TableCell>
                  ))}
                  <TableCell>
                    <Estado activo={config.activo(fila)} />
                  </TableCell>
                  {puedeAdministrar && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Editar ${config.nombre(fila)}`}
                          onClick={() => {
                            setEditando(fila);
                            setAbierto(true);
                          }}
                        >
                          <PencilIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Eliminar ${config.nombre(fila)}`}
                          onClick={() => setPorBorrar(fila)}
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
        </EstadoTabla>
      </Card>

      <p className="text-xs text-muted-foreground">
        {visibles.length === config.filas.length
          ? `${formatoNumero(config.filas.length)} en total`
          : `${formatoNumero(visibles.length)} de ${formatoNumero(config.filas.length)}`}
      </p>

      <DialogoCatalogo
        config={config}
        abierto={abierto}
        onOpenChange={setAbierto}
        fila={editando}
      />

      <ConfirmarBorrado
        abierto={!!porBorrar}
        onOpenChange={(v) => !v && setPorBorrar(null)}
        titulo={`¿Eliminar ${porBorrar ? config.nombre(porBorrar) : ''}?`}
        descripcion="Solo se puede borrar si nada lo usa. Si ya tiene registros, desactívalo: deja de salir en el formulario y lo cargado no cambia."
        onConfirmar={() => {
          if (porBorrar) borrar.mutate(config.id(porBorrar));
          setPorBorrar(null);
        }}
      />
    </div>
  );
}

function DialogoCatalogo<T>({
  config,
  abierto,
  onOpenChange,
  fila,
}: {
  config: Config<T>;
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
  fila: T | null;
}) {
  const editando = fila !== null;
  const [valores, setValores] = useState<Valores>({});

  const guardar = useBiTradeMutation(
    (payload: Record<string, unknown>) =>
      fila !== null ? config.editar(config.id(fila), payload) : config.crear(payload),
    editando ? `${config.singular} actualizado` : `${config.singular} creado`,
  );

  useEffect(() => {
    if (abierto) setValores(config.valores(fila));
    // `config` cambia en cada render; lo que importa es abrir y la fila.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, fila]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    guardar.mutate(config.payload(valores, editando), { onSuccess: () => onOpenChange(false) });
  };

  const formId = `form-${config.clave}`;

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editando
              ? `Editar ${config.singular.toLowerCase()}`
              : `Nuevo: ${config.singular.toLowerCase()}`}
          </DialogTitle>
          {editando && config.avisoEdicion && (
            <DialogDescription>{config.avisoEdicion}</DialogDescription>
          )}
        </DialogHeader>

        <form id={formId} onSubmit={onSubmit} noValidate>
          <FieldGroup>
            {config.campos.map((campo) => {
              const id = `${config.clave}-${campo.clave}`;
              if (campo.tipo === 'activo') {
                return (
                  <div key={campo.clave} className="flex items-center gap-3">
                    <Switch
                      id={id}
                      checked={!!valores[campo.clave]}
                      onCheckedChange={(checked) =>
                        setValores({ ...valores, [campo.clave]: checked })
                      }
                    />
                    <Label htmlFor={id} className="flex flex-col items-start gap-0.5">
                      {campo.label}
                      {campo.ayuda && (
                        <span className="text-xs font-normal text-muted-foreground">
                          {campo.ayuda}
                        </span>
                      )}
                    </Label>
                  </div>
                );
              }
              if (campo.tipo === 'select') {
                return (
                  <div key={campo.clave} className="flex flex-col gap-1.5">
                    <CampoSelect
                      id={id}
                      label={campo.label}
                      placeholder={campo.placeholder ?? 'Selecciona'}
                      className="w-full min-w-0"
                      value={String(valores[campo.clave] ?? '')}
                      onChange={(valor) => setValores({ ...valores, [campo.clave]: valor })}
                      opciones={campo.opciones ?? []}
                      incluirTodas={false}
                    />
                    {campo.ayuda && <p className="text-xs text-muted-foreground">{campo.ayuda}</p>}
                  </div>
                );
              }
              const bloqueado = editando && campo.esCodigo;
              return (
                <Field key={campo.clave}>
                  <FieldLabel htmlFor={id}>{campo.label}</FieldLabel>
                  <Input
                    id={id}
                    maxLength={campo.maxLength}
                    inputMode={campo.numerico ? 'numeric' : undefined}
                    placeholder={campo.placeholder}
                    value={String(valores[campo.clave] ?? '')}
                    onChange={(e) => setValores({ ...valores, [campo.clave]: e.target.value })}
                    disabled={bloqueado}
                    required
                  />
                  {(bloqueado || campo.ayuda) && (
                    <FieldDescription>
                      {bloqueado ? 'El código es la llave: no se puede cambiar.' : campo.ayuda}
                    </FieldDescription>
                  )}
                </Field>
              );
            })}
          </FieldGroup>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} disabled={guardar.isPending}>
            {guardar.isPending && <Spinner data-icon="inline-start" />}
            {editando ? 'Guardar' : 'Crear'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const ACTIVO: Campo = {
  clave: 'activo',
  label: 'Activo',
  tipo: 'activo',
  ayuda: 'Si se desactiva, deja de salir en el formulario; lo ya cargado no cambia.',
};
