import type { LucideIcon } from 'lucide-react';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export interface InfoItemProps {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  copyable?: boolean;
  href?: string;
  mono?: boolean;
  secondary?: string;
}

export function InfoItem({
  icon: Icon,
  label,
  value,
  copyable,
  href,
  mono = true,
  secondary,
}: Readonly<InfoItemProps>) {
  const [copied, setCopied] = useState(false);
  const canCopy = copyable && typeof value === 'string';

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canCopy) return;

    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const className = cn(
    'group relative flex items-center gap-3 rounded-lg border p-3 transition-colors',
    href && 'cursor-pointer hover:bg-accent/50'
  );

  const content = (
    <>
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="shrink-0 text-muted-foreground text-sm">{label}</span>
      <span className={cn('ml-auto min-w-0 truncate text-sm', mono && 'font-mono')}>{value}</span>
      {secondary && <span className="shrink-0 text-muted-foreground text-xs">({secondary})</span>}
      {canCopy && (
        <button
          type="button"
          onClick={handleCopy}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md border bg-background p-1.5 text-muted-foreground opacity-0 shadow-sm transition-all hover:bg-accent hover:text-foreground group-hover:opacity-100"
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </button>
      )}
    </>
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {content}
      </a>
    );
  }

  return <div className={className}>{content}</div>;
}
