/**
 * `brika open` — opens the hub's UI in the default browser. Refuses
 * (politely) if the hub isn't running, since there's nothing to open.
 */

import { BrixTalking } from '@brika/brix';
import type React from 'react';
import { useEffect, useState } from 'react';
import { hubUrl } from '../../cli/hub-client';
import { openBrowser } from '../../cli/open';
import { checkPid } from '../../cli/pid';
import { useExit } from '../runCommandTui';

type Phase = { kind: 'checking' } | { kind: 'opening'; url: string } | { kind: 'notRunning' };

export function OpenView(): React.ReactElement {
  const exit = useExit();
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' });

  useEffect(() => {
    void (async () => {
      const status = await checkPid();
      if (status.state !== 'running') {
        setPhase({ kind: 'notRunning' });
        return;
      }
      const url = hubUrl();
      openBrowser(url);
      setPhase({ kind: 'opening', url });
    })();
  }, []);

  if (phase.kind === 'checking') {
    return <BrixTalking mood="thinking" mode="typewriter" text="checking hub…" />;
  }
  if (phase.kind === 'opening') {
    return (
      <BrixTalking
        mood="excited"
        mode="typewriter"
        text={`{:excited:}opening {:default:}${phase.url}`}
        onDone={() => exit(250)}
      />
    );
  }
  return (
    <BrixTalking
      mood="sleep"
      mode="typewriter"
      text="{:sleep:}hub is sleeping — nothing to open"
      onDone={() => exit(250)}
    />
  );
}
