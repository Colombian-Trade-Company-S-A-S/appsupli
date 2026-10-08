import type { ReactNode } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Badge } from '@/shared/components/ui';
import { formatoMoneda } from '@/shared/lib/formato';
import { useAuth } from '@/core/auth';
import {
  partnersApi,
  type ProductoPartner,
  type PuntoVentaPartner,
  type RegionalPartner,
} from '../api';
import { ACTIVO, Catalogo, Cuenta, type Config } from '../components/Catalogo';
import {
  useProductosPartners,
  usePuntosVentaPartners,
  useRegionalesPartners,
  type ListaPartners,
} from '../hooks';
import { LISTAS_PARTNERS, listaPartnersDeRuta } from '../listasPartners';
import { PLANES } from '../planes';

const PLAN = PLANES.partners.ruta;

/** Lo que comparten las tres listas: su título, su descripción y a dónde volver. */
const base = (lista: ListaPartners) => ({
  clave: lista,
  titulo: LISTAS_PARTNERS[lista].titulo,
  descripcion: LISTAS_PARTNERS[lista].descripcion,
  volverA: PLAN,
});

function Regionales({ puedeAdministrar }: { puedeAdministrar: boolean }) {
  const { data = [], isLoading } = useRegionalesPartners();
  const config: Config<RegionalPartner> = {
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
      {
        titulo: 'Registros',
        celda: (r) => <Cuenta n={r.registrosCount} />,
        className: 'hidden md:table-cell',
      },
    ],
    campos: [
      {
        clave: 'nombre',
        label: 'Nombre',
        tipo: 'texto',
        maxLength: 80,
        placeholder: 'Región Centro (Z. Norte)',
      },
      ACTIVO,
    ],
    valores: (r) => ({ nombre: r?.nombre ?? '', activo: r?.activa ?? true }),
    payload: (v) => ({ nombre: v.nombre, activa: v.activo }),
    crear: (p) => partnersApi.regionales.create(p),
    editar: (id, p) => partnersApi.regionales.update(id, p),
    borrar: (id) => partnersApi.regionales.remove(id),
    avisoEdicion: 'Si cambias el nombre, cambia en todos los registros de sus puntos.',
  };
  return <Catalogo config={config} puedeAdministrar={puedeAdministrar} />;
}

function PuntosVenta({ puedeAdministrar }: { puedeAdministrar: boolean }) {
  const { data = [], isLoading } = usePuntosVentaPartners();
  const { data: regionales = [] } = useRegionalesPartners();
  const opcionesRegional = regionales.map((r) => ({
    value: String(r.idRegional),
    label: r.nombre,
  }));
  const config: Config<PuntoVentaPartner> = {
    ...base('puntosVenta'),
    singular: 'Punto de venta',
    filas: data,
    cargando: isLoading,
    id: (p) => p.idPuntoVenta,
    nombre: (p) => p.nombrePdv,
    activo: (p) => p.activo,
    textoDe: (p) => `${p.etiqueta} ${p.regional}`,
    filtro: {
      label: 'Regional',
      opciones: opcionesRegional,
      valorDe: (p) => String(p.idRegional),
    },
    columnas: [
      {
        titulo: 'Centro de costos',
        celda: (p) => <span className="font-mono font-medium">{p.idPuntoVenta}</span>,
      },
      { titulo: 'Nombre', celda: (p) => p.nombrePdv },
      { titulo: 'Regional', celda: (p) => <Badge variant="secondary">{p.regional}</Badge> },
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
        placeholder: 'C192',
        esCodigo: true,
        ayuda: 'Es la llave del punto: debe ser único.',
      },
      {
        clave: 'nombrePdv',
        label: 'Nombre',
        tipo: 'texto',
        maxLength: 100,
        placeholder: 'Cav Cucuta Centro Av Quinta',
      },
      {
        clave: 'idRegional',
        label: 'Regional',
        tipo: 'select',
        opciones: opcionesRegional,
        placeholder: 'Selecciona la regional',
      },
      ACTIVO,
    ],
    valores: (p) => ({
      idPuntoVenta: p?.idPuntoVenta ?? '',
      nombrePdv: p?.nombrePdv ?? '',
      idRegional: p ? String(p.idRegional) : '',
      activo: p?.activo ?? true,
    }),
    payload: (v, editando) => ({
      ...(editando ? {} : { idPuntoVenta: v.idPuntoVenta }),
      nombrePdv: v.nombrePdv,
      idRegional: v.idRegional ? Number(v.idRegional) : null,
      activo: v.activo,
    }),
    crear: (p) => partnersApi.puntosVenta.create(p),
    editar: (id, p) => partnersApi.puntosVenta.update(id, p),
    borrar: (id) => partnersApi.puntosVenta.remove(id),
    avisoEdicion:
      'Si lo cambias de regional, todos sus registros —también los viejos— pasan a la nueva.',
  };
  return <Catalogo config={config} puedeAdministrar={puedeAdministrar} />;
}

