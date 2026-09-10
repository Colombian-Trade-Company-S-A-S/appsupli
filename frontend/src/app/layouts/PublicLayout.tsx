import { Outlet } from 'react-router-dom';
import { useForceLightTheme } from '@/shared/hooks';
import { ErrorBoundary } from '@/shared/components/feedback';
import { PublicFooter } from './PublicFooter';
import { PublicNavbar } from './PublicNavbar';

/** Layout del sitio público: navbar + contenido + footer. Sin sesión. */
export function PublicLayout() {
  useForceLightTheme();

  return (
    <div className="flex min-h-full flex-col">
      <PublicNavbar />
      <main className="flex-1">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
      <PublicFooter />
    </div>
  );
}
