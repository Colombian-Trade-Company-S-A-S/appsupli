import type { ReactNode } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Badge } from '@/shared/components/ui';
import { useAuth } from '@/core/auth';
import {
  belkinApi,
  type AsesorApple,
  type CategoriaBelkin,
  type ProductoBelkin,
  type PuntoVentaBelkin,
  type RegionalBelkin,
} from '../api';
import { ACTIVO, Catalogo, Cuenta, type Config } from '../components/Catalogo';
import { useCatalogoBelkin, type ListaBelkin } from '../hooks';
import { LISTAS_BELKIN, listaDeRuta } from '../listasBelkin';
import { PLANES } from '../planes';

const PLAN = PLANES.belkin.ruta;

/** El valor de los desplegables para un punto sin regional. */
const FUERA = 'fuera';
const FUERA_DE_COLTRADE = 'Fuera de Coltrade';
/** El valor del desplegable de categoría para un punto que no gana bono. */
const SIN_CATEGORIA = 'sin';

const OPCIONES_CATEGORIA = [
  { value: '1', label: 'Categoría 1' },
  { value: '2', label: 'Categoría 2' },
  { value: '3', label: 'Categoría 3' },
  { value: SIN_CATEGORIA, label: 'Sin categoría (no gana bono)' },
];

/** La regional de un punto, o «Fuera de Coltrade» si no tiene. */
const regionalDe = (regional: string) => regional || FUERA_DE_COLTRADE;

function BadgeRegional({ regional }: { regional: string }) {
  return regional ? (
    <Badge variant="secondary">{regional}</Badge>
  ) : (
    <Badge variant="outline">{FUERA_DE_COLTRADE}</Badge>
  );
}

/** Lo que comparten las cinco listas: su título, su descripción y a dónde volver. */
const base = (lista: ListaBelkin) => ({
  clave: lista,
  titulo: LISTAS_BELKIN[lista].titulo,
  descripcion: LISTAS_BELKIN[lista].descripcion,
  volverA: PLAN,
});

function Regionales({ puedeAdministrar }: { puedeAdministrar: boolean }) {
  const { data = [], isLoading } = useCatalogoBelkin('regionales');
  const config: Config<RegionalBelkin> = {
    ...base('regionales'),
    singular: 'Regional',
    filas: data,
    cargando: isLoading,
    id: (r) => r.idRegional,
    nombre: (r) => r.nombre,
    activo: (r) => r.activa,
    textoDe: (r) => r.nombre,
    columnas: [
      { titulo: 'Nombre', celda: (r) => <span className="font-medium">{r.nombre}</span> },
      { titulo: 'Puntos de venta', celda: (r) => <Cuenta n={r.puntosCount} /> },
    ],
    campos: [
      { clave: 'nombre', label: 'Nombre', tipo: 'texto', maxLength: 80, placeholder: 'Zona Norte' },
      ACTIVO,
    ],
    valores: (r) => ({ nombre: r?.nombre ?? '', activo: r?.activa ?? true }),
    payload: (v) => ({ nombre: v.nombre, activa: v.activo }),
    crear: (p) => belkinApi.regionales.create(p),
    editar: (id, p) => belkinApi.regionales.update(id, p),
    borrar: (id) => belkinApi.regionales.remove(id),
    avisoEdicion: 'Si cambias el nombre, cambia en todos los registros de sus puntos.',
  };
  return <Catalogo config={config} puedeAdministrar={puedeAdministrar} />;
}

