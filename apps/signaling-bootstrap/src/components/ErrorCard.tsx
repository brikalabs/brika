import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateIcon,
  EmptyStateTitle,
} from '@brika/clay';
import { Link } from '@tanstack/react-router';
import { AlertCircle, ExternalLink, RotateCw, SearchX } from 'lucide-react';
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
  const [remaining, setRemaining] = useState<number | null>(
    error.kind === 'retry' && error.autoRetry ? error.autoRetry : null
  );
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
      <EmptyState className="w-full max-w-[440px]">
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
    <div className="w-full max-w-[440px] space-y-3">
      <Alert variant="destructive">
        <AlertIcon>
          <AlertCircle />
        </AlertIcon>
        <AlertTitle>{error.title}</AlertTitle>
        <AlertDescription>{error.detail}</AlertDescription>
      </Alert>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {error.kind === 'retry' ? (
          <Button
            onClick={() => {
              setRemaining(null);
              onRetry();
            }}
          >
            <RotateCw />
            Try again
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
      {remaining !== null && remaining > 0 && (
        <p className="text-center text-[12px] text-muted-foreground tabular-nums">
          Auto-retrying in {remaining}s…
        </p>
      )}
    </div>
  );
}
