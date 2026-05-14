/**
 * `brika stop` — sends SIGTERM to the running hub, narrating each
 * phase. Brix shows `loading` while the signal is in flight and
 * `happy` once the signal is delivered.
 */

import { BrixTalking } from '@brika/brix';
import type React from 'react';
import { useEffect, useState } from 'react';
import { checkPid, removePidFile } from '../../cli/pid';
import { useExit } from '../runCommandTui';

type Phase =
  | { kind: 'checking' }
  | { kind: 'sent'; pid: number }
  | { kind: 'stale'; pid: number }
  | { kind: 'notRunning' }
  | { kind: 'error'; message: string };

export function StopView(): React.ReactElement {
  const exit = useExit();
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' });

  useEffect(() => {
    void (async () => {
      try {
        const status = await checkPid();
        if (status.state === 'stopped') {
          setPhase({ kind: 'notRunning' });
          return;
        }
        if (status.state === 'stale') {
          await removePidFile();
          setPhase({ kind: 'stale', pid: status.pid });
          return;
        }
        process.kill(status.pid, 'SIGTERM');
        setPhase({ kind: 'sent', pid: status.pid });
      } catch (e) {
        setPhase({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    })();
  }, []);

  if (phase.kind === 'checking') {
    return <BrixTalking mood="loading" mode="typewriter" text="{:loading:}stopping…" />;
  }
  if (phase.kind === 'sent') {
    return (
      <BrixTalking
        mood="happy"
        mode="typewriter"
        text={`{:happy:}sent SIGTERM to pid ${phase.pid}`}
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
  if (phase.kind === 'notRunning') {
    return (
      <BrixTalking
        mood="sleep"
        mode="typewriter"
        text="{:sleep:}not running — no pid file"
        onDone={() => exit(250)}
      />
    );
  }
  return (
    <BrixTalking
      mood="error"
      mode="typewriter"
      text={`{:error:}couldn't stop: ${phase.message}`}
      onDone={() => exit(400)}
    />
  );
}
