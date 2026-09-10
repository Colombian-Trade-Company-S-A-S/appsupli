import type { ReactNode } from 'react';
import { ErrorBoundary } from '@/shared/components/feedback';
import { TooltipProvider } from '@/shared/components/ui';
import { Toaster } from '@/shared/components/ui/sonner';
import { AuthProvider } from './AuthProvider';
import { QueryProvider } from './QueryProvider';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <QueryProvider>
        <TooltipProvider>
          <AuthProvider>{children}</AuthProvider>
          <Toaster position="top-right" />
        </TooltipProvider>
      </QueryProvider>
    </ErrorBoundary>
  );
}
