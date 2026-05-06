import { Card, cn } from '@brika/clay';
import { BrikaLogo } from '@brika/clay/components/brika-logo';
import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AmbientCanvas } from '../AmbientCanvas';

const PROGRESS_STEPS = ['language', 'account', 'avatar', 'timezone', 'location'] as const;
type ProgressStep = (typeof PROGRESS_STEPS)[number];

function isProgressStep(s: string): s is ProgressStep {
  return (PROGRESS_STEPS as readonly string[]).includes(s);
}

// ─── Top progress strip ─────────────────────────────────────────────────────

function ProgressStrip({ segment }: Readonly<{ segment: string }>) {
  const { t } = useTranslation('setup');

  if (!isProgressStep(segment)) {
    return <div className="h-[34px]" aria-hidden />;
  }

  const idx = PROGRESS_STEPS.indexOf(segment);
  const total = PROGRESS_STEPS.length;
  const stepName = t(`shell.progressLabels.${segment}`);

  return (
    <div className="mb-6 flex items-center gap-3">
      <span className="font-mono text-[10px] text-muted-foreground/70 uppercase tracking-[0.18em]">
        {t('shell.step', { current: idx + 1, total })}
      </span>
      <span className="text-[10px] text-muted-foreground/40">·</span>
      <span className="font-mono text-[10px] text-foreground/80 uppercase tracking-[0.18em]">
        {stepName}
      </span>
      <div className="ml-auto flex items-center gap-1">
        {PROGRESS_STEPS.map((step, i) => (
          <span
            key={step}
            className={cn(
              'h-[3px] rounded-full transition-all duration-500 ease-out',
              i < idx && 'w-4 bg-primary/70',
              i === idx && 'w-8 bg-primary',
              i > idx && 'w-4 bg-foreground/10'
            )}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Setup layout ───────────────────────────────────────────────────────────

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
  const isHero = segment === 'welcome' || segment === 'complete';

  return (
    <AmbientCanvas>
      <div className="relative w-full max-w-[520px]">
        {!isHero && <ProgressStrip segment={segment} />}

        <Card
          key={segment}
          className={cn(
            'overflow-hidden border-border/60 bg-card/80 shadow-2xl shadow-black/20 backdrop-blur-xl',
            'fade-in-50 slide-in-from-bottom-1 animate-in duration-500 ease-out'
          )}
        >
          <Outlet />
        </Card>

        <footer className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/50">
          <BrikaLogo className="size-3" />
          <span>Brika · {new Date().getFullYear()}</span>
        </footer>
      </div>
    </AmbientCanvas>
  );
}