function Productos({ puedeAdministrar }: { puedeAdministrar: boolean }) {
  const { data = [], isLoading } = useProductosPartners();
  const config: Config<ProductoPartner> = {
    ...base('productos'),
    singular: 'Producto',
    filas: data,
    cargando: isLoading,
    id: (p) => p.idProducto,
    nombre: (p) => p.nombreProducto,
    activo: (p) => p.activo,
    textoDe: (p) => p.etiqueta,
    columnas: [
      {
        titulo: 'Código',
        celda: (p) => <span className="font-mono font-medium">{p.idProducto}</span>,
      },
      { titulo: 'Nombre', celda: (p) => p.nombreProducto },
      {
        titulo: 'Precio',
        celda: (p) => <span className="tabular-nums">{formatoMoneda(p.precio)}</span>,
      },
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
        placeholder: '7015490',
        esCodigo: true,
        ayuda: 'Es la llave del producto: debe ser único.',
      },
      {
        clave: 'nombreProducto',
        label: 'Nombre',
        tipo: 'texto',
        maxLength: 60,
        placeholder: 'Estandar',
      },
      {
        clave: 'precio',
        label: 'Precio',
        tipo: 'texto',
        maxLength: 9,
        numerico: true,
        placeholder: '21996',
        ayuda: 'Sin puntos ni signo de pesos. Con él se valora lo recomendado en el tablero.',
      },
      ACTIVO,
    ],
    valores: (p) => ({
      idProducto: p?.idProducto ?? '',
      nombreProducto: p?.nombreProducto ?? '',
      precio: p ? String(p.precio) : '0',
      activo: p?.activo ?? true,
    }),
    payload: (v, editando) => ({
      ...(editando ? {} : { idProducto: v.idProducto }),
      nombreProducto: v.nombreProducto,
      // Admite «21.996» o «$21996»: se queda solo con los dígitos.
      precio: Number(String(v.precio).replace(/\D/g, '') || 0),
      activo: v.activo,
    }),
    crear: (p) => partnersApi.productos.create(p),
    editar: (id, p) => partnersApi.productos.update(id, p),
    borrar: (id) => partnersApi.productos.remove(id),
  };
  return <Catalogo config={config} puedeAdministrar={puedeAdministrar} />;
}

const PANTALLAS: Record<ListaPartners, (props: { puedeAdministrar: boolean }) => ReactNode> = {
  regionales: Regionales,
  puntosVenta: PuntosVenta,
  productos: Productos,
};

/** El CRUD de una lista del plan Partners; la lista sale de la URL. */
export default function PlanPartnersListaPage() {
  const { lista: ruta } = useParams();
  const { user } = useAuth();
  const puedeAdministrar = !!user?.isAdmin || !!user?.permissions.includes('bi-trade:data:manage');
  const lista = listaPartnersDeRuta(ruta);

  if (!lista) return <Navigate to={PLAN} replace />;
  const Pantalla = PANTALLAS[lista];
  return <Pantalla key={lista} puedeAdministrar={puedeAdministrar} />;
}
