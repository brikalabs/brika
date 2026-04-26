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
import { ChevronDown, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ErrorLayoutProps {
  icon: LucideIcon;
  code?: string;
  title: string;
  description: string;
  iconClassName?: string;
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
  return (
    <Collapsible className="w-full max-w-lg">
      <CollapsibleTrigger className="group flex w-full items-center justify-center gap-1.5 text-muted-foreground/60 text-xs transition-colors hover:text-muted-foreground">
        <span className="font-mono">Details</span>
        <ChevronDown className="size-3 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-3 overflow-hidden rounded-lg border border-border bg-muted/40 text-left">
          {/* Error name + message */}
          <div className="border-border border-b bg-muted/60 px-3 py-2">
            <p className="font-medium font-mono text-foreground text-xs">
              {error.name}: {error.message}
            </p>
          </div>

          {/* Stack trace */}
          {error.stack && (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all p-3 font-mono text-[11px] text-muted-foreground leading-5">
              {error.stack}
            </pre>
          )}
        </div>
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
  variant = 'inline',
  error,
  onRetry,
  showGoHome = true,
}: Readonly<ErrorLayoutProps>) {
  const { t } = useTranslation();
  const hasActions = onRetry || showGoHome;

  return (
    <div
      className={cn(
        'flex items-center justify-center',
        variant === 'fullscreen' ? 'min-h-screen bg-background p-4' : 'flex-1 py-24'
      )}
    >
      <div className="flex max-w-sm flex-col items-center gap-6 text-center">
        {/* Icon */}
        <div
          className={cn(
            'flex size-20 items-center justify-center rounded-2xl',
            iconClassName ?? 'bg-muted'
          )}
        >
          <Icon className="size-10" />
        </div>

        {/* Code + Title + Description */}
        <div className="space-y-2">
          {code && (
            <p className="font-bold text-4xl text-muted-foreground/50 tracking-tighter">{code}</p>
          )}
          <h1 className="font-semibold text-xl tracking-tight">{title}</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
        </div>

        {/* Actions */}
        {hasActions && (
          <>
            <Separator className="w-16" />
            <div className="flex gap-3">
              {onRetry && (
                <Button variant="outline" onClick={onRetry}>
                  <RefreshCw className="size-4" />
                  {t('common:errors.tryAgain')}
                </Button>
              )}
              {showGoHome && (
                <Button asChild variant={onRetry ? 'ghost' : 'outline'}>
                  <Link to="/">{t('common:errors.goHome')}</Link>
                </Button>
              )}
            </div>
          </>
        )}

        {/* Error details (collapsible) */}
        {error && <ErrorDebugPanel error={error} />}
      </div>
    </div>
  );
}
