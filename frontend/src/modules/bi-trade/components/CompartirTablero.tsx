import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckIcon,
  CopyIcon,
  KeyRoundIcon,
  Link2Icon,
  Share2Icon,
  Trash2Icon,
  TriangleAlertIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Input,
  Separator,
  Skeleton,
  Spinner,
  Switch,
  ToggleGroup,
  ToggleGroupItem,
} from '@/shared/components/ui';
import { ConfirmarBorrado } from '@/shared/components/feedback';
import { useAuth } from '@/core/auth';
import { ApiError } from '@/shared/api/http-client';
import { formatoFechaHora, formatoNumero } from '@/shared/lib/formato';
import {
  enlacesApi,
  urlDelEnlace,
  urlDelFormulario,
  type CanalEnlace,
  type EnlaceConClave,
  type EnlacePublico,
} from '../api';

const PERMISO = 'bi-trade:data:manage';
const LLAVE = ['bi-trade', 'enlaces'] as const;

/** Cuánto dura un enlace nuevo. `null` es que no vence. */
const VIGENCIAS: Array<{ value: string; label: string; dias: number | null }> = [
  { value: 'nunca', label: 'No vence', dias: null },
  { value: '1', label: '1 día', dias: 1 },
  { value: '7', label: '7 días', dias: 7 },
  { value: '30', label: '30 días', dias: 30 },
];

const mensaje = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Ocurrió un error inesperado.';

async function copiar(texto: string, aviso: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(aviso);
  } catch {
    toast.error('El navegador no dio permiso para copiar.');
  }
}

/**
 * Compartir el tablero con alguien que no tiene cuenta.
 *
 * Solo lo ve quien puede editar datos: compartir el tablero es sacar
 * información del negocio, y el backend lo exige igual. Esconder el botón no
 * es la protección —esa está en el servidor—, es no ofrecer lo que va a fallar.
 */
