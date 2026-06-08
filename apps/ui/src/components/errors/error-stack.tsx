import { Badge, Button, cn, Tooltip, TooltipContent, TooltipTrigger } from '@brika/clay';
import { Check, ChevronRight, Copy } from 'lucide-react';
import { useState } from 'react';
import { useCapture } from '@/features/analytics/hooks';
import { parseStackTrace, type StackFrame } from '@/lib/parse-stack';

function CopyButton({ error }: Readonly<{ error: Error }>) {
  const capture = useCapture();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const payload = error.stack ?? `${error.name}: ${error.message}`;
    await navigator.clipboard.writeText(payload);
    capture('error.details_copied', { name: error.name });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={handleCopy}
          aria-label="Copy full stack trace"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{copied ? 'Copied!' : 'Copy full stack trace'}</TooltipContent>
    </Tooltip>
  );
}

function FrameRow({ frame }: Readonly<{ frame: StackFrame }>) {
  return (
    <li className="flex items-baseline gap-3 px-3 py-1.5 font-mono text-xs">
      <span
        className={cn('truncate', frame.vendor ? 'text-muted-foreground/60' : 'text-foreground')}
      >
        {frame.fn ?? '<anonymous>'}
      </span>
      <span className="ml-auto shrink-0 text-[11px] text-muted-foreground/50" title={frame.file}>
        {frame.location}
      </span>
    </li>
  );
}

/**
 * Vite / Sentry-style error console: an error-type badge, the message,
 * a copy-to-clipboard action, and a parsed stack where dependency frames
 * are dimmed and folded away from application frames.
 */
export function ErrorStack({ error }: Readonly<{ error: Error }>) {
  const frames = parseStackTrace(error.stack);
  const appFrames = frames.filter((frame) => !frame.vendor);
  const vendorCount = frames.length - appFrames.length;
  const hasAppFrames = appFrames.length > 0;

  // Fold dependency frames only when there is application code to show
  // first; an all-vendor trace stays fully expanded.
  const [showVendor, setShowVendor] = useState(!hasAppFrames);
  const visibleFrames = showVendor ? frames : frames.filter((frame) => !frame.vendor);
  const canFold = hasAppFrames && vendorCount > 0;

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-border bg-muted/40 text-left">
      <div className="flex items-start gap-2 border-border border-b bg-muted/60 px-3 py-2.5">
        <Badge variant="destructive" className="shrink-0 font-mono">
          {error.name}
        </Badge>
        <p className="min-w-0 flex-1 self-center break-words font-mono text-foreground text-xs leading-relaxed">
          {error.message}
        </p>
        <CopyButton error={error} />
      </div>

      {visibleFrames.length > 0 && (
        <ul className="max-h-80 divide-y divide-border/40 overflow-auto">
          {visibleFrames.map((frame, index) => (
            <FrameRow key={`${frame.location}-${index}`} frame={frame} />
          ))}
        </ul>
      )}

      {canFold && (
        <button
          type="button"
          onClick={() => setShowVendor((open) => !open)}
          className="flex w-full items-center gap-1.5 border-border border-t px-3 py-2 text-[11px] text-muted-foreground/70 transition-colors hover:text-muted-foreground"
        >
          <ChevronRight className={cn('size-3 transition-transform', showVendor && 'rotate-90')} />
          {showVendor ? 'Hide' : 'Show'} {vendorCount} frame{vendorCount === 1 ? '' : 's'} in
          dependencies
        </button>
      )}
    </div>
  );
}
