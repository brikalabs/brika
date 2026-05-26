import { Check, Copy } from '@brika/sdk/ui-kit/icons';
import { useEffect, useState } from 'react';

export function CopyChip({ value, label }: Readonly<{ value: string; label: string }>) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) {
      return;
    }
    const t = setTimeout(() => setCopied(false), 1_400);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      title={`Copy ${label}`}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
      }}
      className="inline-flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
    >
      {copied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
    </button>
  );
}