export function CompartirTablero({
  canal,
  titulo = 'Compartir el tablero',
  descripcion = 'Un enlace de solo lectura con contraseña. Quien lo abra ve las hojas de este tablero sin cuenta, sin exportar y sin editar nada.',
  urlDe = urlDelEnlace,
  etiqueta = 'Tablero',
}: {
  canal: CanalEnlace;
  titulo?: string;
  descripcion?: string;
  /** Cómo se arma la URL que se comparte: cada tipo de enlace tiene la suya. */
  urlDe?: (token: string) => string;
  /** Cómo se nombra al copiar el enlace con su contraseña. */
  etiqueta?: string;
}) {
  const { user } = useAuth();
  const [abierto, setAbierto] = useState(false);

  const puede = !!user && (user.isAdmin || user.permissions.includes(PERMISO));
  if (!puede) return null;

  return (
    <>
      <Button variant="outline" onClick={() => setAbierto(true)}>
        <Share2Icon data-icon="inline-start" />
        Compartir
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription>{descripcion}</DialogDescription>
          </DialogHeader>
          {abierto && <ContenidoCompartir canal={canal} urlDe={urlDe} etiqueta={etiqueta} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Compartir el formulario del plan Partners con alguien sin cuenta.
 *
 * Es el mismo mecanismo del tablero —token en la URL y contraseña aparte— pero
 * el enlace solo diligencia: no muestra lo cargado ni abre ningún tablero.
 */
export function CompartirFormulario() {
  return (
    <CompartirTablero
      canal="partners"
      titulo="Compartir el formulario"
      descripcion="Un enlace abierto: quien lo reciba diligencia sin cuenta y sin contraseña, para no tener que escribirla cada vez. Solo puede enviar recomendaciones; no ve lo cargado ni los tableros. Si se filtra, revócalo y comparte otro."
      urlDe={urlDelFormulario}
      etiqueta="Formulario"
    />
  );
}

function ContenidoCompartir({
  canal,
  urlDe,
  etiqueta,
}: {
  canal: CanalEnlace;
  urlDe: (token: string) => string;
  etiqueta: string;
}) {
  const queryClient = useQueryClient();
  const [recien, setRecien] = useState<EnlaceConClave | null>(null);

  // Cada tablero lista sus propios enlaces: los de Claro no salen en Homecenter.
  const enlaces = useQuery({
    queryKey: [...LLAVE, canal],
    queryFn: () => enlacesApi.list(canal),
  });
  const refrescar = () => queryClient.invalidateQueries({ queryKey: LLAVE });

  return (
    <div className="flex flex-col gap-5">
      {recien && (
        <ClaveNueva
          enlace={recien}
          urlDe={urlDe}
          etiqueta={etiqueta}
          onListo={() => setRecien(null)}
        />
      )}

      <NuevoEnlace
        canal={canal}
        onCreado={(enlace) => {
          setRecien(enlace);
          void refrescar();
        }}
      />

      <Separator />

      <div className="flex flex-col gap-3">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Enlaces creados
        </p>
        {enlaces.isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (enlaces.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no has compartido el tablero.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {(enlaces.data ?? []).map((enlace) => (
              <FilaEnlace
                key={enlace.idEnlace}
                enlace={enlace}
                urlDe={urlDe}
                onCambio={() => void refrescar()}
                onClaveNueva={(conClave) => {
                  setRecien(conClave);
                  void refrescar();
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function NuevoEnlace({
  canal,
  onCreado,
}: {
  canal: CanalEnlace;
  onCreado: (enlace: EnlaceConClave) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [vigencia, setVigencia] = useState('nunca');

  const crear = useMutation({
    mutationFn: () => {
      const dias = VIGENCIAS.find((v) => v.value === vigencia)?.dias ?? null;
      return enlacesApi.create({
        canal,
        nombre: nombre.trim(),
        expira: dias ? new Date(Date.now() + dias * 86_400_000).toISOString() : null,
      });
    },
    onSuccess: (enlace) => {
      setNombre('');
      onCreado(enlace);
    },
    onError: (error) => toast.error(mensaje(error)),
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (nombre.trim()) crear.mutate();
  };

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="enlace-nombre">Para quién es</FieldLabel>
          <Input
            id="enlace-nombre"
            value={nombre}
            placeholder="Gerencia Claro, Regional Norte…"
            maxLength={120}
            onChange={(e) => setNombre(e.target.value)}
          />
          <FieldDescription>
            Solo para reconocerlo en esta lista. Es lo que ve quien abre el enlace.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel>Vence</FieldLabel>
          <ToggleGroup
            value={[vigencia]}
            onValueChange={(v) => setVigencia(v[0] ?? 'nunca')}
            variant="outline"
            className="flex-wrap"
          >
            {VIGENCIAS.map((opcion) => (
              <ToggleGroupItem key={opcion.value} value={opcion.value}>
                {opcion.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
        <Button
          type="submit"
          className="w-full sm:w-fit"
          disabled={!nombre.trim() || crear.isPending}
        >
          {crear.isPending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <Link2Icon data-icon="inline-start" />
          )}
          Generar enlace
        </Button>
      </FieldGroup>
    </form>
  );
}

/**
 * La URL y la contraseña recién generadas.
 *
 * Es la única vez que se ve la contraseña: el servidor solo guarda su hash.
 * Por eso el aviso va arriba y en rojo, y hay un botón que copia las dos
 * cosas juntas, listas para pegar en un correo o un chat.
 */
function ClaveNueva({
  enlace,
  urlDe,
  etiqueta,
  onListo,
}: {
  enlace: EnlaceConClave;
  urlDe: (token: string) => string;
  etiqueta: string;
  onListo: () => void;
}) {
  const url = urlDe(enlace.token);
  const [copiadoTodo, setCopiadoTodo] = useState(false);

  // El formulario va abierto: no hay contraseña que guardar, solo el enlace.
  if (!enlace.clave) {
    return (
      <Alert>
        <Link2Icon />
        <AlertTitle>Enlace listo para compartir</AlertTitle>
        <AlertDescription>
          <div className="mt-3 flex w-full flex-col gap-3 text-foreground">
            <Dato
              etiqueta={etiqueta}
              valor={url}
              onCopiar={() => void copiar(url, 'Enlace copiado')}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => {
                  void copiar(url, 'Enlace copiado');
                  setCopiadoTodo(true);
                }}
              >
                {copiadoTodo ? (
                  <CheckIcon data-icon="inline-start" />
                ) : (
                  <CopyIcon data-icon="inline-start" />
                )}
                Copiar enlace
              </Button>
              <Button size="sm" variant="outline" onClick={onListo}>
                Listo
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Cualquiera con este enlace puede diligenciar, sin contraseña. Si se filtra, revócalo
              con el interruptor y comparte uno nuevo.
            </p>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="destructive">
      <TriangleAlertIcon />
      <AlertTitle>Guarda la contraseña ahora: no se vuelve a mostrar</AlertTitle>
      <AlertDescription>
        <div className="mt-3 flex w-full flex-col gap-3 text-foreground">
          <Dato etiqueta="Enlace" valor={url} onCopiar={() => void copiar(url, 'Enlace copiado')} />
          <Dato
            etiqueta="Contraseña"
            valor={enlace.clave}
            destacado
            onCopiar={() => void copiar(enlace.clave, 'Contraseña copiada')}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                void copiar(
                  `${etiqueta}: ${url}\nContraseña: ${enlace.clave}`,
                  'Enlace y contraseña copiados',
                );
                setCopiadoTodo(true);
              }}
            >
              {copiadoTodo ? (
                <CheckIcon data-icon="inline-start" />
              ) : (
                <CopyIcon data-icon="inline-start" />
              )}
              Copiar los dos
            </Button>
            <Button size="sm" variant="outline" onClick={onListo}>
              Ya la guardé
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Por seguridad, envía el enlace y la contraseña por canales distintos cuando puedas.
          </p>
        </div>
      </AlertDescription>
    </Alert>
  );
}

function Dato({
  etiqueta,
  valor,
  destacado = false,
  onCopiar,
}: {
  etiqueta: string;
  valor: string;
  destacado?: boolean;
  onCopiar: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{etiqueta}</span>
      <div className="flex items-center gap-2">
        <code
          className={
            destacado
              ? 'min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1.5 font-mono text-base font-semibold tracking-wider'
              : 'min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1.5 font-mono text-xs'
          }
        >
          {valor}
        </code>
        <Button
          size="icon-sm"
          variant="outline"
          aria-label={`Copiar ${etiqueta.toLowerCase()}`}
          onClick={onCopiar}
        >
          <CopyIcon />
        </Button>
      </div>
    </div>
  );
}

function EstadoEnlace({ enlace }: { enlace: EnlacePublico }) {
  if (!enlace.activo) return <Badge variant="outline">Revocado</Badge>;
  if (!enlace.vigente) return <Badge variant="outline">Vencido</Badge>;
  return <Badge variant="success">Activo</Badge>;
}

/**
 * Un enlace de la lista con sus acciones.
 *
 * Regenerar la contraseña pide una segunda confirmación en la misma fila, sin
 * abrir otro diálogo: saca a quien lo tenga abierto, pero no es un borrado, y
 * un diálogo rojo de «eliminar» exageraría lo que pasa.
 */
function FilaEnlace({
  enlace,
  urlDe,
  onCambio,
  onClaveNueva,
}: {
  enlace: EnlacePublico;
  urlDe: (token: string) => string;
  onCambio: () => void;
  onClaveNueva: (enlace: EnlaceConClave) => void;
}) {
  const [confirmarClave, setConfirmarClave] = useState(false);
  const [borrarAbierto, setBorrarAbierto] = useState(false);
  // El formulario no tiene contraseña, y sus «accesos» son envíos recibidos.
  const abierto = enlace.canal === 'partners';

  const alternar = useMutation({
    mutationFn: (activo: boolean) => enlacesApi.update(enlace.idEnlace, { activo }),
    onSuccess: (_, activo) => {
      toast.success(activo ? 'Enlace reactivado' : 'Enlace revocado: ya no abre');
      onCambio();
    },
    onError: (error) => toast.error(mensaje(error)),
  });

  const regenerar = useMutation({
    mutationFn: () => enlacesApi.regenerarClave(enlace.idEnlace),
    onSuccess: (conClave) => {
      setConfirmarClave(false);
      toast.success('Contraseña nueva: la anterior dejó de funcionar');
      onClaveNueva(conClave);
    },
    onError: (error) => toast.error(mensaje(error)),
  });

  const borrar = useMutation({
    mutationFn: () => enlacesApi.remove(enlace.idEnlace),
    onSuccess: () => {
      toast.success('Enlace eliminado');
      onCambio();
    },
    onError: (error) => toast.error(mensaje(error)),
  });

  return (
    <li className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-center gap-2">
            <span className="truncate font-medium">{enlace.nombre}</span>
            <EstadoEnlace enlace={enlace} />
            {abierto && <Badge variant="outline">Sin contraseña</Badge>}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatoNumero(enlace.accesos)} {abierto ? 'envío' : 'acceso'}
            {enlace.accesos === 1 ? '' : 's'}
            {enlace.ultimoAcceso && ` · último ${formatoFechaHora(enlace.ultimoAcceso)}`}
            {enlace.expira && ` · vence ${formatoFechaHora(enlace.expira)}`}
            {enlace.creadoPor && ` · por ${enlace.creadoPor}`}
          </span>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          <Switch
            checked={enlace.activo}
            disabled={alternar.isPending}
            onCheckedChange={(v) => alternar.mutate(!!v)}
            aria-label={enlace.activo ? 'Revocar el enlace' : 'Reactivar el enlace'}
          />
          {enlace.activo ? 'Activo' : 'Revocado'}
        </label>
      </div>

      {confirmarClave ? (
        <div className="flex flex-col gap-2 rounded-md bg-muted/50 p-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs">
            Quien lo tenga abierto tendrá que escribir la contraseña nueva. La URL no cambia.
          </span>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirmarClave(false)}>
              Cancelar
            </Button>
            <Button size="sm" disabled={regenerar.isPending} onClick={() => regenerar.mutate()}>
              {regenerar.isPending && <Spinner data-icon="inline-start" />}
              Sí, regenerar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void copiar(urlDe(enlace.token), 'Enlace copiado')}
          >
            <CopyIcon data-icon="inline-start" />
            Copiar enlace
          </Button>
          {!abierto && (
            <Button size="sm" variant="outline" onClick={() => setConfirmarClave(true)}>
              <KeyRoundIcon data-icon="inline-start" />
              Nueva contraseña
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            aria-label="Eliminar el enlace"
            onClick={() => setBorrarAbierto(true)}
          >
            <Trash2Icon />
          </Button>
        </div>
      )}

      <ConfirmarBorrado
        abierto={borrarAbierto}
        onOpenChange={setBorrarAbierto}
        titulo="¿Eliminar el enlace?"
        descripcion={`«${enlace.nombre}» deja de abrir para siempre. Si solo quieres cortarlo por un tiempo, revócalo con el interruptor.`}
        onConfirmar={() => {
          borrar.mutate();
          setBorrarAbierto(false);
        }}
      />
    </li>
  );
}
