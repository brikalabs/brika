import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';
import { AuthLayout } from '../AuthLayout';

const STEPS = ['welcome', 'language', 'account', 'avatar', 'timezone', 'location', 'complete'] as const;
const PROGRESS_STEPS = STEPS.filter((s) => s !== 'welcome' && s !== 'complete');

function stepWidth(i: number, activeIdx: number): string {
  if (i < activeIdx) {
    return 'w-8 bg-primary';
  }
  if (i === activeIdx) {
    return 'w-10 bg-primary';
  }
  return 'w-6 bg-muted-foreground/15';
}

function StepIndicator({ segment }: Readonly<{ segment: string }>) {
  const idx = PROGRESS_STEPS.indexOf(segment as (typeof PROGRESS_STEPS)[number]);
  if (idx < 0) {
    return null;
  }

  return (
    <div className="flex items-center justify-center gap-2 pt-5 pb-2">
      {PROGRESS_STEPS.map((step, i) => (
        <div
          key={step}
          className={`h-1 rounded-full transition-all duration-500 ${stepWidth(i, idx)}`}
        />
      ))}
    </div>
  );
}

export function SetupLayout() {
  const navigate = useNavigate();
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;

  useEffect(() => {
    if (pathname === '/setup' || pathname === '/setup/') {
      navigate({ to: '/setup/welcome', replace: true });
    }
  }, [pathname, navigate]);

  const segment = pathname.split('/').pop() ?? '';

  return (
    <AuthLayout className="max-w-md overflow-hidden">
      <StepIndicator segment={segment} />
      <div className="fade-in animate-in duration-300">
        <Outlet />
      </div>
    </AuthLayout>
  );
}
