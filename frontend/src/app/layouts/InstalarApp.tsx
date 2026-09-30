import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AppWindowIcon,
  ArrowLeftIcon,
  BellRingIcon,
  CheckCircle2Icon,
  DownloadIcon,
  EllipsisVerticalIcon,
  LogInIcon,
  MonitorIcon,
  MonitorSmartphoneIcon,
  RefreshCwIcon,
  ShareIcon,
  SmartphoneIcon,
  SquarePlusIcon,
  UserIcon,
} from 'lucide-react';
import { useAuth } from '@/core/auth';
import { authApi } from '@/core/auth/auth.api';
import { env } from '@/shared/config/env';
import { instalar, useInstalacion } from '@/shared/lib/instalar';
import { cn } from '@/shared/lib/utils';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from '@/shared/components/ui';
import { IconoMarca } from './Marca';

type Decision = 'instalada' | 'despues' | 'visto';

/** Qué pasó al intentar instalar desde este navegador. */
type Resultado = 'instalada' | 'descartada' | 'ios' | 'noDisponible';

/**
 * La lógica compartida por el aviso y los botones: intentar instalar según lo
 * que permita el navegador y guardar la decisión en la cuenta.
 */
function useInstalarApp() {
  const estado = useInstalacion();
  const { setUser } = useAuth();

  const decidir = async (decision: Decision) => {
    try {
      setUser(await authApi.decidirInstalacion(decision));
    } catch {
      // Si no se pudo guardar, el aviso vuelve a salir: no hay nada que romper.
    }
  };

  const intentar = async (): Promise<Resultado> => {
    // Instalada durante esta misma visita (por ejemplo, desde el menú del navegador).
    if (estado.instalada) return 'instalada';
    if (estado.puede) return (await instalar()) === 'accepted' ? 'instalada' : 'descartada';
    if (estado.manual) return 'ios';
    return 'noDisponible';
  };

  return { estado, decidir, intentar };
}

type Paso = 'pregunta' | 'ios' | 'noDisponible' | 'lista' | 'manual' | 'recordar';

/**
 * La pantalla en la que va el aviso, guardada en el navegador. Así, aunque
 * recargue (F5, Ctrl+Shift+R), vuelve a la misma pantalla: el aviso solo
 * termina cuando la persona toca «He leído esta información».
 */
const clavePendiente = (usuario: number) => `supli.avisoApp.${usuario}`;

function leerPendiente(usuario?: number): Paso | null {
  if (!usuario) return null;
  try {
    return (localStorage.getItem(clavePendiente(usuario)) as Paso | null) ?? null;
  } catch {
    return null;
  }
}

function guardarPendiente(usuario: number, paso: Paso | null) {
  try {
    if (paso) localStorage.setItem(clavePendiente(usuario), paso);
    else localStorage.removeItem(clavePendiente(usuario));
  } catch {
    // Sin almacenamiento el aviso sigue funcionando; solo no sobrevive a recargar.
  }
}

/**
 * El aviso al entrar. Lo decide el backend con `avisoApp`:
 *
 * - `ofrecer` (sin instalar): «¿Deseas instalar la app?». Si dice «más tarde»
 *   se le explica cómo hacerlo a mano y vuelve a salir en 3 inicios de sesión.
 *   Si la instala, queda guardado y se le explica cómo usarla y cómo volver a
 *   instalarla si cambia de equipo.
 * - `recordar` (ya instalada): cada 10 inicios, un recordatorio de cómo
 *   instalarla en otro dispositivo —por si perdió el celular—. Solo «He leído esta información».
 */
