import { CircleHelpIcon, InfoIcon } from 'lucide-react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/shared/components/ui';
import type { Ayuda } from '../ayudas';

/**
 * El «?» de la esquina de cada app, rol o permiso. Al pasar el cursor (o al
 * llegar con el teclado) abre una tarjeta que explica para qué sirve.
 *
 * Va fuera del `<label>` de la casilla: si estuviera adentro, tocarlo marcaría
 * o desmarcaría la opción.
 */
export function AyudaAcceso({ titulo, ayuda }: { titulo: string; ayuda: Ayuda }) {
  return (
    <HoverCard>
      <HoverCardTrigger
        delay={150}
        closeDelay={100}
        render={
          <button
            type="button"
            aria-label={`Para qué sirve ${titulo}`}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        }
      >
        <CircleHelpIcon className="size-4" />
      </HoverCardTrigger>
      <HoverCardContent side="top" className="flex w-72 flex-col gap-2 p-3">
        <p className="font-medium">{titulo}</p>
        <p className="text-muted-foreground text-pretty">{ayuda.texto}</p>
        {ayuda.ojo && (
          <p className="flex gap-2 border-t pt-2 text-xs text-muted-foreground text-pretty">
            <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
            {ayuda.ojo}
          </p>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
