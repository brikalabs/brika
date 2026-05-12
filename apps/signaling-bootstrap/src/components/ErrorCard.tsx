import { Button } from '@brika/clay';
import { ExternalLink, RotateCw } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import type { ErrorClassification } from '@/lib/classify-error';

interface ErrorCardProps {
  readonly error: ErrorClassification;
  readonly onRetry: () => void;
}

const PRIMARY_LABEL: Record<ErrorClassification['kind'], string> = {
  retry: 'Try again',
  'change-name': 'Different hub',
  help: 'Get help',
};

const HELP_HREF = 'https://brika.dev/docs/remote-access';

export function ErrorCard({ error, onRetry }: ErrorCardProps): React.ReactElement {
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

  const onPrimaryClick = (): void => {
    if (error.kind === 'retry') {
      setRemaining(null);
      onRetry();
    } else if (error.kind === 'change-name') {
      location.href = '/';
    } else {
      window.open(HELP_HREF, '_blank', 'noopener');
    }
  };

  return (
    <div className="w-full max-w-[420px] text-center">
      <h2 className="font-semibold text-[16px] tracking-tight">{error.title}</h2>
      <p className="mx-auto mt-2 max-w-[340px] text-[13.5px] text-muted-foreground leading-relaxed">
        {error.detail}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button onClick={onPrimaryClick}>
          {error.kind === 'retry' && <RotateCw />}
          {error.kind === 'help' && <ExternalLink />}
          {PRIMARY_LABEL[error.kind]}
        </Button>
        {error.kind === 'retry' && (
          <Button asChild variant="outline">
            <a href="/">Different hub</a>
          </Button>
        )}
      </div>
      {remaining !== null && remaining > 0 && (
        <p className="mt-4 inline-flex items-center gap-2 text-[12px] text-muted-foreground tabular-nums">
          <span className="size-1.5 rounded-full bg-muted-foreground" />
          Auto-retrying in {remaining}s…
        </p>
      )}
    </div>
  );
}
