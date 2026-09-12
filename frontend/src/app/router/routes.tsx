import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';
import { AppLayout } from '@/app/layouts/AppLayout';
import { AuthLayout } from '@/app/layouts/AuthLayout';
import { PublicLayout } from '@/app/layouts/PublicLayout';
import { FullPageLoader } from '@/shared/components/feedback';
import { PublicOnly } from './PublicOnly';
import { RequireAdmin } from './RequireAdmin';
import { RequireApp } from './RequireApp';
import { RequireAuth } from './RequireAuth';

const LandingPage = lazy(() => import('@/app/pages/LandingPage'));
const LoginPage = lazy(() => import('@/app/pages/LoginPage'));
const HomePage = lazy(() => import('@/app/pages/app/HomePage'));
const ProfilePage = lazy(() => import('@/app/pages/app/ProfilePage'));
const AdminPage = lazy(() => import('@/modules/admin/pages/AdminPage'));

// ── BI Trade Marketing ────────────────────────────────────────────────────
const BiTradeHomePage = lazy(() => import('@/modules/bi-trade/pages/BiTradeHomePage'));
const ClaroDashboardPage = lazy(() => import('@/modules/bi-trade/pages/ClaroDashboardPage'));
const VentasPage = lazy(() => import('@/modules/bi-trade/pages/VentasPage'));
const ProductosPage = lazy(() => import('@/modules/bi-trade/pages/ProductosPage'));
const PuntosVentaPage = lazy(() => import('@/modules/bi-trade/pages/PuntosVentaPage'));
const InventarioPage = lazy(() => import('@/modules/bi-trade/pages/InventarioPage'));
const MetasPage = lazy(() => import('@/modules/bi-trade/pages/MetasPage'));
const TicketsPage = lazy(() => import('@/modules/bi-trade/pages/TicketsPage'));
const CanalLayout = lazy(() => import('@/modules/bi-trade/pages/CanalLayout'));
const PlanPartnersPage = lazy(() => import('@/modules/bi-trade/pages/PlanPartnersPage'));
const PlanPartnersFormularioPage = lazy(
  () => import('@/modules/bi-trade/pages/PlanPartnersFormularioPage'),
);
const PlanEnConstruccionPage = lazy(
  () => import('@/modules/bi-trade/pages/PlanEnConstruccionPage'),
);
const TableroPublicoLayout = lazy(() => import('@/modules/bi-trade/publico/TableroPublico'));
const FormularioPublico = lazy(() => import('@/modules/bi-trade/publico/FormularioPublico'));
const CumplimientoDiarioPage = lazy(
  () => import('@/modules/bi-trade/pages/CumplimientoDiarioPage'),
);

// ── Valoración de desempeño ───────────────────────────────────────────────
const ValoracionLayout = lazy(() => import('@/modules/valoracion/pages/ValoracionLayout'));
const ValoracionHomePage = lazy(() => import('@/modules/valoracion/pages/ValoracionHomePage'));
const MisEvaluacionesPage = lazy(() => import('@/modules/valoracion/pages/MisEvaluacionesPage'));
const ResponderPage = lazy(() => import('@/modules/valoracion/pages/ResponderPage'));
const MisResultadosPage = lazy(() => import('@/modules/valoracion/pages/MisResultadosPage'));
const ResultadoDetallePage = lazy(() => import('@/modules/valoracion/pages/ResultadoDetallePage'));
const ResultadosEquipoPage = lazy(() => import('@/modules/valoracion/pages/ResultadosEquipoPage'));
const DashboardPage = lazy(() => import('@/modules/valoracion/pages/DashboardPage'));
const PersonaPage = lazy(() => import('@/modules/valoracion/pages/PersonaPage'));
const ConsolidadoPage = lazy(() => import('@/modules/valoracion/pages/ConsolidadoPage'));
const PlanesAccionPage = lazy(() => import('@/modules/valoracion/pages/PlanesAccionPage'));
const CiclosPage = lazy(() => import('@/modules/valoracion/pages/CiclosPage'));
const CicloDetallePage = lazy(() => import('@/modules/valoracion/pages/CicloDetallePage'));
const PreguntasPage = lazy(() => import('@/modules/valoracion/pages/PreguntasPage'));
const CompetenciasPage = lazy(() => import('@/modules/valoracion/pages/CompetenciasPage'));
const JerarquiaPage = lazy(() => import('@/modules/valoracion/pages/JerarquiaPage'));

