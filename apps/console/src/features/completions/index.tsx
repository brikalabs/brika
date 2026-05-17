/**
 * `brika completions` — install or remove shell completions. The TUI
 * narrates each phase: detecting → writing → done. For the
 * `--print <shell>` and `--uninstall` flows, the actual side effects
 * stay in the command handler; this view just renders the result.
 */

import type { Command } from '@brika/cli';
import { Box, Text } from 'ink';
import type React from 'react';
import { shellList } from '../../shared/cli/completions';
import { type Phase, useCompletionsInstall } from './useCompletionsInstall';

export type { Phase } from './useCompletionsInstall';

export interface CompletionsViewProps {
  readonly commands: Command[];
}

export function CompletionsView({ commands }: Readonly<CompletionsViewProps>): React.ReactElement {
  const { phase } = useCompletionsInstall(commands);

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