function PuntosVenta({ puedeAdministrar }: { puedeAdministrar: boolean }) {
  const { data = [], isLoading } = useCatalogoBelkin('puntosVenta');
  const { data: regionales = [] } = useCatalogoBelkin('regionales');
  const opcionesRegional = [
    ...regionales.map((r) => ({ value: String(r.idRegional), label: r.nombre })),
    { value: FUERA, label: FUERA_DE_COLTRADE },
  ];
  const config: Config<PuntoVentaBelkin> = {
    ...base('puntosVenta'),
    singular: 'Punto de venta',
    filas: data,
    cargando: isLoading,
    id: (p) => p.idPuntoVenta,
    nombre: (p) => p.nombrePdv,
    activo: (p) => p.activo,
    textoDe: (p) => `${p.etiqueta} ${regionalDe(p.regional)}`,
    filtro: {
      label: 'Regional',
      opciones: opcionesRegional,
      valorDe: (p) => (p.idRegional ? String(p.idRegional) : FUERA),
    },
    columnas: [
      {
        titulo: 'Centro de costos',
        celda: (p) => <span className="font-mono font-medium">{p.idPuntoVenta}</span>,
      },
      { titulo: 'Nombre', celda: (p) => p.nombrePdv },
      { titulo: 'Regional', celda: (p) => <BadgeRegional regional={p.regional} /> },
      {
        titulo: 'Categoría',
        celda: (p) =>
          p.categoria ? (
            <span className="tabular-nums">{p.categoria}</span>
          ) : (
            <span className="text-muted-foreground">Sin categoría</span>
          ),
      },
      {
        titulo: 'Asesores',
        celda: (p) => <Cuenta n={p.asesoresCount} />,
        className: 'hidden md:table-cell',
      },
      {
        titulo: 'Registros',
        celda: (p) => <Cuenta n={p.registrosCount} />,
        className: 'hidden md:table-cell',
      },
    ],
    campos: [
      {
        clave: 'idPuntoVenta',
        label: 'Centro de costos',
        tipo: 'texto',
        maxLength: 60,
        placeholder: 'C159',
        esCodigo: true,
        ayuda: 'Es la llave del punto: debe ser único.',
      },
      {
        clave: 'nombrePdv',
        label: 'Nombre',
        tipo: 'texto',
        maxLength: 100,
        placeholder: 'Cav Andino',
      },
      {
        clave: 'idRegional',
        label: 'Regional',
        tipo: 'select',
        opciones: opcionesRegional,
        placeholder: 'Selecciona la regional',
        ayuda:
          'Fuera de Coltrade: no sale en el formulario; sus registros llegan del informe de ventas de Claro.',
      },
      {
        clave: 'categoria',
        label: 'Categoría del bono',
        tipo: 'select',
        opciones: OPCIONES_CATEGORIA,
        placeholder: 'Selecciona la categoría',
        ayuda: 'Fija cuántas recomendaciones pide cada bono. La 1 es la que más pide.',
      },
      ACTIVO,
    ],
    valores: (p) => ({
      idPuntoVenta: p?.idPuntoVenta ?? '',
      nombrePdv: p?.nombrePdv ?? '',
      idRegional: p ? (p.idRegional ? String(p.idRegional) : FUERA) : '',
      categoria: p ? (p.categoria ? String(p.categoria) : SIN_CATEGORIA) : '',
      activo: p?.activo ?? true,
    }),
    payload: (v, editando) => ({
      ...(editando ? {} : { idPuntoVenta: v.idPuntoVenta }),
      nombrePdv: v.nombrePdv,
      idRegional: v.idRegional && v.idRegional !== FUERA ? Number(v.idRegional) : null,
      categoria: v.categoria && v.categoria !== SIN_CATEGORIA ? Number(v.categoria) : null,
      activo: v.activo,
    }),
    crear: (p) => belkinApi.puntosVenta.create(p),
    editar: (id, p) => belkinApi.puntosVenta.update(id, p),
    borrar: (id) => belkinApi.puntosVenta.remove(id),
    avisoEdicion:
      'Si lo cambias de regional o de categoría, todos sus registros —también los viejos— se leen con la nueva.',
  };
  return <Catalogo config={config} puedeAdministrar={puedeAdministrar} />;
}

