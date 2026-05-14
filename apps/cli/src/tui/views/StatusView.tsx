/**
 * `brika status` — TUI rendering of the hub status check. Brix
 * checks the PID file (with a brief thinking face) then announces
 * the result with the matching mood.
 */

import { BrixTalking } from '@brika/brix';
import type React from 'react';
import { useEffect, useState } from 'react';
import { checkPid, type PidStatus, removePidFile } from '../../cli/pid';
import { useExit } from '../runCommandTui';

type Phase =
  | { kind: 'checking' }
  | { kind: 'running'; pid: number }
  | { kind: 'stale'; pid: number }
  | { kind: 'stopped' };

function phaseFor(status: PidStatus): Phase {
  switch (status.state) {
    case 'running':
      return { kind: 'running', pid: status.pid };
    case 'stale':
      return { kind: 'stale', pid: status.pid };
    case 'stopped':
      return { kind: 'stopped' };
  }
}

export function StatusView(): React.ReactElement {
  const exit = useExit();
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' });

  useEffect(() => {
    void (async () => {
      const status = await checkPid();
      if (status.state === 'stale') {
        await removePidFile();
      }
      setPhase(phaseFor(status));
    })();
  }, []);

  if (phase.kind === 'checking') {
    return <BrixTalking mood="thinking" mode="typewriter" text="checking hub…" />;
  }
  if (phase.kind === 'running') {
    return (
      <BrixTalking
        mood="happy"
        mode="typewriter"
        text={`{:happy:}running — pid ${phase.pid}`}
        onDone={() => exit(250)}
      />
    );
  }
  if (phase.kind === 'stale') {
    return (
      <BrixTalking
        mood="suspicious"
        mode="typewriter"
        text={`{:suspicious:}stale pid ${phase.pid} — cleared`}
        onDone={() => exit(250)}
      />
    );
  }
  return (
    <BrixTalking mood="sleep" mode="typewriter" text="{:sleep:}stopped" onDone={() => exit(250)} />
  );
}
