import { Button, cn } from '@brika/clay';
import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

// ─── Setup paths ────────────────────────────────────────────────────────────

export type SetupPath =
  | '/setup/welcome'
  | '/setup/language'
  | '/setup/account'
  | '/setup/avatar'
  | '/setup/timezone'
  | '/setup/location'
  | '/setup/update'
  | '/setup/complete';

// ─── Eyebrow ────────────────────────────────────────────────────────────────

export function Eyebrow({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <span className="font-mono text-[10px] text-muted-foreground/70 uppercase tracking-[0.18em]">
      {children}
    </span>
  );
}

// ─── Step header ────────────────────────────────────────────────────────────

interface StepHeaderProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  align?: 'center' | 'start';
}

export function StepHeader({
  eyebrow,
  title,
  subtitle,
  align = 'start',
}: Readonly<StepHeaderProps>) {
  return (
    <header
      className={cn(
        'flex flex-col gap-3 px-8 pt-8 pb-6',
        align === 'center' ? 'items-center text-center' : 'items-start'
      )}
    >
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="font-semibold text-[26px] text-foreground leading-[1.15] tracking-tight">
        {title}
      </h2>
      <p
        className={cn(
          'text-[13.5px] text-muted-foreground leading-relaxed',
          align === 'center' && 'max-w-sm'
        )}
      >
        {subtitle}
      </p>
    </header>
  );
}

// ─── Step body ──────────────────────────────────────────────────────────────

export function StepBody({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="space-y-6 px-8 pb-8">{children}</div>;
}

// ─── Step navigation ────────────────────────────────────────────────────────

interface StepNavProps {
  back?: SetupPath;
  /** Static destination — used when no work needs to happen on Continue */
  next?: SetupPath;
  /**
   * Async handler invoked on Continue. Resolve to a SetupPath to navigate, or
   * void to suppress navigation (e.g. on validation error). Use this for the
   * save-on-continue pattern.
   */
  onContinue?: () => Promise<SetupPath | void> | SetupPath | void;
  /** Override Continue button label (e.g. "Create account"). */
  continueLabel?: string;
  /** Disable Continue (e.g. invalid form). */
  disabled?: boolean;
  /** Show spinner on Continue. */
  loading?: boolean;
}

export function StepNav({
  back,
  next,
  onContinue,
  continueLabel,
  disabled,
  loading,
}: Readonly<StepNavProps>) {
  const { t } = useTranslation('setup');
  const navigate = useNavigate();

  const handleContinue = async () => {
    if (loading || disabled) {
      return;
    }
    if (onContinue) {
      const result = await onContinue();
      if (typeof result === 'string') {
        navigate({ to: result });
      }
      return;
    }
    if (next) {
      navigate({ to: next });
    }
  };

  return (
    <div className="flex items-center gap-3 pt-2">
      {back ? (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={() => navigate({ to: back })}
        >
          <ArrowLeft className="size-3.5" />
          {t('nav.back')}
        </Button>
      ) : (
        <span />
      )}
      <Button
        size="lg"
        className="ml-auto min-w-[148px] gap-2"
        disabled={disabled}
        onClick={handleContinue}
      >
        {loading ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {continueLabel ?? t('nav.continue')}
          </>
        ) : (
          <>
            {continueLabel ?? t('nav.continue')}
            <ArrowRight className="size-4" />
          </>
        )}
      </Button>
    </div>
  );
}