function Asesores({ puedeAdministrar }: { puedeAdministrar: boolean }) {
  const { data = [], isLoading } = useCatalogoBelkin('asesores');
  const { data: puntos = [] } = useCatalogoBelkin('puntosVenta');
  const opcionesPunto = puntos.map((p) => ({
    value: p.idPuntoVenta,
    label: `${p.etiqueta} · ${regionalDe(p.regional)}`,
  }));
  const config: Config<AsesorApple> = {
    ...base('asesores'),
    singular: 'Asesor',
    filas: data,
    cargando: isLoading,
    id: (a) => a.idAsesor,
    nombre: (a) => a.nombre,
    activo: (a) => a.activo,
    textoDe: (a) => `${a.nombre} ${a.puntoVentaEtiqueta} ${regionalDe(a.regional)}`,
    filtro: {
      label: 'Punto de venta',
      opciones: puntos.map((p) => ({ value: p.idPuntoVenta, label: p.etiqueta })),
      valorDe: (a) => a.idPuntoVenta,
    },
    columnas: [
      {
        titulo: 'Nombre y apellido',
        celda: (a) => <span className="font-medium">{a.nombre}</span>,
      },
      { titulo: 'Punto de venta', celda: (a) => a.puntoVentaEtiqueta },
      {
        titulo: 'Regional',
        celda: (a) => <BadgeRegional regional={a.regional} />,
        className: 'hidden md:table-cell',
      },
      {
        titulo: 'Registros',
        celda: (a) => <Cuenta n={a.registrosCount} />,
        className: 'hidden md:table-cell',
      },
    ],
    campos: [
      {
        clave: 'nombre',
        label: 'Nombre y apellido',
        tipo: 'texto',
        maxLength: 120,
        placeholder: 'Duván Riaño',
      },
      {
        clave: 'idPuntoVenta',
        label: 'Punto de venta',
        tipo: 'select',
        opciones: opcionesPunto,
        placeholder: 'Selecciona el punto',
        ayuda: 'En el formulario sale solo cuando se elige este punto.',
      },
      ACTIVO,
    ],
    valores: (a) => ({
      nombre: a?.nombre ?? '',
      idPuntoVenta: a?.idPuntoVenta ?? '',
      activo: a?.activo ?? true,
    }),
    payload: (v) => ({ nombre: v.nombre, idPuntoVenta: v.idPuntoVenta || null, activo: v.activo }),
    crear: (p) => belkinApi.asesores.create(p),
    editar: (id, p) => belkinApi.asesores.update(id, p),
    borrar: (id) => belkinApi.asesores.remove(id),
    avisoEdicion:
      'Si lo pasas a otro punto, desde ahora sale allá; sus registros viejos se quedan en el punto donde se hicieron.',
  };
  return <Catalogo config={config} puedeAdministrar={puedeAdministrar} />;
}

function Categorias({ puedeAdministrar }: { puedeAdministrar: boolean }) {
  const { data = [], isLoading } = useCatalogoBelkin('categorias');
  const config: Config<CategoriaBelkin> = {
    ...base('categorias'),
    singular: 'Categoría',
    filas: data,
    cargando: isLoading,
    id: (c) => c.idCategoria,
    nombre: (c) => c.nombre,
    activo: (c) => c.activa,
    textoDe: (c) => c.nombre,
    columnas: [
      { titulo: 'Nombre', celda: (c) => <span className="font-medium">{c.nombre}</span> },
      { titulo: 'Productos', celda: (c) => <Cuenta n={c.productosCount} /> },
    ],
    campos: [
      { clave: 'nombre', label: 'Nombre', tipo: 'texto', maxLength: 60, placeholder: 'Lámina' },
      ACTIVO,
    ],
    valores: (c) => ({ nombre: c?.nombre ?? '', activo: c?.activa ?? true }),
    payload: (v) => ({ nombre: v.nombre, activa: v.activo }),
    crear: (p) => belkinApi.categorias.create(p),
    editar: (id, p) => belkinApi.categorias.update(id, p),
    borrar: (id) => belkinApi.categorias.remove(id),
    avisoEdicion: 'Si cambias el nombre, cambia en todos los registros de sus productos.',
  };
  return <Catalogo config={config} puedeAdministrar={puedeAdministrar} />;
}

