import { useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CameraIcon } from 'lucide-react';
import { toast } from 'sonner';
import { authApi, prepararFoto, urlFotoDe, useAuth } from '@/core/auth';
import { ApiError } from '@/shared/api/http-client';
import { Avatar, AvatarFallback, AvatarImage, Button, Spinner } from '@/shared/components/ui';

/**
 * La foto del perfil con su botón para cambiarla.
 *
 * La imagen se recorta y se reduce en el navegador; el backend la guarda y la
 * escribe también en el empleado de Odoo. Si Odoo falla, la foto queda igual
 * en appSupli y se avisa.
 */
export function CambiarFoto() {
  const { user, setUser } = useAuth();
  const entrada = useRef<HTMLInputElement>(null);

  const subir = useMutation({
    mutationFn: async (archivo: File) => authApi.subirFoto(await prepararFoto(archivo)),
    onSuccess: (resultado) => {
      setUser(resultado.user);
      if (resultado.odoo === 'error') toast.warning(resultado.message);
      else toast.success(resultado.message);
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : 'No se pudo cambiar la foto.',
      ),
  });

  if (!user) return null;

  return (
    <div className="flex shrink-0 flex-col items-center gap-2">
      <div className="relative">
        <Avatar className="size-20">
          <AvatarImage src={urlFotoDe(user)} alt={`Foto de ${user.fullName}`} />
          <AvatarFallback className="text-2xl">
            {user.firstName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        {subir.isPending && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70">
            <Spinner />
          </span>
        )}
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={subir.isPending}
        onClick={() => entrada.current?.click()}
      >
        <CameraIcon data-icon="inline-start" />
        {user.foto ? 'Cambiar foto' : 'Subir foto'}
      </Button>
      <input
        ref={entrada}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const archivo = e.target.files?.[0];
          e.target.value = '';
          if (archivo) subir.mutate(archivo);
        }}
      />
    </div>
  );
}
