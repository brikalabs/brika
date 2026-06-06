/**
 * Echo block node-body view.
 *
 * Renders the last echoed result directly on the canvas node using the live
 * runtime value pushed from the plugin process (useBlockData). Falls back to an
 * idle hint before any message has flowed through.
 */

import { useBlockData } from '@brika/sdk/block-views';
import { MessageCircle, MessagesSquare } from 'lucide-react';

function format(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}

export default function EchoNode() {
  const data = useBlockData<unknown>();

  if (data === undefined) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed bg-muted/30 px-2.5 py-2 text-muted-foreground">
        <MessagesSquare className="size-4 shrink-0" />
        <span className="text-xs italic">Waiting for the first message...</span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 rounded-md border bg-blue-500/5 px-2.5 py-2">
      <MessageCircle className="mt-0.5 size-4 shrink-0 text-blue-500" />
      <div className="min-w-0 flex-1">
        <span className="block text-[10px] text-muted-foreground uppercase tracking-wide">
          Last echo
        </span>
        <code className="block whitespace-pre-wrap break-words font-mono text-foreground text-xs leading-snug">
          {format(data)}
        </code>
      </div>
    </div>
  );
}