function Productos({ puedeAdministrar }: { puedeAdministrar: boolean }) {
  const { data = [], isLoading } = useCatalogoBelkin('productos');
  const { data: categorias = [] } = useCatalogoBelkin('categorias');
  const opcionesCategoria = categorias.map((c) => ({
    value: String(c.idCategoria),
    label: c.nombre,
  }));
  const config: Config<ProductoBelkin> = {
    ...base('productos'),
    singular: 'Producto',
    filas: data,
    cargando: isLoading,
    id: (p) => p.idProducto,
    nombre: (p) => p.nombreProducto,
    activo: (p) => p.activo,
    textoDe: (p) => `${p.etiqueta} ${p.categoria}`,
    filtro: {
      label: 'Categoría',
      opciones: opcionesCategoria,
      valorDe: (p) => String(p.idCategoria),
    },
    columnas: [
      {
        titulo: 'Código',
        celda: (p) => <span className="font-mono font-medium">{p.idProducto}</span>,
      },
      { titulo: 'Nombre', celda: (p) => p.nombreProducto },
      { titulo: 'Categoría', celda: (p) => <Badge variant="secondary">{p.categoria}</Badge> },
      {
        titulo: 'Registros',
        celda: (p) => <Cuenta n={p.registrosCount} />,
        className: 'hidden md:table-cell',
      },
    ],
    campos: [
      {
        clave: 'idProducto',
        label: 'Código',
        tipo: 'texto',
        maxLength: 60,
        placeholder: '7020178',
        esCodigo: true,
        ayuda: 'Es la llave del producto: debe ser único.',
      },
      {
        clave: 'nombreProducto',
        label: 'Nombre',
        tipo: 'texto',
        maxLength: 120,
        placeholder: 'Spigen Iphone 12 / 12 Pro Case Crystal Flex',
      },
      {
        clave: 'idCategoria',
        label: 'Categoría',
        tipo: 'select',
        opciones: opcionesCategoria,
        placeholder: 'Selecciona la categoría',
      },
      ACTIVO,
    ],
    valores: (p) => ({
      idProducto: p?.idProducto ?? '',
      nombreProducto: p?.nombreProducto ?? '',
      idCategoria: p ? String(p.idCategoria) : '',
      activo: p?.activo ?? true,
    }),
    payload: (v, editando) => ({
      ...(editando ? {} : { idProducto: v.idProducto }),
      nombreProducto: v.nombreProducto,
      idCategoria: v.idCategoria ? Number(v.idCategoria) : null,
      activo: v.activo,
    }),
    crear: (p) => belkinApi.productos.create(p),
    editar: (id, p) => belkinApi.productos.update(id, p),
    borrar: (id) => belkinApi.productos.remove(id),
    avisoEdicion:
      'Si lo cambias de categoría, todos sus registros —también los viejos— pasan a la nueva.',
  };
  return <Catalogo config={config} puedeAdministrar={puedeAdministrar} />;
}

const PANTALLAS: Record<ListaBelkin, (props: { puedeAdministrar: boolean }) => ReactNode> = {
  regionales: Regionales,
  puntosVenta: PuntosVenta,
  asesores: Asesores,
  categorias: Categorias,
  productos: Productos,
};

/** El CRUD de una lista del plan Belkin; la lista sale de la URL. */
export default function PlanBelkinListaPage() {
  const { lista: ruta } = useParams();
  const { user } = useAuth();
  const puedeAdministrar = !!user?.isAdmin || !!user?.permissions.includes('bi-trade:data:manage');
  const lista = listaDeRuta(ruta);

  if (!lista) return <Navigate to={PLAN} replace />;
  const Pantalla = PANTALLAS[lista];
  return <Pantalla key={lista} puedeAdministrar={puedeAdministrar} />;
}
