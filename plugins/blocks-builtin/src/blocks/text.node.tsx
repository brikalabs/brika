/**
 * Text block node-body view.
 *
 * Renders the configured markdown-ish text directly on the canvas node. When a
 * value is flowing through (live data), it is previewed below the text.
 */

import { useBlockConfig, useBlockData } from '@brika/sdk/block-views';

interface TextConfig {
  content?: string;
}

function toText(value: unknown): string {
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

export default function TextNode() {
  const config = useBlockConfig<TextConfig>();
  const data = useBlockData<unknown>();
  const content = config.content?.trim();

  return (
    <div className="space-y-1.5">
      {content ? (
        <p className="whitespace-pre-wrap break-words text-foreground text-sm leading-snug">
          {content}
        </p>
      ) : (
        <p className="text-muted-foreground text-xs italic">Set text in the config panel</p>
      )}
      {data !== undefined && (
        <code className="block truncate rounded bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {toText(data)}
        </code>
      )}
    </div>
  );
}
