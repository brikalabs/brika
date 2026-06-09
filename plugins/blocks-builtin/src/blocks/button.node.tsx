/**
 * Button block node-body view.
 *
 * Renders a button on the canvas node. A click POSTs to `/api/workflows/inject`
 * for this block's `press` port, manually triggering the running workflow (the
 * inject opens a recorded run). The view is same-origin, so the fetch reaches
 * the hub API directly.
 */

import { useBlockConfig, useBlockId } from '@brika/sdk/block-views';
import { MousePointerClick } from 'lucide-react';
import { useState } from 'react';

interface ButtonConfig {
  label?: string;
}

export default function ButtonNode() {
  const config = useBlockConfig<ButtonConfig>();
  const blockId = useBlockId();
  const [pending, setPending] = useState(false);

  const trigger = async () => {
    setPending(true);
    try {
      await fetch('/api/workflows/inject', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ blockId, port: 'press' }),
      });
    } catch {
      // Run state surfaces via the debug stream / Runs tab; nothing to show here.
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={trigger}
      disabled={pending}
      className="flex w-full items-center justify-center gap-2 rounded-md bg-violet-500 px-3 py-1.5 font-medium text-sm text-white transition-colors hover:bg-violet-600 disabled:opacity-50"
    >
      <MousePointerClick className="size-4" />
      {config.label ?? 'Trigger'}
    </button>
  );
}
