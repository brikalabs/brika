import {
  Button,
  Card,
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateIcon,
  EmptyStateTitle,
} from '@brika/clay';
import { Link } from '@tanstack/react-router';
import { ExternalLink, RotateCw, SearchX } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import type { ErrorClassification } from '@/lib/classify-error';

interface ErrorCardProps {
  readonly error: ErrorClassification;
  readonly onRetry: () => void;
}

const HELP_HREF = 'https://brika.dev/docs/remote-access';

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
          <Button asChild>
            <Link to="/">Pick a different hub</Link>
          </Button>
        </EmptyStateActions>
      </EmptyState>
    );
  }

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
          <Button asChild variant="outline">
            <Link to="/">Different hub</Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
