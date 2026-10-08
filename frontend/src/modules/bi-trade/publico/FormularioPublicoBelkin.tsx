import { Navigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { MapPinIcon, PackageIcon, UserRoundIcon } from 'lucide-react';
import { toast } from 'sonner';
import { FullPageLoader } from '@/shared/components/feedback';
import { useForceTheme } from '@/shared/hooks';
import type { RegistroBelkinPayload } from '../api';
import { FormularioBelkin } from '../components/FormularioBelkin';
import { formularioPublicoBelkin } from './api';
import {
  FormularioNoDisponible,
  MarcoFormulario,
  mensajeDeError,
  type Consejo,
} from './MarcoFormulario';

const ANTES_DE_EMPEZAR: Consejo[] = [
  {
    icono: MapPinIcon,
    titulo: 'Tu regional y tu punto',
    texto: 'Primero eliges la regional; luego salen solo sus puntos de venta.',
  },
  {
    icono: UserRoundIcon,
    titulo: 'Tu nombre en la lista',
    texto: 'Elige tu nombre entre los asesores del punto. Si no apareces, déjalo en blanco.',
  },
  {
    icono: PackageIcon,
    titulo: 'El producto recomendado',
    texto: 'Elige la categoría —Case, Lámina, Cable o Cargador— y luego el producto.',
  },
];

/**
 * El formulario del plan Recomiéndame Belkin abierto por enlace, sin cuenta y
 * sin clave. Igual que el de Partners: solo diligencia, no ve lo cargado.
 */
export default function FormularioPublicoBelkin() {
  useForceTheme('light');
  const { token = '' } = useParams();

  const opciones = useQuery({
    queryKey: ['formulario-publico-belkin', token, 'opciones'],
    queryFn: () => formularioPublicoBelkin.opciones(token),
    retry: false,
    enabled: !!token,
  });

  const guardar = useMutation({
    mutationFn: (payload: RegistroBelkinPayload) =>
      formularioPublicoBelkin.registrar(token, payload),
    onSuccess: (registro) => toast.success(registro.message ?? 'Recomendación guardada'),
    onError: (error) => toast.error(mensajeDeError(error)),
  });

  if (!token) return <Navigate to="/" replace />;
  if (opciones.isLoading) return <FullPageLoader label="Abriendo el formulario…" />;
  if (opciones.error) return <FormularioNoDisponible />;

  return (
    <MarcoFormulario
      plan="Plan Recomiéndame Belkin"
      intro="Registra aquí cada producto Belkin recomendado. Toma menos de un minuto y al guardar puedes seguir de una con el siguiente."
      descripcion="El asesor y la observación son opcionales; lo demás es obligatorio."
      antesDeEmpezar={ANTES_DE_EMPEZAR}
      pie="¿Algo no cuadra —tu punto de venta o tu nombre no aparecen—? Escríbele a quien te compartió el enlace."
    >
      <FormularioBelkin
        opciones={opciones.data}
        guardando={guardar.isPending}
        onEnviar={(payload) => guardar.mutateAsync(payload)}
      />
    </MarcoFormulario>
  );
}
