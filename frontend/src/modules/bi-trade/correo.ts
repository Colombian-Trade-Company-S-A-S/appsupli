/**
 * El informe del ERP que manda Claro, traído del buzón compartido.
 *
 * Lo busca el backend: una regla de Exchange copia el correo de Claro a un
 * buzón compartido y la app de appSupli puede leer solo ese buzón. Aquí solo
 * se pregunta cuál es el último informe; el archivo no pasa por el navegador:
 * al importar se mandan los identificadores del correo y el backend lo baja.
 *
 * Claro y Tmk Ecommerce Claro reciben el mismo archivo, así que es el mismo
 * correo para los dos: cada canal lo cruza con sus productos y puntos.
 */
import { api } from '@/shared/api/http-client';

export interface InformeEnCorreo {
  /** Identificadores del correo y del adjunto en el buzón: los usa la importación. */
  mensaje: string;
  adjunto: string;
  nombre: string;
  /** Bytes. */
  tamano: number;
  /** ISO, con hora. */
  recibido: string;
  asunto: string;
  remitente: string;
  /** La fecha del nombre del adjunto (`…_20261104.xlsx`), si la trae. */
  fechaArchivo: string | null;
  buzon: string;
}

export const informeDelCorreo = () => api.get<InformeEnCorreo>('/bi-trade/informe-correo');
