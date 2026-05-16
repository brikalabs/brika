import type { Command } from '@brika/cli';
import { useEffect, useState } from 'react';
import {
  detectShell,
  installCompletions,
  type Shell,
} from '../../shared/cli/completions';
import { useExit } from '../../runCommandTui';

export type Phase =
  | { kind: 'detecting' }
  | { kind: 'installing'; shell: Shell }
  | { kind: 'installed'; shell: Shell; file: string; alreadyInstalled: boolean }
  | { kind: 'noShell' }
  | { kind: 'error'; message: string };

const EXIT_DELAY_MS = 300;
const EXIT_ERROR_DELAY_MS = 400;

export function useCompletionsInstall(commands: Command[]): { phase: Phase } {
  const exit = useExit();
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
      const t = setTimeout(() => exit(), EXIT_DELAY_MS);
      return () => clearTimeout(t);
    }
    if (phase.kind === 'noShell' || phase.kind === 'error') {
      const t = setTimeout(() => exit(), EXIT_ERROR_DELAY_MS);
      return () => clearTimeout(t);
    }
  }, [phase, exit]);

  return { phase };
}
