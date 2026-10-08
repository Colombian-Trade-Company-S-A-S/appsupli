import { Navigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ClipboardListIcon, ScanBarcodeIcon, SmartphoneIcon } from 'lucide-react';
import { toast } from 'sonner';
import { FullPageLoader } from '@/shared/components/feedback';
import { useForceTheme } from '@/shared/hooks';
import type { RegistroPartnerPayload } from '../api';
import { FormularioRecomendacion } from '../components/FormularioRecomendacion';
import { formularioPublico } from './api';
import {
  FormularioNoDisponible,
  MarcoFormulario,
  mensajeDeError,
  type Consejo,
} from './MarcoFormulario';

/** Lo que conviene tener a mano antes de empezar. Son tres, a propósito. */
const ANTES_DE_EMPEZAR: Consejo[] = [
  {
    icono: SmartphoneIcon,
    titulo: 'El equipo del cliente',
    texto: 'Necesitas la marca y el protector que quedó instalado.',
  },
  {
    icono: ScanBarcodeIcon,
    titulo: 'El serial',
    texto: 'Cópialo completo, tal como aparece. Cada serial se registra una sola vez.',
  },
  {
    icono: ClipboardListIcon,
    titulo: 'La factura y tu documento',
    texto: 'Con eso se valida el registro cuando se liquida el plan.',
  },
];

/**
 * El formulario del plan Partners abierto por enlace, sin cuenta y sin clave.
 *
 * Quien entra solo puede diligenciar: es el mismo componente de formulario de
 * la app, pero sin nada alrededor —ni registros cargados, ni listas, ni
 * tableros—, porque esta página no tiene con qué pedirlos. Va en tema claro,
 * como el resto de lo público.
 */
export default function FormularioPublico() {
  useForceTheme('light');
  const { token = '' } = useParams();

  const opciones = useQuery({
    queryKey: ['formulario-publico', token, 'opciones'],
    queryFn: () => formularioPublico.opciones(token),
    retry: false,
    enabled: !!token,
  });

  const guardar = useMutation({
    mutationFn: (payload: RegistroPartnerPayload) => formularioPublico.registrar(token, payload),
    onSuccess: (registro) => toast.success(registro.message ?? 'Registro guardado'),
    onError: (error) => toast.error(mensajeDeError(error)),
  });

  if (!token) return <Navigate to="/" replace />;
  if (opciones.isLoading) return <FullPageLoader label="Abriendo el formulario…" />;
  if (opciones.error) return <FormularioNoDisponible />;

  return (
    <MarcoFormulario
      plan="Plan Partners"
      intro="Registra aquí cada protector recomendado. Toma menos de un minuto y al guardar puedes seguir de una con el siguiente equipo."
      descripcion="Son tres pasos cortos. Todos los campos son obligatorios."
      antesDeEmpezar={ANTES_DE_EMPEZAR}
      pie="¿Algo no cuadra —tu punto de venta no aparece, el serial ya estaba registrado—? Escríbele a quien te compartió el enlace."
    >
      <FormularioRecomendacion
        opciones={opciones.data}
        guardando={guardar.isPending}
        onEnviar={(payload) => guardar.mutateAsync(payload)}
      />
    </MarcoFormulario>
  );
}
