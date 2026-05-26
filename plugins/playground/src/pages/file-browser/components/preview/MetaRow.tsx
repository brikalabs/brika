import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@brika/sdk/ui-kit';
import { Check, Copy } from '@brika/sdk/ui-kit/icons';
import { useCallback, useEffect, useState } from 'react';

interface MetaRowProps {
  label: string;
  value: string;
  mono?: boolean;
  copy?: string;
}

function CopyButton({ value, label }: Readonly<{ value: string; label: string }>) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const t = setTimeout(() => setCopied(false), 1_400);
    return () => clearTimeout(t);
  }, [copied]);

  const onCopy = useCallback(async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
  }, [value]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-5 shrink-0 [&_svg]:size-3"
          onClick={onCopy}
        >
          {copied ? <Check className="text-success" /> : <Copy />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{copied ? `${label} copied` : `Copy ${label}`}</TooltipContent>
    </Tooltip>
  );
}

export function MetaRow({ label, value, mono, copy }: Readonly<MetaRowProps>) {
  return (
    <div className="grid grid-cols-[72px_1fr] items-baseline gap-3 py-1.5">
      <dt className="font-mono text-[10px] text-muted-foreground/80 uppercase tracking-[0.14em]">
        {label}
      </dt>
      <dd className="flex min-w-0 items-baseline gap-2">
        <span
          className={`min-w-0 flex-1 truncate text-foreground/90 text-xs ${mono ? 'font-mono' : ''}`}
          title={value}
        >
          {value}
        </span>
        {copy && <CopyButton value={copy} label={label.toLowerCase()} />}
      </dd>
    </div>
  );
}
