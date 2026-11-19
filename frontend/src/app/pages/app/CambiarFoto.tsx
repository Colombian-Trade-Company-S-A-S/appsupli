import { useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CameraIcon } from 'lucide-react';
import { toast } from 'sonner';
import { authApi, prepararFoto, urlFotoDe, useAuth } from '@/core/auth';
import { ApiError } from '@/shared/api/http-client';
import { Avatar, AvatarFallback, AvatarImage, Button, Spinner } from '@/shared/components/ui';

/**
 * La foto del perfil con su botón para cambiarla, montado en la esquina.
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
    <div className="relative shrink-0">
      <Avatar className="size-28 ring-4 ring-background sm:size-32">
        <AvatarImage src={urlFotoDe(user)} alt={`Foto de ${user.fullName}`} />
        <AvatarFallback className="text-4xl">
          {user.firstName.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      {subir.isPending && (
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70">
          <Spinner />
        </span>
      )}
      <Button
        size="icon-sm"
        className="absolute right-1 bottom-1 rounded-full shadow-md ring-2 ring-background"
        disabled={subir.isPending}
        onClick={() => entrada.current?.click()}
        aria-label={user.foto ? 'Cambiar foto' : 'Subir foto'}
        title={user.foto ? 'Cambiar foto' : 'Subir foto'}
      >
        <CameraIcon />
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
