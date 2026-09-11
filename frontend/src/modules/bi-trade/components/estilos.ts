/**
 * La acción de la cabecera de una tarjeta, acomodada para celular.
 *
 * La `CardAction` de shadcn se queda en una columna a la derecha del título.
 * En una pantalla angosta, con un selector y un botón adentro, aplasta el
 * título hasta dejarlo en dos o tres letras por línea. Con esto baja debajo
 * del título en celular y vuelve a su esquina desde `sm`.
 */
export const ACCION_TARJETA =
  'col-start-1 row-span-1 row-start-3 mt-2 flex flex-wrap items-center gap-2 justify-self-start sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:mt-0 sm:justify-self-end';
