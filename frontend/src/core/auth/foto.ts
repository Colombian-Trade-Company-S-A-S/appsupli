/**
 * La foto de perfil: de dónde se carga y cómo se prepara antes de subirla.
 */
import { env } from '@/shared/config/env';

/**
 * La dirección de la foto, o `undefined` si no tiene.
 *
 * El backend la manda relativa a la raíz de la API porque frontend y API viven
 * en dominios distintos: acá se le antepone la dirección de la API.
 */
export function urlFotoDe(user: { foto: string | null; avatarUrl?: string } | null | undefined) {
  if (!user) return undefined;
  if (user.foto) return `${env.apiUrl.replace(/\/$/, '')}/${user.foto}`;
  return user.avatarUrl || undefined;
}

/** Lado de la foto que se sube, en píxeles. Odoo guarda hasta 1920 y genera las menores. */
const LADO = 512;

/**
 * Recorta la imagen al cuadrado del centro y la reduce a 512 px en JPEG.
 *
 * Una foto de celular pesa varios MB; reducida queda en unas decenas de KB,
 * que es lo que se guarda en la base y se manda a Odoo.
 */
export async function prepararFoto(archivo: File): Promise<Blob> {
  if (!archivo.type.startsWith('image/')) {
    throw new Error('Elige una imagen (JPG, PNG o WebP).');
  }
  const imagen = await createImageBitmap(archivo).catch(() => {
    throw new Error('No se pudo leer la imagen. Prueba con otra en JPG o PNG.');
  });
  const lado = Math.min(imagen.width, imagen.height);
  const destino = Math.min(LADO, lado);
  const lienzo = document.createElement('canvas');
  lienzo.width = destino;
  lienzo.height = destino;
  const contexto = lienzo.getContext('2d');
  if (!contexto) throw new Error('El navegador no pudo procesar la imagen.');
  // Fondo blanco: un PNG con transparencia en JPEG quedaría negro.
  contexto.fillStyle = '#ffffff';
  contexto.fillRect(0, 0, destino, destino);
  contexto.drawImage(
    imagen,
    (imagen.width - lado) / 2,
    (imagen.height - lado) / 2,
    lado,
    lado,
    0,
    0,
    destino,
    destino,
  );
  imagen.close();
  return new Promise((resolver, rechazar) =>
    lienzo.toBlob(
      (blob) => (blob ? resolver(blob) : rechazar(new Error('No se pudo preparar la imagen.'))),
      'image/jpeg',
      0.88,
    ),
  );
}
