/**
 * `brika completions` — install or remove shell completions. The TUI
 * narrates each phase: detecting → writing → done. For the
 * `--print <shell>` and `--uninstall` flows, the actual side effects
 * stay in the command handler; this view just renders the result.
 */

import { BrixTalking } from '@brika/brix';
import type { Command } from '@brika/cli';
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

  if (phase.kind === 'detecting') {
    return <BrixTalking mood="thinking" text="detecting shell…" />;
  }
  if (phase.kind === 'installing') {
    return (
      <BrixTalking mood="loading" text={`{:loading:}installing ${phase.shell} completions…`} />
    );
  }
  if (phase.kind === 'installed') {
    const verb = phase.alreadyInstalled ? 'already installed' : 'installed';
    return (
      <BrixTalking
        mood="happy"
        text={`{:happy:}${verb} — restart your shell to apply`}
        onDone={() => exit(300)}
      />
    );
  }
  if (phase.kind === 'noShell') {
    return (
      <BrixTalking
        mood="suspicious"
        text={`{:suspicious:}couldn't detect shell — pass one of ${shellList()}`}
        onDone={() => exit(400)}
      />
    );
  }
  return <BrixTalking mood="error" text={`{:error:}${phase.message}`} onDone={() => exit(400)} />;
}