const withSuspense = (node: ReactNode) => <Suspense fallback={<FullPageLoader />}>{node}</Suspense>;

const routes: RouteObject[] = [
  // ── Público: siempre en tema claro ───────────────────────────────────────
  {
    element: <PublicLayout />,
    children: [{ index: true, element: withSuspense(<LandingPage />) }],
  },
  {
    element: <PublicOnly />,
    children: [
      {
        element: <AuthLayout />,
        children: [{ path: 'login', element: withSuspense(<LoginPage />) }],
      },
    ],
  },

  // ── Plataforma: requiere sesión ─────────────────────────────────────────
  {
    element: <RequireAuth />,
    children: [
      {
        path: 'inicio',
        element: <AppLayout />,
        children: [
          { index: true, element: withSuspense(<HomePage />) },
          { path: 'perfil', element: withSuspense(<ProfilePage />) },
          {
            element: <RequireAdmin />,
            children: [{ path: 'admin', element: withSuspense(<AdminPage />) }],
          },
          {
            element: <RequireApp code="bi-trade" />,
            children: [
              { path: 'bi-trade', element: withSuspense(<BiTradeHomePage />) },
              { path: 'bi-trade/claro', element: withSuspense(<ClaroDashboardPage />) },
              { path: 'bi-trade/claro/ventas', element: withSuspense(<VentasPage />) },
              { path: 'bi-trade/claro/productos', element: withSuspense(<ProductosPage />) },
              {
                path: 'bi-trade/claro/puntos-venta',
                element: withSuspense(<PuntosVentaPage />),
              },
              { path: 'bi-trade/claro/inventario', element: withSuspense(<InventarioPage />) },
              { path: 'bi-trade/claro/metas', element: withSuspense(<MetasPage />) },
              { path: 'bi-trade/claro/tickets', element: withSuspense(<TicketsPage />) },
              // Homecenter, Falabella y Tmk: las mismas páginas de Claro con la fuente
              // de cada canal. El layout pone la fuente, el acento y la franja.
              {
                path: 'bi-trade/ventas-hc',
                element: withSuspense(<CanalLayout canal="hc" />),
                children: [
                  { index: true, element: withSuspense(<ClaroDashboardPage />) },
                  { path: 'dia', element: withSuspense(<CumplimientoDiarioPage />) },
                  { path: 'ventas', element: withSuspense(<VentasPage />) },
                  { path: 'productos', element: withSuspense(<ProductosPage />) },
                  { path: 'puntos-venta', element: withSuspense(<PuntosVentaPage />) },
                  { path: 'inventario', element: withSuspense(<InventarioPage />) },
                  { path: 'metas', element: withSuspense(<MetasPage />) },
                ],
              },
              {
                path: 'bi-trade/ventas-falabella',
                element: withSuspense(<CanalLayout canal="falabella" />),
                children: [
                  { index: true, element: withSuspense(<ClaroDashboardPage />) },
                  { path: 'dia', element: withSuspense(<CumplimientoDiarioPage />) },
                  { path: 'ventas', element: withSuspense(<VentasPage />) },
                  { path: 'productos', element: withSuspense(<ProductosPage />) },
                  { path: 'puntos-venta', element: withSuspense(<PuntosVentaPage />) },
                  { path: 'inventario', element: withSuspense(<InventarioPage />) },
                  { path: 'metas', element: withSuspense(<MetasPage />) },
                ],
              },
              {
                path: 'bi-trade/ventas-tmk',
                element: withSuspense(<CanalLayout canal="tmk" />),
                children: [
                  { index: true, element: withSuspense(<ClaroDashboardPage />) },
                  { path: 'dia', element: withSuspense(<CumplimientoDiarioPage />) },
                  { path: 'ventas', element: withSuspense(<VentasPage />) },
                  { path: 'productos', element: withSuspense(<ProductosPage />) },
                  { path: 'puntos-venta', element: withSuspense(<PuntosVentaPage />) },
                  { path: 'inventario', element: withSuspense(<InventarioPage />) },
                  { path: 'metas', element: withSuspense(<MetasPage />) },
                ],
              },
              {
                path: 'bi-trade/claro/dia',
                element: withSuspense(<CumplimientoDiarioPage />),
              },
              // Planes sin informe todavía: la página dice «en construcción».
              {
                path: 'bi-trade/plan-recomiendame-belkin',
                element: withSuspense(<PlanEnConstruccionPage plan="belkin" />),
              },
              {
                path: 'bi-trade/plan-partners',
                element: withSuspense(<PlanPartnersPage />),
              },
              {
                path: 'bi-trade/plan-partners/formulario',
                element: withSuspense(<PlanPartnersFormularioPage />),
              },
            ],
          },
          {
            element: <RequireApp code="valoracion" />,
            children: [
              {
                path: 'valoracion',
                element: withSuspense(<ValoracionLayout />),
                children: [
                  { index: true, element: withSuspense(<ValoracionHomePage />) },
                  { path: 'mis-evaluaciones', element: withSuspense(<MisEvaluacionesPage />) },
                  { path: 'mis-evaluaciones/:id', element: withSuspense(<ResponderPage />) },
                  { path: 'mis-resultados', element: withSuspense(<MisResultadosPage />) },
                  { path: 'resultados/:id', element: withSuspense(<ResultadoDetallePage />) },
                  { path: 'equipo', element: withSuspense(<ResultadosEquipoPage />) },
                  { path: 'dashboard', element: withSuspense(<DashboardPage />) },
                  { path: 'dashboard/persona/:id', element: withSuspense(<PersonaPage />) },
                  { path: 'consolidado', element: withSuspense(<ConsolidadoPage />) },
                  { path: 'planes', element: withSuspense(<PlanesAccionPage />) },
                  { path: 'ciclos', element: withSuspense(<CiclosPage />) },
                  { path: 'ciclos/:id', element: withSuspense(<CicloDetallePage />) },
                  { path: 'preguntas', element: withSuspense(<PreguntasPage />) },
                  { path: 'competencias', element: withSuspense(<CompetenciasPage />) },
                  { path: 'jerarquia', element: withSuspense(<JerarquiaPage />) },
                ],
              },
            ],
          },
        ],
      },
    ],
  },

  // ── Tablero compartido por enlace ───────────────────────────────────────
  // Fuera de `RequireAuth` y sin `AppLayout`: no pide sesión ni muestra la
  // navegación de la app. Las hojas son las mismas páginas del tablero; el
  // layout les da una fuente de datos pública y de solo lectura.
  {
    path: 'tablero/:token',
    element: withSuspense(<TableroPublicoLayout />),
    children: [
      { index: true, element: <ClaroDashboardPage /> },
      { path: 'dia', element: <CumplimientoDiarioPage /> },
      { path: 'tickets', element: <TicketsPage /> },
    ],
  },

  // ── Formulario compartido por enlace ────────────────────────────────────
  // El único enlace público que escribe: quien lo abre diligencia el plan
  // Partners sin cuenta. No ve los registros cargados ni los tableros.
  {
    path: 'formulario/:token',
    element: withSuspense(<FormularioPublico />),
  },

  { path: '*', element: <Navigate to="/" replace /> },
];

export const router = createBrowserRouter(routes);
