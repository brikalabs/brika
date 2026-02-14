import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { defineRenderer } from './registry';

defineRenderer('code-block', ({ node }) => {
  const [copied, setCopied] = useState(false);
  const lines = node.code.replace(/\n$/, '').split('\n');
  const visibleLines = node.maxLines ? lines.slice(0, node.maxLines) : lines;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(node.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-muted/50">
      {(node.label || node.copyable !== false) && (
        <div className="flex items-center justify-between border-border border-b bg-muted/60 px-3 py-1.5">
          <span className="text-muted-foreground text-xs">{node.label ?? node.language ?? ''}</span>
          {node.copyable !== false && (
            <button
              type="button"
              onClick={handleCopy}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </button>
          )}
        </div>
      )}
      <div
        className={cn('overflow-auto', node.maxLines && 'max-h-[var(--max-h)]')}
        style={
          node.maxLines
            ? ({ '--max-h': `${node.maxLines * 1.5}rem` } as React.CSSProperties)
            : undefined
        }
      >
        <pre className="p-3 text-xs leading-6">
          <code className="block font-mono">
            {visibleLines.map((line, i) => (
              <span key={`line-${i}`} className="block whitespace-pre">
                {node.showLineNumbers && (
                  <span className="mr-4 inline-block w-6 select-none text-right text-muted-foreground tabular-nums">
                    {i + 1}
                  </span>
                )}
                {line || ' '}
              </span>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
});
