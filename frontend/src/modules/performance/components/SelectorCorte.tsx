import type { Corte, TipoCorte } from '../api';
import { Selector } from './Piezas';

/** Los cuatro cortes oficiales (A8). El Q es trimestral, no de cuatro meses. */
const TIPOS: Array<{ value: TipoCorte; label: string }> = [
  { value: 'mes', label: 'Mensual' },
  { value: 'trimestre', label: 'Q · trimestral' },
  { value: 'semestre', label: 'Semestral' },
  { value: 'anio', label: 'Anual' },
];

export interface CorteElegido {
  tipo: TipoCorte;
  anio: number;
  indice: number;
}

/**
 * Elige el corte de tiempo: primero el tipo, después cuál.
 *
 * Los cortes concretos los arma el backend (`opciones.cortes`) para que las
 * etiquetas —«3Q · Jul–Sep 2026»— sean las mismas en toda la plataforma.
 */
export function SelectorCorte({
  cortes,
  valor,
  onChange,
}: {
  cortes: Corte[];
  valor: CorteElegido;
  onChange: (corte: CorteElegido) => void;
}) {
  const delTipo = cortes.filter((corte) => corte.tipo === valor.tipo);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:max-w-xl">
      <Selector
        id="corte-tipo"
        label="Corte"
        placeholder="Selecciona el corte"
        value={valor.tipo}
        onChange={(tipo) => {
          const primero = cortes.find((corte) => corte.tipo === tipo);
          onChange({
            tipo: tipo as TipoCorte,
            anio: primero?.anio ?? valor.anio,
            indice: primero?.indice ?? 1,
          });
        }}
        opciones={TIPOS}
      />
      <Selector
        id="corte-periodo"
        label="Periodo"
        placeholder="Selecciona el periodo"
        value={`${valor.anio}-${valor.indice}`}
        onChange={(elegido) => {
          const [anio, indice] = elegido.split('-');
          onChange({ tipo: valor.tipo, anio: Number(anio), indice: Number(indice) });
        }}
        opciones={delTipo.map((corte) => ({
          value: `${corte.anio}-${corte.indice}`,
          label: corte.label,
        }))}
      />
    </div>
  );
}
