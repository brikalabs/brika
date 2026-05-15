/**
 * `brika completions` — install or remove shell completions. The TUI
 * narrates each phase: detecting → writing → done. For the
 * `--print <shell>` and `--uninstall` flows, the actual side effects
 * stay in the command handler; this view just renders the result.
 */

import type { Command } from '@brika/cli';
import { Box, Text } from 'ink';
import type React from 'react';
import { useEffect, useState } from 'react';
import { detectShell, installCompletions, type Shell, shellList } from '../../cli/completions';
import { useExit } from '../runCommandTui';

type Phase =
  | { kind: 'detecting' }
  | { kind: 'installing'; shell: Shell }
  | { kind: 'installed'; shell: Shell; file: string; alreadyInstalled: boolean }
  | { kind: 'noShell' }
  | { kind: 'error'; message: string };

const EXIT_DELAY_MS = 300;
const EXIT_ERROR_DELAY_MS = 400;

export interface CompletionsViewProps {
  readonly commands: Command[];
}

export function CompletionsView({ commands }: Readonly<CompletionsViewProps>): React.ReactElement {
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

  return (
    <Box>
      <Text color={colorFor(phase)}>{messageFor(phase)}</Text>
    </Box>
  );
}

function messageFor(phase: Phase): string {
  switch (phase.kind) {
    case 'detecting':
      return 'detecting shell…';
    case 'installing':
      return `installing ${phase.shell} completions…`;
    case 'installed':
      return `${phase.alreadyInstalled ? 'already installed' : 'installed'} — restart your shell to apply`;
    case 'noShell':
      return `couldn't detect shell — pass one of ${shellList()}`;
    case 'error':
      return phase.message;
  }
}

function colorFor(phase: Phase): string {
  switch (phase.kind) {
    case 'installed':
      return 'green';
    case 'noShell':
      return 'yellow';
    case 'error':
      return 'red';
    default:
      return 'cyan';
  }
}
