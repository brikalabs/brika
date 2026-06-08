import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
  Separator,
} from '@brika/clay';
import { Link } from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';
import { Bug, ChevronDown, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCapture } from '@/features/analytics/hooks';
import { ErrorStack } from './error-stack';

interface ErrorLayoutProps {
  icon: LucideIcon;
  code?: string;
  title: string;
  description: string;
  /** Tile background tint + icon color, e.g. "bg-amber-500/10 text-amber-500". */
  iconClassName?: string;
  /** Accent text color driving the ambient glow + code eyebrow, e.g. "text-amber-500". */
  accentClassName?: string;
  variant?: 'fullscreen' | 'inline';
  /** Raw error — shown in a collapsible debug panel */
  error?: Error | null;
  /** Show retry button */
  onRetry?: () => void;
  /** Show "go to dashboard" link (default: true) */
  showGoHome?: boolean;
}

function ErrorDebugPanel({
  error,
}: Readonly<{
  error: Error;
}>) {
  const capture = useCapture();

  return (
    <Collapsible
      className="w-full"
      onOpenChange={(open) => {
        if (open) {
          capture('error.details_expanded', {
            name: error.name,
          });
        }
      }}
    >
      <div className="flex justify-center">
        <CollapsibleTrigger className="group inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1 font-mono text-muted-foreground/70 text-xs transition-colors hover:border-border hover:bg-muted/60 hover:text-foreground">
          <Bug className="size-3.5" />
          Details
          <ChevronDown className="size-3 transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <ErrorStack error={error} />
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Shared layout shell for error pages.
 * Each error page composes this with its own icon, copy, color, and actions.
 *
 * When an `error` is provided, a collapsible details panel shows the error name, message, and stack.
 */
export function ErrorLayout({
  icon: Icon,
  code,
  title,
  description,
  iconClassName,
  accentClassName,
  variant = 'inline',
  error,
  onRetry,
  showGoHome = true,
}: Readonly<ErrorLayoutProps>) {
  const { t } = useTranslation();
  const capture = useCapture();
  const hasActions = onRetry || showGoHome;

  const handleRetry = () => {
    capture('error.retry_clicked', {
      code: code ?? null,
    });
    onRetry?.();
  };

  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center overflow-hidden px-4',
        variant === 'fullscreen' ? 'min-h-screen bg-background py-16' : 'flex-1 py-24'
      )}
    >
      {/* Ambient accent wash — fullscreen errors only */}
      {variant === 'fullscreen' && (
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-x-0 top-0 h-72 opacity-[0.06] blur-3xl [background:radial-gradient(ellipse_at_top,currentColor,transparent_70%)]',
            accentClassName
          )}
        />
      )}

      <div className="relative flex w-full max-w-sm flex-col items-center gap-6 text-center">
        {/* Icon tile with ambient glow */}
        <div className="fade-in-0 zoom-in-95 relative animate-in duration-500 ease-out">
          <div
            aria-hidden
            className={cn(
              'absolute -inset-4 -z-10 rounded-full bg-current opacity-20 blur-2xl',
              accentClassName
            )}
          />
          <div
            className={cn(
              'flex size-16 items-center justify-center rounded-2xl shadow-sm ring-1 ring-current/15 ring-inset',
              iconClassName ?? 'bg-muted text-muted-foreground'
            )}
          >
            <Icon className="size-8" />
          </div>
        </div>

        {/* Code eyebrow + Title + Description */}
        <div className="fade-in-0 slide-in-from-bottom-2 animate-in space-y-2.5 fill-mode-both duration-500 ease-out [animation-delay:80ms]">
          {code && (
            <p
              className={cn(
                'font-medium font-mono text-xs uppercase tracking-[0.2em]',
                accentClassName ?? 'text-muted-foreground'
              )}
            >
              {code}
            </p>
          )}
          <h1 className="font-semibold text-2xl tracking-tight">{title}</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
        </div>

        {/* Actions */}
        {hasActions && (
          <div className="fade-in-0 slide-in-from-bottom-2 flex animate-in flex-col items-center gap-6 fill-mode-both duration-500 ease-out [animation-delay:160ms]">
            <Separator className="w-12 opacity-60" />
            <div className="flex gap-3">
              {onRetry && (
                <Button variant="outline" onClick={handleRetry}>
                  <RefreshCw className="size-4" />
                  {t('common:errors.tryAgain')}
                </Button>
              )}
              {showGoHome && (
                <Button asChild variant={onRetry ? 'ghost' : 'outline'}>
                  <Link
                    to="/"
                    onClick={() => capture('error.go_home_clicked', { code: code ?? null })}
                  >
                    {t('common:errors.goHome')}
                  </Link>
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Error details (collapsible) — given the full width to breathe */}
      {error && (
        <div className="fade-in-0 slide-in-from-bottom-2 relative mt-8 w-full max-w-3xl animate-in fill-mode-both duration-500 ease-out [animation-delay:240ms]">
          <ErrorDebugPanel error={error} />
        </div>
      )}
    </div>
  );
}
