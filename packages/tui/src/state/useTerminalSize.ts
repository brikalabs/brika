/**
 * Terminal dimensions that update on resize. ink's `useStdout()` gives
 * us the stream but doesn't re-render on resize — we listen explicitly.
 *
 * Defaults of 80×24 mirror what most terminals fall back to when the
 * dimensions are unavailable (CI, pipes, MinTTY edge cases).
 */

import { useStdout } from 'ink';
import { useEffect, useState } from 'react';

export interface TerminalSize {
  readonly columns: number;
  readonly rows: number;
}

export function useTerminalSize(): TerminalSize {
  const { stdout } = useStdout();
  const [size, setSize] = useState<TerminalSize>(() => ({
    columns: stdout?.columns ?? 80,
    rows: stdout?.rows ?? 24,
  }));

  useEffect(() => {
    if (!stdout) {
      return;
    }
    const update = (): void => {
      setSize({ columns: stdout.columns ?? 80, rows: stdout.rows ?? 24 });
    };
    stdout.on('resize', update);
    return () => {
      stdout.off('resize', update);
    };
  }, [stdout]);

  return size;
}
