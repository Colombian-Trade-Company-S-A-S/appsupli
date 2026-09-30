import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

// El tema lo maneja el store de la plataforma, no next-themes (esto es Vite).
import { useAppearanceStore } from "@/shared/hooks"

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useAppearanceStore((s) => s.resolvedTheme)

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      // Íconos en un chip: el éxito lleva el degradado de marca; los demás, su color.
      icons={{
        success: (
          <span className="flex size-6 items-center justify-center rounded-full bg-brand-gradient text-white">
            <CircleCheckIcon className="size-3.5" />
          </span>
        ),
        info: (
          <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-primary">
            <InfoIcon className="size-3.5" />
          </span>
        ),
        warning: (
          <span className="flex size-6 items-center justify-center rounded-full bg-amber-500/15 text-amber-500">
            <TriangleAlertIcon className="size-3.5" />
          </span>
        ),
        error: (
          <span className="flex size-6 items-center justify-center rounded-full bg-destructive/15 text-destructive">
            <OctagonXIcon className="size-3.5" />
          </span>
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin text-primary" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast gap-3! shadow-xl! shadow-black/10! border-l-4!",
          icon: "size-6! m-0!",
          success: "border-l-[#a66bff]!",
          info: "border-l-primary!",
          warning: "border-l-amber-500!",
          error: "border-l-destructive!",
          description: "text-muted-foreground!",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
