/**
 * Tiny wrapper around `runTui` for "one-shot" commands.
 *
 * Each command's view is a React component that narrates via Brix and
 * eventually calls `exit()` from the {@link useExit} hook to tear down
 * the Ink instance. `runCommandTui()` mounts the view; the handler
 * doesn't have to know about ink's `waitUntilExit` lifecycle.
 *
 * Falls back to a plain `brix.*` narration when stdout isn't a TTY,
 * so piped output (`brika version | grep …`) and CI logs stay clean.
 *
 *   await runCommandTui(<StopView />, () => brix.ok('stopped'));
 */

import { runTui } from '@brika/cli/tui';
import { useApp } from 'ink';
import type { ReactElement } from 'react';
import { useCallback } from 'react';

/**
 * Convenience hook for command views — returns a stable callback that
 * tears down the Ink instance. Optionally delays so the closing
 * animation/text has a beat to land.
 */
export function useExit(): (delayMs?: number) => void {
  const { exit } = useApp();
  return useCallback(
    (delayMs = 0) => {
      if (delayMs <= 0) {
        exit();
        return;
      }
      setTimeout(() => exit(), delayMs);
    },
    [exit]
  );
}

/**
 * Render `element` if stdout is a TTY; otherwise call `fallback` for
 * plain-text output. Awaits the TUI to exit before resolving.
 */
export async function runCommandTui(
  element: ReactElement,
  fallback?: () => void | Promise<void>
): Promise<void> {
  if (!process.stdout.isTTY && fallback) {
    await fallback();
    return;
  }
  await runTui(element);
}