export function AvisoInstalarApp() {
  const { user } = useAuth();
  const { estado, decidir, intentar } = useInstalarApp();
  const navigate = useNavigate();
  const [abierto, setAbierto] = useState(false);
  const [paso, setPaso] = useState<Paso>('pregunta');
  const [trabajando, setTrabajando] = useState(false);
  const mostrado = useRef(false);

  // Preguntar si instala no tiene sentido dentro de la app ya instalada; el
  // recordatorio sí, porque habla de instalarla en otro dispositivo. Si quedó
  // una pantalla a medias antes de recargar, se retoma esa.
  const aviso = user?.avisoApp;
  const pendiente = leerPendiente(user?.id);
  const toca =
    !!pendiente || aviso === 'recordar' || (aviso === 'ofrecer' && !estado.instalada);

  useEffect(() => {
    if (!toca || mostrado.current) return;
    // Se marca como mostrado dentro del temporizador: si React desmonta y
    // vuelve a montar (StrictMode), el primer temporizador se cancela y el
    // segundo tiene que poder abrirlo.
    const id = setTimeout(() => {
      mostrado.current = true;
      setPaso(pendiente ?? (aviso === 'recordar' ? 'recordar' : 'pregunta'));
      setAbierto(true);
    }, 600);
    return () => clearTimeout(id);
  }, [toca, aviso, pendiente]);

  // Mientras está abierto, cada pantalla queda guardada. Los pasos de Safari
  // y de «navegador no compatible» se retoman desde la pregunta.
  useEffect(() => {
    if (!abierto || !user) return;
    guardarPendiente(user.id, paso === 'ios' || paso === 'noDisponible' ? 'pregunta' : paso);
  }, [abierto, paso, user]);

  const cerrar = () => {
    if (user) guardarPendiente(user.id, null);
    setAbierto(false);
  };
  const volver = () => setPaso('pregunta');

  const responder = async (decision: Decision, siguiente: Paso | null) => {
    setTrabajando(true);
    await decidir(decision);
    setTrabajando(false);
    if (siguiente) setPaso(siguiente);
    else cerrar();
  };

  const aceptar = async () => {
    setTrabajando(true);
    const resultado = await intentar();
    setTrabajando(false);
    if (resultado === 'instalada') return responder('instalada', 'lista');
    if (resultado === 'descartada') return responder('despues', 'manual');
    setPaso(resultado);
  };

  const irAlInicio = () => {
    cerrar();
    navigate('/inicio', { state: { resaltarInstalar: true } });
  };

  return (
    // Sin X, sin Esc y sin cerrar al tocar afuera: solo se avanza con los
    // botones, y se cierra cuando la persona confirma que leyó la explicación.
    <Dialog open={abierto} onOpenChange={() => {}} disablePointerDismissal>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        {paso === 'pregunta' && (
          <>
            <LogoConBrillo />
            <DialogHeader className="items-center text-center">
              <DialogTitle className="font-heading text-xl">
                ¿Deseas instalar la app en tu dispositivo?
              </DialogTitle>
              <DialogDescription className="text-pretty">
                {env.appName} queda a un toque, como cualquier programa de tu computador o app de tu
                celular.
              </DialogDescription>
            </DialogHeader>
            <ul className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4 text-sm">
              <Linea icono={<AppWindowIcon />}>Se abre en su propia ventana, sin pestañas.</Linea>
              <Linea icono={<MonitorSmartphoneIcon />}>
                Queda en tu escritorio o en la pantalla de inicio del celular.
              </Linea>
              <Linea icono={<RefreshCwIcon />}>
                Se actualiza sola: nada que descargar de una tienda.
              </Linea>
            </ul>
            <DialogFooter className="gap-2 sm:justify-between">
              <Button
                variant="outline"
                disabled={trabajando}
                onClick={() => responder('despues', 'manual')}
              >
                <BellRingIcon data-icon="inline-start" />
                Recordarme más tarde
              </Button>
              <Button disabled={trabajando} onClick={aceptar}>
                {trabajando ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <DownloadIcon data-icon="inline-start" />
                )}
                Sí, instalar
              </Button>
            </DialogFooter>
          </>
        )}

        {paso === 'ios' && (
          <>
            <BotonVolver onClick={volver} />
            <DialogHeader>
              <DialogTitle>Instálala desde Safari</DialogTitle>
              <DialogDescription>
                En iPhone y iPad la instalación se hace a mano, en tres toques.
              </DialogDescription>
            </DialogHeader>
            <PasosIOS />
            <DialogFooter className="gap-2 sm:justify-between">
              <Button
                variant="outline"
                disabled={trabajando}
                onClick={() => responder('despues', 'manual')}
              >
                Lo haré después
              </Button>
              <Button disabled={trabajando} onClick={() => responder('instalada', 'lista')}>
                Listo, ya la agregué
              </Button>
            </DialogFooter>
          </>
        )}

        {paso === 'noDisponible' && (
          <>
            <BotonVolver onClick={volver} />
            <DialogHeader>
              <DialogTitle>Tu navegador no ofreció la instalación</DialogTitle>
              <DialogDescription className="text-pretty">
                Puede que ya la tengas instalada en este dispositivo —búscala en tu escritorio o en
                la pantalla de inicio— o que este navegador no lo permita. En Chrome y Edge sí se
                puede.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:justify-between">
              <Button
                variant="outline"
                disabled={trabajando}
                onClick={() => responder('despues', 'manual')}
              >
                Lo intentaré después
              </Button>
              <Button disabled={trabajando} onClick={() => responder('instalada', 'lista')}>
                Ya la tengo instalada
              </Button>
            </DialogFooter>
          </>
        )}

        {paso === 'lista' && (
          <>
            <ContenidoLista />
            <DialogFooter>
              <BotonLeido onClick={cerrar} />
            </DialogFooter>
          </>
        )}

        {paso === 'manual' && (
          <>
            <BotonVolver onClick={volver} />
            <DialogHeader className="items-center text-center">
              <DialogTitle className="font-heading text-xl">
                Puedes instalarla tú mismo cuando quieras
              </DialogTitle>
              <DialogDescription className="text-pretty">
                Te lo volveremos a recordar dentro de 3 inicios de sesión. Mientras tanto, así la
                instalas:
              </DialogDescription>
            </DialogHeader>
            <MiniInicio nombre={user?.firstName.split(' ')[0] ?? ''} />
            <DondeEsta />
            <ManualPorDispositivo />
            <DialogFooter>
              {/* Al cerrar lleva al Inicio y hace brillar el botón. */}
              <BotonLeido onClick={irAlInicio} />
            </DialogFooter>
          </>
        )}

        {paso === 'recordar' && (
          <>
            <LogoConBrillo />
            <DialogHeader className="items-center text-center">
              <DialogTitle className="font-heading text-xl">
                Recuerda: {env.appName} se instala en cualquier dispositivo
              </DialogTitle>
              <DialogDescription className="text-pretty">
                ¿Cambiaste de celular o de computador, o se te borró el ícono? Vuelve a instalarla
                en un minuto:
              </DialogDescription>
            </DialogHeader>
            <DondeEsta />
            <ManualPorDispositivo />
            <DialogFooter>
              <BotonLeido disabled={trabajando} onClick={() => responder('visto', null)} />
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Regresa a la pregunta, por si la persona no leyó bien. */
function BotonVolver({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-mt-1 -ml-1 inline-flex items-center gap-1.5 self-start rounded-md px-1.5 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <ArrowLeftIcon className="size-4" />
      Volver
    </button>
  );
}

/** El único cierre de las pantallas de explicación. */
function BotonLeido({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button className="w-full sm:w-auto" disabled={disabled} onClick={onClick}>
      <CheckCircle2Icon data-icon="inline-start" />
      He leído esta información
    </Button>
  );
}

function LogoConBrillo() {
  return (
    <div className="relative mx-auto mt-2 flex items-center justify-center">
      <span
        aria-hidden
        className="animate-brillo-marca absolute size-24 rounded-full bg-[#5932d7]/40 blur-2xl"
      />
      <IconoMarca className="relative size-16 rounded-2xl text-3xl shadow-lg shadow-[#5932d7]/30" />
    </div>
  );
}

function Linea({ icono, children }: { icono: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 shrink-0 text-primary [&>svg]:size-4">{icono}</span>
      <span className="text-pretty">{children}</span>
    </li>
  );
}

/**
 * Después de instalarla: cómo se usa y qué hacer si se pierde. Lo ven quienes
 * la instalan desde el aviso, el Inicio o Mi perfil.
 */
function ContenidoLista() {
  return (
    <>
      <div className="mx-auto mt-2 flex size-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
        <CheckCircle2Icon className="size-7" />
      </div>
      <DialogHeader className="items-center text-center">
        <DialogTitle className="font-heading text-xl">
          ¡Listo! {env.appName} quedó instalada
        </DialogTitle>
        <DialogDescription>Así la aprovechas:</DialogDescription>
      </DialogHeader>
      <ul className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4 text-sm">
        <Linea icono={<MonitorSmartphoneIcon />}>
          <b>Ábrela</b> desde el ícono de {env.appName} en tu escritorio, en el menú de inicio o en
          la pantalla de inicio del celular.
        </Linea>
        <Linea icono={<LogInIcon />}>
          <b>Tu sesión</b> es la misma: entras con tu correo y contraseña de siempre.
        </Linea>
        <Linea icono={<RefreshCwIcon />}>
          <b>No hay que actualizarla:</b> cada vez que la abres ya trae lo último.
        </Linea>
      </ul>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">¿Cambias de celular o la pierdes?</p>
        <DondeEsta />
      </div>
    </>
  );
}

/** Los dos botones de la plataforma para instalarla. */
function DondeEsta() {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex items-start gap-3 rounded-lg border px-3 py-2.5">
        <DownloadIcon className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="text-pretty">
          <b>Inicio:</b> el botón <b>«Instalar app»</b> está justo debajo del saludo y la fecha.
        </p>
      </div>
      <div className="flex items-start gap-3 rounded-lg border px-3 py-2.5">
        <UserIcon className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="text-pretty">
          <b>Mi perfil:</b> también está debajo de tu cargo y tu área.
        </p>
      </div>
    </div>
  );
}

/** Instalarla a mano, sin los botones, según el dispositivo. */
function ManualPorDispositivo() {
  return (
    <details className="group rounded-lg border text-sm [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 font-medium">
        O desde el navegador, sin los botones
        <span className="text-xs text-muted-foreground group-open:hidden">Ver cómo</span>
      </summary>
      <ul className="flex flex-col gap-3 border-t px-3 py-3">
        <Linea icono={<MonitorIcon />}>
          <b>Computador (Chrome o Edge):</b> el ícono <DownloadIcon className="inline size-3.5" /> al
          final de la barra de direcciones, o el menú{' '}
          <EllipsisVerticalIcon className="inline size-3.5" /> → <b>Instalar {env.appName}</b>.
        </Linea>
        <Linea icono={<SmartphoneIcon />}>
          <b>Android (Chrome):</b> menú <EllipsisVerticalIcon className="inline size-3.5" /> →{' '}
          <b>Instalar app</b> o <b>Agregar a pantalla principal</b>.
        </Linea>
        <Linea icono={<ShareIcon />}>
          <b>iPhone o iPad (Safari):</b> <b>Compartir</b> → <b>Agregar a inicio</b> →{' '}
          <b>Agregar</b>.
        </Linea>
      </ul>
    </details>
  );
}

/** Una miniatura del hero del inicio con el botón señalado. */
function MiniInicio({ nombre }: { nombre: string }) {
  return (
    <div
      aria-hidden
      className="relative overflow-hidden rounded-xl bg-[#0a0818] p-4 text-white ring-1 ring-white/10"
    >
      <div className="pointer-events-none absolute -top-10 -right-8 size-32 rounded-full bg-[#3b6dff]/35 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-12 -left-8 size-32 rounded-full bg-[#5932d7]/45 blur-2xl" />
      <p className="relative font-heading text-base font-bold">
        {saludo()}, <span className="text-[#c9a8ff]">{nombre}</span>
      </p>
      <p className="relative text-xs text-white/60 first-letter:uppercase">
        {new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>
      <span className="relative mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#0a0818] ring-4 ring-[#83e6ff]/40">
        <DownloadIcon className="size-3.5" />
        Instalar app
        <span className="absolute -inset-1.5 animate-pulse rounded-full ring-2 ring-[#83e6ff]/70 motion-reduce:animate-none" />
      </span>
    </div>
  );
}

const saludo = () => {
  const hora = new Date().getHours();
  if (hora < 12) return 'Buenos días';
  if (hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
};

/** Pasos de Safari en iPhone y iPad. */
export function PasosIOS() {
  return (
    <ol className="flex flex-col gap-3 text-sm">
      <PasoIOS n={1}>
        En Safari, toca <ShareIcon className="size-4" /> <strong>Compartir</strong>.
      </PasoIOS>
      <PasoIOS n={2}>
        Elige <SquarePlusIcon className="size-4" /> <strong>Agregar a inicio</strong>.
      </PasoIOS>
      <PasoIOS n={3}>
        Toca <strong>Agregar</strong>.
      </PasoIOS>
    </ol>
  );
}

function PasoIOS({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {n}
      </span>
      <span className="flex flex-wrap items-center gap-1.5">{children}</span>
    </li>
  );
}

/**
 * El botón «Instalar app» del Inicio (debajo del saludo) y de Mi perfil.
 * Instalar desde aquí también queda guardado en la cuenta y muestra la guía
 * de uso. En el Inicio desaparece cuando ya no hay nada que instalar en este
 * dispositivo; en el perfil queda el indicador «App instalada».
 */
export function BotonInstalarApp({
  variante,
  className,
}: {
  variante: 'inicio' | 'perfil';
  className?: string;
}) {
  const { user } = useAuth();
  const { estado, decidir, intentar } = useInstalarApp();
  const location = useLocation();
  const [dialogo, setDialogo] = useState<'ios' | 'noDisponible' | 'lista' | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [resaltar, setResaltar] = useState(false);

  // También si ya se estaba en el Inicio: la navegación trae un estado nuevo.
  useEffect(() => {
    if ((location.state as { resaltarInstalar?: boolean } | null)?.resaltarInstalar) {
      setResaltar(true);
    }
  }, [location.state]);

  useEffect(() => {
    if (!resaltar) return;
    const id = setTimeout(() => setResaltar(false), 6000);
    return () => clearTimeout(id);
  }, [resaltar]);

  const marcarInstalada = () => {
    void decidir('instalada');
    setDialogo('lista');
  };

  // Instalada aquí, o instalada en la cuenta y este navegador no ofrece nada.
  const yaEsta = estado.instalada || (!!user?.appInstalada && !estado.puede && !estado.manual);
  const mostrarBoton = !yaEsta;

  const alTocar = async () => {
    setTrabajando(true);
    const resultado = await intentar();
    setTrabajando(false);
    if (resultado === 'instalada') marcarInstalada();
    if (resultado === 'ios' || resultado === 'noDisponible') setDialogo(resultado);
  };

  return (
    <>
      {mostrarBoton ? (
        <button
          type="button"
          onClick={alTocar}
          disabled={trabajando}
          className={cn(
            'relative inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-all disabled:opacity-70',
            variante === 'inicio'
              ? 'bg-white text-[#0a0818] shadow-lg shadow-[#83e6ff]/20 hover:bg-white/90 hover:shadow-[#83e6ff]/40'
              : 'bg-brand-gradient text-white shadow-md shadow-[#5932d7]/30 hover:brightness-110',
            resaltar && 'ring-4 ring-[#83e6ff]/50',
            className,
          )}
        >
          {trabajando ? <Spinner className="size-4" /> : <DownloadIcon className="size-4" />}
          Instalar app
          {resaltar && (
            <span
              aria-hidden
              className="absolute -inset-2 animate-pulse rounded-full ring-2 ring-[#83e6ff]/80 motion-reduce:animate-none"
            />
          )}
        </button>
      ) : (
        variante === 'perfil' && (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300',
              className,
            )}
          >
            <CheckCircle2Icon className="size-3.5" />
            App instalada
          </span>
        )
      )}

      <Dialog open={dialogo !== null} onOpenChange={(abierto) => !abierto && setDialogo(null)}>
        <DialogContent className="sm:max-w-md">
          {dialogo === 'lista' && (
            <>
              <ContenidoLista />
              <DialogFooter>
                <BotonLeido onClick={() => setDialogo(null)} />
              </DialogFooter>
            </>
          )}
          {dialogo === 'ios' && (
            <>
              <DialogHeader>
                <DialogTitle>Instálala desde Safari</DialogTitle>
                <DialogDescription>
                  En iPhone y iPad la instalación se hace a mano, en tres toques.
                </DialogDescription>
              </DialogHeader>
              <PasosIOS />
              <DialogFooter>
                <Button onClick={marcarInstalada}>Listo, ya la agregué</Button>
              </DialogFooter>
            </>
          )}
          {dialogo === 'noDisponible' && (
            <>
              <DialogHeader>
                <DialogTitle>Tu navegador no ofreció la instalación</DialogTitle>
                <DialogDescription className="text-pretty">
                  Puede que ya la tengas instalada en este dispositivo —búscala en tu escritorio o
                  en la pantalla de inicio— o que este navegador no lo permita. En Chrome y Edge sí
                  se puede.
                </DialogDescription>
              </DialogHeader>
              <ManualPorDispositivo />
              <DialogFooter className="gap-2 sm:justify-between">
                <Button variant="outline" onClick={() => setDialogo(null)}>
                  Cerrar
                </Button>
                <Button onClick={marcarInstalada}>Ya la tengo instalada</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
