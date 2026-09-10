import {
  BarChart3Icon,
  BoxesIcon,
  GaugeIcon,
  LayoutGridIcon,
  SettingsIcon,
  StoreIcon,
  TruckIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from 'lucide-react';

/**
 * Íconos que puede usar una `Application` (su campo `icon` en el backend).
 *
 * Vive aquí y no dentro del sidebar porque el home pinta las mismas apps con
 * los mismos íconos: si se agrega uno nuevo, hay un solo sitio que tocar.
 */
const ICONOS: Record<string, LucideIcon> = {
  'bar-chart-3': BarChart3Icon,
  boxes: BoxesIcon,
  gauge: GaugeIcon,
  settings: SettingsIcon,
  store: StoreIcon,
  truck: TruckIcon,
  users: UsersIcon,
  wallet: WalletIcon,
};

/** El ícono de una app, con un genérico si el nombre no está mapeado. */
export const iconoDeApp = (nombre: string): LucideIcon => ICONOS[nombre] ?? LayoutGridIcon;
