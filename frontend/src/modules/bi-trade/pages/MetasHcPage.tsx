import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftIcon, PencilIcon, PlusIcon, TargetIcon, Trash2Icon } from 'lucide-react';
import {
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Input,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui';
import { ConfirmarBorrado } from '@/shared/components/feedback';
import { Encabezado, EstadoTabla, Kpi } from '@/shared/components/layout';
import { formatoMoneda, formatoMonedaCorta, formatoNumero } from '@/shared/lib/formato';
import {
  biTradeApiHc,
  type MetaPunto,
  type MetaPuntoPayload,
  type ResumenMetasPunto,
} from '../api';
import { useFuente } from '../fuente';
import { usePuedeEditar } from '../permisos';
import { useBiTradeMutation, useListado, useOpciones, usePuntosVenta, useResumen } from '../hooks';
import { CampoSelect } from '../components/CampoSelect';
import { BotonesExcel } from '../components/BotonesExcel';
import { BarraFiltros, CampoBusqueda, CampoFiltro, soloConValor } from '../components/Filtros';
import { Paginacion } from '../components/Paginacion';
import { desdeValorMes, nombreDelMes } from '../components/SelectorMes';

const POR_PAGINA = 15;

/** Los filtros del listado. Las llaves son los parámetros que espera la API. */
interface FiltrosMeta {
  search?: string;
  anio?: string;
  mes?: string;
  id_punto_venta?: string;
  regional?: string;
  dinero_min?: string;
  dinero_max?: string;
}

/** `2026-11-01` → noviembre de 2026. */
const mesDe = (fecha: string) => {
  const [anio, mes] = fecha.split('-').map(Number);
  return nombreDelMes({ anio, mes });
};

/**
 * Las metas de Homecenter: una por punto de venta y mes, en pesos.
 *
 * A diferencia de los demás canales, la meta de HC no va por producto en
 * unidades: es lo que debe vender la tienda en el mes. Así llega de
 * Homecenter, y así la mide el tablero contra lo vendido.
 */
export default function MetasHcPage() {
  const fuente = useFuente();
  // Sin permiso de edición, la tabla se ve pero sin crear, importar, editar ni borrar.
  const puedeEditar = usePuedeEditar('metas');
  const [filtros, setFiltros] = useState<FiltrosMeta>({});
  // El `<input type="month">` va aparte: en la API el periodo son `anio` y `mes`.
  const [periodo, setPeriodo] = useState('');
  const [pagina, setPagina] = useState(1);
  const [editando, setEditando] = useState<MetaPunto | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [vaciarAbierto, setVaciarAbierto] = useState(false);
  const [porBorrar, setPorBorrar] = useState<MetaPunto | null>(null);

  const { data: opciones } = useOpciones();
  const { data: puntos = [] } = usePuntosVenta();

  const consulta = soloConValor(filtros);
  const { data: hoja, isFetching } = useListado<MetaPunto>('metas', { ...consulta, page: pagina });
  const { data: resumen } = useResumen<ResumenMetasPunto>('metas', consulta);

  const metas = hoja?.items ?? [];
  const total = hoja?.total ?? 0;

  /** Cambiar un filtro vuelve a la página 1: la 7 podría no existir ya. */
  const cambiar = (parche: Partial<FiltrosMeta>) => {
    setFiltros({ ...filtros, ...parche });
    setPagina(1);
  };

  const cambiarPeriodo = (valor: string) => {
    setPeriodo(valor);
    const mes = desdeValorMes(valor);
    cambiar({ anio: mes ? String(mes.anio) : '', mes: mes ? String(mes.mes) : '' });
  };

  const eliminar = useBiTradeMutation(
    (id: number) => biTradeApiHc.metasPunto.remove(id),
    'Meta eliminada',
  );
  const vaciar = useBiTradeMutation(
    () => biTradeApiHc.metasPunto.removeAll(),
    (datos) => datos.message,
  );

  return (
    <div className="flex flex-col gap-6">
      <Encabezado
        titulo="Metas"
        descripcion="Lo que debe vender cada punto de venta en el mes, en pesos."
      >
        <Button variant="outline" render={<Link to={fuente.base} />}>
          <ArrowLeftIcon data-icon="inline-start" />
          Tablero
        </Button>
        {puedeEditar && (
          <Button
            onClick={() => {
              setEditando(null);
              setAbierto(true);
            }}
          >
            <PlusIcon data-icon="inline-start" />
            Nueva meta
          </Button>
        )}
        <BotonesExcel recurso="metas" filtrosExport={consulta} />
        {puedeEditar && (
          <Button
            variant="destructive"
            disabled={total === 0 || vaciar.isPending}
            onClick={() => setVaciarAbierto(true)}
          >
            <Trash2Icon data-icon="inline-start" />
            Eliminar todo
          </Button>
        )}
      </Encabezado>

      <div className="grid gap-4 sm:grid-cols-2">
        <Kpi
          label="Metas cargadas"
          value={formatoNumero(resumen?.registros ?? 0)}
          hint={`${formatoNumero(resumen?.puntosVenta ?? 0)} puntos de venta`}
        />
        <Kpi
          label="Meta en dinero"
          value={formatoMonedaCorta(resumen?.metaDinero ?? 0)}
          hint={formatoMoneda(resumen?.metaDinero ?? 0)}
        />
      </div>

      <BarraFiltros
        hayFiltros={Object.keys(consulta).length > 0}
        onLimpiar={() => {
          setFiltros({});
          setPeriodo('');
          setPagina(1);
        }}
      >
        <CampoBusqueda
          value={filtros.search ?? ''}
          onChange={(v) => cambiar({ search: v })}
          placeholder="Código o nombre del punto de venta…"
        />
        <CampoFiltro
          id="filtro-periodo"
          label="Periodo"
          tipo="month"
          className="w-44"
          value={periodo}
          onChange={cambiarPeriodo}
        />
        <CampoSelect
          id="filtro-pdv"
          label="Punto de venta"
          placeholder="Todos los puntos"
          value={filtros.id_punto_venta ?? ''}
          onChange={(v) => cambiar({ id_punto_venta: v })}
          opciones={puntos.map((p) => ({ value: p.idPuntoVenta, label: p.nombrePdv }))}
        />
        <CampoSelect
          id="filtro-regional"
          label="Regional"
          placeholder="Todas las regionales"
          value={filtros.regional ?? ''}
          onChange={(v) => cambiar({ regional: v })}
          opciones={(opciones?.regionales ?? []).map((r) => ({ value: r.value, label: r.label }))}
        />
        <CampoFiltro
          id="filtro-dinero-min"
          label="Meta mín. $"
          tipo="number"
          min={0}
          className="w-40"
          value={filtros.dinero_min ?? ''}
          onChange={(v) => cambiar({ dinero_min: v })}
        />
        <CampoFiltro
          id="filtro-dinero-max"
          label="Meta máx. $"
          tipo="number"
          min={0}
          className="w-40"
          value={filtros.dinero_max ?? ''}
          onChange={(v) => cambiar({ dinero_max: v })}
        />
      </BarraFiltros>

      <Card className="py-0">
        <EstadoTabla
          cargando={isFetching && !hoja}
          vacio={total === 0}
          icono={<TargetIcon />}
          titulo="Sin metas para este filtro"
          descripcion="Sin meta no hay cumplimiento que medir: cambia los filtros o carga la meta de cada punto de venta."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Periodo</TableHead>
                <TableHead className="hidden md:table-cell">Código</TableHead>
                <TableHead>Punto de venta</TableHead>
                <TableHead className="hidden lg:table-cell">Regional</TableHead>
                <TableHead className="text-right">Meta</TableHead>
                {puedeEditar && <TableHead className="text-right">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {metas.map((meta) => (
                <TableRow key={meta.idMeta}>
                  <TableCell className="whitespace-nowrap font-medium capitalize">
                    {mesDe(meta.fechaMeta)}
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                    {meta.idPuntoVenta}
                  </TableCell>
                  <TableCell>{meta.nombrePdv}</TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {meta.regional || 'Sin dato'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatoMoneda(meta.totalMeta)}
                  </TableCell>
                  {puedeEditar && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Editar"
                          onClick={() => {
                            setEditando(meta);
                            setAbierto(true);
                          }}
                        >
                          <PencilIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Eliminar"
                          onClick={() => setPorBorrar(meta)}
                        >
                          <Trash2Icon />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </EstadoTabla>
      </Card>

      <Paginacion
        pagina={pagina}
        onPaginaChange={setPagina}
        total={total}
        porPagina={POR_PAGINA}
        cargando={isFetching}
      />

      <MetaPuntoDialog abierto={abierto} onOpenChange={setAbierto} meta={editando} />

      <ConfirmarBorrado
        abierto={vaciarAbierto}
        onOpenChange={setVaciarAbierto}
        titulo="¿Eliminar TODAS las metas?"
        descripcion="Se borrarán todas las metas de Homecenter y el tablero dejará de medir cumplimiento. Esta acción no se puede deshacer."
        onConfirmar={() => {
          vaciar.mutate(undefined);
          setVaciarAbierto(false);
        }}
      />

      <ConfirmarBorrado
        abierto={!!porBorrar}
        onOpenChange={(v) => !v && setPorBorrar(null)}
        titulo="¿Eliminar la meta?"
        descripcion={`«${porBorrar?.nombrePdv}» dejará de tener meta en ${porBorrar ? mesDe(porBorrar.fechaMeta) : ''} y no se le medirá cumplimiento.`}
        onConfirmar={() => {
          if (porBorrar) eliminar.mutate(porBorrar.idMeta);
          setPorBorrar(null);
        }}
      />
    </div>
  );
}

/** `AAAA-MM` del mes en curso, el valor de un `<input type="month">`. */
const mesActual = () => new Date().toLocaleDateString('en-CA').slice(0, 7);

interface Formulario {
  idPuntoVenta: string;
  /** `AAAA-MM`: la meta es del mes, no de un día. */
  mes: string;
  totalMeta: string;
}

const vacio = (): Formulario => ({ idPuntoVenta: '', mes: mesActual(), totalMeta: '' });

function MetaPuntoDialog({
  abierto,
  onOpenChange,
  meta,
}: {
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
  meta: MetaPunto | null;
}) {
  const editando = !!meta;
  const { data: puntos = [] } = usePuntosVenta();
  const [datos, setDatos] = useState<Formulario>(vacio);

  const guardar = useBiTradeMutation(
    (payload: MetaPuntoPayload) =>
      editando
        ? biTradeApiHc.metasPunto.update(meta.idMeta, payload)
        : biTradeApiHc.metasPunto.create(payload),
    editando ? 'Meta actualizada' : 'Meta creada',
  );

  useEffect(() => {
    if (!abierto) return;
    setDatos(
      meta
        ? {
            idPuntoVenta: meta.idPuntoVenta,
            mes: meta.fechaMeta.slice(0, 7),
            totalMeta: String(meta.totalMeta),
          }
        : vacio(),
    );
  }, [abierto, meta]);

  const valor = Number(datos.totalMeta);
  const valido = !!datos.idPuntoVenta && !!datos.mes && Number.isInteger(valor) && valor >= 1;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!valido) return;
    guardar.mutate(
      { idPuntoVenta: datos.idPuntoVenta, fechaMeta: `${datos.mes}-01`, totalMeta: valor },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editando ? 'Editar meta' : 'Nueva meta'}</DialogTitle>
          <DialogDescription>
            Una meta por punto de venta y mes: lo que debe vender la tienda en pesos.
          </DialogDescription>
        </DialogHeader>

        <form id="meta-punto-form" onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <CampoSelect
              id="meta-pdv"
              label="Punto de venta"
              placeholder="Elige el punto de venta"
              className="w-full"
              incluirTodas={false}
              value={datos.idPuntoVenta}
              onChange={(v) => setDatos({ ...datos, idPuntoVenta: v })}
              opciones={puntos.map((p) => ({
                value: p.idPuntoVenta,
                label: `${p.nombrePdv} · ${p.idPuntoVenta}`,
              }))}
            />

            <Field>
              <FieldLabel htmlFor="meta-mes">Mes</FieldLabel>
              <Input
                id="meta-mes"
                type="month"
                className="w-48"
                value={datos.mes}
                onChange={(e) => setDatos({ ...datos, mes: e.target.value })}
                required
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="meta-total">Meta en pesos</FieldLabel>
              <Input
                id="meta-total"
                type="number"
                min={1}
                step={1}
                value={datos.totalMeta}
                onChange={(e) => setDatos({ ...datos, totalMeta: e.target.value })}
                required
              />
              <FieldDescription>
                {valor >= 1
                  ? formatoMoneda(valor)
                  : 'Lo que debe vender la tienda en el mes, sin decimales.'}
              </FieldDescription>
            </Field>
          </FieldGroup>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="meta-punto-form" disabled={guardar.isPending || !valido}>
            {guardar.isPending && <Spinner data-icon="inline-start" />}
            {editando ? 'Guardar' : 'Crear'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
