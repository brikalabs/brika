import type { Command } from '@brika/cli';
import { useEffect, useState } from 'react';
import { useExit } from '../../runCommandTui';
import { detectShell, installCompletions, type Shell } from '../../shared/cli/completions';

export type Phase =
  | { kind: 'detecting' }
  | { kind: 'installing'; shell: Shell }
  | { kind: 'installed'; shell: Shell; file: string; alreadyInstalled: boolean }
  | { kind: 'noShell' }
  | { kind: 'error'; message: string };

const EXIT_DELAY_MS = 300;
const EXIT_ERROR_DELAY_MS = 400;

export interface UseCompletionsInstallOptions {
  /** ms to hold the `installed` screen before exiting. Default 300. */
  readonly exitDelayMs?: number;
  /** ms to hold the `noShell`/`error` screen before exiting. Default 400. */
  readonly exitErrorDelayMs?: number;
}

export function useCompletionsInstall(
  commands: Command[],
  options: UseCompletionsInstallOptions = {}
): { phase: Phase } {
  const exit = useExit();
  const exitDelayMs = options.exitDelayMs ?? EXIT_DELAY_MS;
  const exitErrorDelayMs = options.exitErrorDelayMs ?? EXIT_ERROR_DELAY_MS;
  const [phase, setPhase] = useState<Phase>({ kind: 'detecting' });

  useEffect(() => {
    void (async () => {
      try {
        const shell = detectShell();
        if (!shell) {
          setPhase({ kind: 'noShell' });
          return;
        }
        setPhase({ kind: 'installing', shell });
        const result = await installCompletions(shell, commands);
        setPhase({ kind: 'installed', shell, ...result });
      } catch (e) {
        setPhase({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    })();
  }, [commands]);

  useEffect(() => {
    if (phase.kind === 'installed') {
      const t = setTimeout(() => exit(), exitDelayMs);
      return () => clearTimeout(t);
    }
    if (phase.kind === 'noShell' || phase.kind === 'error') {
      const t = setTimeout(() => exit(), exitErrorDelayMs);
      return () => clearTimeout(t);
    }
  }, [phase, exit, exitDelayMs, exitErrorDelayMs]);

  return { phase };
}
