import {
  Button,
  Card,
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateIcon,
  EmptyStateTitle,
} from '@brika/clay';
import { Eraser, ExternalLink, RotateCw, SearchX } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import type { ErrorClassification } from '@/lib/classify-error';
import { clearHubName } from '@/lib/hub-storage';
import { clearBootstrapState } from '@/lib/service-worker';

interface ErrorCardProps {
  readonly error: ErrorClassification;
  readonly onRetry: () => void;
}

const HELP_HREF = 'https://docs.brika.dev/architecture/remote-access';

export function ErrorCard({ error, onRetry }: ErrorCardProps): React.ReactElement {
  // `change-name` doesn't auto-retry; the user has to pick a different name.
  // For 'retry' kinds we run a visible countdown that the user can cancel
  // by clicking the primary action.
  const initialRemaining = error.kind === 'retry' && error.autoRetry ? error.autoRetry : null;
  const [remaining, setRemaining] = useState<number | null>(initialRemaining);
  const onRetryRef = useRef(onRetry);
  onRetryRef.current = onRetry;

  useEffect(() => {
    if (remaining === null) {
      return;
    }
    if (remaining <= 0) {
      onRetryRef.current();
      return;
    }
    const t = setTimeout(() => setRemaining((r) => (r === null ? null : r - 1)), 1000);
    return () => clearTimeout(t);
  }, [remaining]);

  // "Different hub" / "Pick a different hub" navigates back to the
  // landing card. We must drop the stored hub name first — otherwise
  // `loadHubName()` on the next render reads the bad name out of
  // localStorage and the bootstrap immediately retries the failing hub
  // (trap reported by users: typed a nonexistent name, couldn't go
  // back). `clearHubName` also purges `brika-*` caches, so the new
  // attempt starts from a clean slate.
  const handlePickDifferent = async (): Promise<void> => {
    await clearHubName();
    globalThis.location.replace('/');
  };

  // The "no such hub" case isn't really an error — it's an empty/not-found
  // state. Render with EmptyState so the affordance reads "pick another"
  // rather than "something broke".
  if (error.kind === 'change-name') {
    return (
      <EmptyState className="w-full max-w-110">
        <EmptyStateIcon>
          <SearchX />
        </EmptyStateIcon>
        <EmptyStateTitle>{error.title}</EmptyStateTitle>
        <EmptyStateDescription>{error.detail}</EmptyStateDescription>
        <EmptyStateActions>
          <Button onClick={() => void handlePickDifferent()}>Pick a different hub</Button>
        </EmptyStateActions>
      </EmptyState>
    );
  }

  const handleReset = async (): Promise<void> => {
    await clearBootstrapState();
    globalThis.location.reload();
  };

  return (
    <Card role="alert" data-error-kind={error.kind} className="w-full max-w-110">
      <div className="space-y-4 px-6 py-5 text-center">
        <div className="space-y-1.5">
          <h3 className="font-semibold text-base text-foreground tracking-tight">{error.title}</h3>
          <p className="text-[13px] text-muted-foreground leading-relaxed">{error.detail}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          {error.kind === 'retry' ? (
            <Button
              onClick={() => {
                setRemaining(null);
                onRetry();
              }}
            >
              <RotateCw />
              <span>
                Try again
                {remaining !== null && remaining > 0 && (
                  <span className="ml-1.5 tabular-nums opacity-70">· {remaining}s</span>
                )}
              </span>
            </Button>
          ) : (
            <Button asChild>
              <a href={HELP_HREF} target="_blank" rel="noopener">
                <ExternalLink />
                Get help
              </a>
            </Button>
          )}
          <Button variant="outline" onClick={() => void handlePickDifferent()}>
            Different hub
          </Button>
        </div>
        <div className="border-border/40 border-t pt-3">
          <button
            type="button"
            onClick={() => void handleReset()}
            className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            title="Unregister the service worker, clear the asset cache, and reload"
          >
            <Eraser className="size-3" />
            Reset and reload
          </button>
        </div>
      </div>
    </Card>
  );
}
