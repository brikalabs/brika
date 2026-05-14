/**
 * `brika restart` — sends SIGUSR1 to the running supervisor (which
 * is the mortar-style signal to "cycle the hub child"). Brix narrates
 * stopping → restarting → done as a single mood-script line so the
 * face transitions are part of the story.
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

export function RestartView(): React.ReactElement {
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
        process.kill(status.pid, 'SIGUSR1');
        setPhase({ kind: 'sent', pid: status.pid });
      } catch (e) {
        setPhase({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    })();
  }, []);

  if (phase.kind === 'checking') {
    return (
      <BrixTalking mood="thinking" mode="typewriter" text="{:focused:}signalling supervisor…" />
    );
  }
  if (phase.kind === 'sent') {
    return (
      <BrixTalking
        mood="happy"
        mode="typewriter"
        text={`{:focused:}stopping… {:thinking:}restarting… {:happy:}signal sent to pid ${phase.pid}`}
        onDone={() => exit(300)}
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
        text="{:sleep:}nothing to restart — hub isn't running"
        onDone={() => exit(250)}
      />
    );
  }
  return (
    <BrixTalking
      mood="error"
      mode="typewriter"
      text={`{:error:}couldn't restart: ${phase.message}`}
      onDone={() => exit(400)}
    />
  );
}
