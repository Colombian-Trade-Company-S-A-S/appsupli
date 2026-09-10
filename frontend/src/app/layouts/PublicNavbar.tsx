import { Link } from 'react-router-dom';
import { env } from '@/shared/config/env';
import { buttonVariants } from '@/shared/components/ui';

export function PublicNavbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            S
          </span>
          {env.appName}
        </Link>

        <div className="ml-auto">
          <Link to="/login" className={buttonVariants({ size: 'sm' })}>
            Login
          </Link>
        </div>
      </div>
    </header>
  );
}
