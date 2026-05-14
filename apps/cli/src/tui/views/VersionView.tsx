/**
 * `brika version` — Brix says the wordmark + version. Reveals
 * char-by-char with typewriter pacing, then exits cleanly.
 */

import { BrixTalking } from '@brika/brix';
import type React from 'react';
import { CLI_VERSION } from '../../version';
import { useExit } from '../runCommandTui';

export function VersionView(): React.ReactElement {
  const exit = useExit();
  return (
    <BrixTalking
      mood="default"
      mode="typewriter"
      text={`{:default:}Brika Runtime {:happy:}v${CLI_VERSION}`}
      onDone={() => exit(250)}
    />
  );
}
