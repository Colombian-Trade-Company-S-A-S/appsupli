import { useState } from 'react';
import { DownloadIcon } from 'lucide-react';
import { useAuth } from '@/core/auth';
import { authApi } from '@/core/auth/auth.api';
import { instalar, useInstalacion } from '@/shared/lib/instalar';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/shared/components/ui';
import { PasosIOS } from './InstalarApp';

/**
 * «Instalar app» en el sidebar. En Chrome, Edge y Android abre el diálogo
 * oficial; en iPhone/iPad muestra los pasos, porque Safari no deja instalar
 * desde un botón. Si ya está instalada o el navegador no lo soporta, no sale.
 */
export function BotonInstalar() {
  const { instalada, puede, manual } = useInstalacion();
  const [pasos, setPasos] = useState(false);

  const { setUser } = useAuth();

  // Instalar desde aquí también queda guardado en la cuenta.
  const guardar = async () => {
    try {
      setUser(await authApi.decidirInstalacion('instalada'));
    } catch {
      // Sin guardar, el aviso de instalar seguirá saliendo: no rompe nada.
    }
  };
  const instalarYGuardar = async () => {
    if ((await instalar()) === 'accepted') await guardar();
  };

  if (instalada || (!puede && !manual)) return null;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        tooltip="Instalar app"
        onClick={() => (puede ? void instalarYGuardar() : setPasos(true))}
      >
        <DownloadIcon />
        <span>Instalar app</span>
      </SidebarMenuButton>

      <Dialog open={pasos} onOpenChange={setPasos}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Instala Supli Tech en tu iPhone</DialogTitle>
            <DialogDescription>
              Queda en tu pantalla de inicio y abre en su propia ventana, como cualquier app.
            </DialogDescription>
          </DialogHeader>
          <PasosIOS />
          <Button
            onClick={() => {
              void guardar();
              setPasos(false);
            }}
          >
            Listo, ya la agregué
          </Button>
        </DialogContent>
      </Dialog>
    </SidebarMenuItem>
  );
}
