import { useState } from 'react';
import { ListChecksIcon, LockIcon } from 'lucide-react';
import { Badge, Card } from '@/shared/components/ui';
import { Encabezado, EstadoTabla } from '@/shared/components/layout';
import { etiquetaMes, mesDe } from '../api';
import { useMisObjetivos, useOpcionesPerformance } from '../hooks';
import { BannerPonderacion, Selector } from '../components/Piezas';
import { TablaObjetivos } from '../components/TablaObjetivos';

/**
 * Lo que ve el colaborador: sus objetivos del mes, en solo lectura.
 *
 * Es la regla 3 de la especificación puesta en pantalla: acá no hay ni un
 * botón de editar, porque el objetivo lo define el jefe.
 */
export default function MisObjetivosPage() {
  const { data: opciones } = useOpcionesPerformance();
  const periodos = opciones?.periodos ?? [];
  const [periodo, setPeriodo] = useState('');
  const elegido = periodo || periodos[0]?.periodo || '';
  const { data: objetivos = [], isLoading } = useMisObjetivos(elegido ? mesDe(elegido) : undefined);

  const asignado = objetivos.reduce((total, objetivo) => total + Number(objetivo.peso), 0);
  const congelados = objetivos.some((objetivo) => !objetivo.editable);

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="Mis objetivos"
        descripcion="Lo que se definió para ti este mes: qué se espera, con qué se mide y cuánto pesa."
      >
        {congelados && (
          <Badge variant="outline" className="gap-1.5">
            <LockIcon className="size-3" />
            Congelados: el mes está en medición
          </Badge>
        )}
      </Encabezado>

      <div className="max-w-xs">
        <Selector
          id="mis-periodo"
          label="Periodo"
          placeholder="Selecciona el mes"
          value={elegido}
          onChange={setPeriodo}
          opciones={periodos.map((p) => ({
            value: p.periodo,
            label: `${etiquetaMes(p.periodo)} · ${p.estadoLabel}`,
          }))}
        />
      </div>

      {objetivos.length > 0 && (
        <BannerPonderacion
          ponderacion={{
            colaborador: 0,
            colaboradorNombre: '',
            cargo: '',
            objetivos: objetivos.length,
            pesoAsignado: Number(asignado.toFixed(2)),
            pesoDisponible: Number((100 - asignado).toFixed(2)),
            completo: Math.abs(asignado - 100) < 0.005,
            maximoObjetivos: opciones?.maximoObjetivos ?? 6,
          }}
        />
      )}

      <Card className="py-0">
        <EstadoTabla
          cargando={isLoading}
          vacio={objetivos.length === 0}
          icono={<ListChecksIcon />}
          titulo="Todavía no tienes objetivos este mes"
          descripcion="Tu jefe los define desde «Objetivos del equipo». Apenas los cargue, aparecen acá."
        >
          <TablaObjetivos objetivos={objetivos} soloLectura />
        </EstadoTabla>
      </Card>
    </div>
  );
}
