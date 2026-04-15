import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';

// ─── Step header ────────────────────────────────────────────────────────────

interface StepHeaderProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function StepHeader({ icon: Icon, title, description }: Readonly<StepHeaderProps>) {
  return (
    <CardHeader className="items-center text-center">
      <div className="mb-2 flex size-12 items-center justify-center rounded-xl bg-primary/10">
        <Icon className="size-6 text-primary" />
      </div>
      <CardTitle>{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
    </CardHeader>
  );
}

// ─── Step body ──────────────────────────────────────────────────────────────

export function StepBody({ children }: Readonly<{ children: ReactNode }>) {
  return <CardContent className="space-y-6">{children}</CardContent>;
}

// ─── Step navigation ────────────────────────────────────────────────────────

type SetupPath =
  | '/setup/welcome'
  | '/setup/language'
  | '/setup/account'
  | '/setup/avatar'
  | '/setup/timezone'
  | '/setup/location'
  | '/setup/complete';

interface StepNavProps {
  back?: SetupPath;
  next: SetupPath;
  /** Override the next button label. Defaults to nav.continue */
  nextLabel?: string;
  /** Show skip variant (ghost style) instead of primary next button */
  showSkip?: boolean;
}

export function StepNav({ back, next, nextLabel, showSkip }: Readonly<StepNavProps>) {
  const { t } = useTranslation('setup');
  const navigate = useNavigate();

  return (
    <div className="flex gap-3">
      {back && (
        <Button variant="outline" className="gap-2" onClick={() => navigate({ to: back })}>
          <ArrowLeft className="size-4" />
          {t('nav.back')}
        </Button>
      )}
      {showSkip && (
        <Button
          variant="ghost"
          className="flex-1 gap-2 text-muted-foreground"
          onClick={() => navigate({ to: next })}
        >
          {t('nav.skip')}
        </Button>
      )}
      <Button className="flex-1 gap-2" onClick={() => navigate({ to: next })}>
        {nextLabel ?? t('nav.continue')}
        <ArrowRight className="size-4" />
      </Button>
    </div>
  );
}
