import { Kbd, ScreenChrome, Spinner } from '@brika/tui';
import { Box, Text, useApp, useInput } from 'ink';
import React from 'react';
import { BRAND_LINE, MORTAR_WORDMARK } from '../../brand';
import { useMortar } from '../useMortar';

/**
 * Full-screen overlay shown between the supervisor's `shutting-down`
 * and `shutdown` events. Per-service rows show what's still dying
 * versus what's already exited. Spinner gives liveness; Ctrl+C
 * force-exits without waiting for the grace period.
 */
export function ShutdownView(): React.ReactElement {
  const { supervisor, services } = useMortar();
  const { exit } = useApp();

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
    }
  });

  const live = supervisor.liveCount();
  const total = services.filter((s) => supervisor.hasSpawned(s.spec.id)).length;
  const stopped = total - live;
  const done = live === 0;

  return (
    <ScreenChrome
      wordmark={MORTAR_WORDMARK}
      brand={BRAND_LINE}
      title="Shutting down"
      titleColor="yellow"
    >
      <Box flexDirection="column">
        <Box marginBottom={1}>
          {done ? <Text color="green">✓</Text> : <Spinner color="yellow" />}
          <Text bold>
            {done ? '  All children stopped. Cleaning up…' : '  Terminating processes'}
          </Text>
          <Text dimColor>{`   (${stopped}/${total} stopped)`}</Text>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          {services.map((svc) => (
            <ServiceRow
              key={svc.spec.id}
              label={svc.spec.label}
              wasSpawned={supervisor.hasSpawned(svc.spec.id)}
              alive={supervisor.isAlive(svc.spec.id)}
            />
          ))}
        </Box>

        <Text dimColor>
          Sending SIGTERM, then SIGKILL after a 3s grace period if anything is still alive.
        </Text>
        <Box marginTop={1}>
          <Text dimColor>Press </Text>
          <Kbd>Ctrl+C</Kbd>
          <Text dimColor> again to force-exit immediately.</Text>
        </Box>
      </Box>
    </ScreenChrome>
  );
}

interface ServiceRowProps {
  readonly label: string;
  readonly wasSpawned: boolean;
  readonly alive: boolean;
}

function ServiceRow({ label, wasSpawned, alive }: Readonly<ServiceRowProps>): React.ReactElement {
  let glyph: React.ReactElement;
  let state: React.ReactElement;
  if (!wasSpawned) {
    glyph = <Text dimColor>○</Text>;
    state = <Text dimColor>never started</Text>;
  } else if (alive) {
    glyph = <Spinner color="yellow" />;
    state = <Text color="yellow">terminating…</Text>;
  } else {
    glyph = <Text color="green">✓</Text>;
    state = <Text color="green">stopped</Text>;
  }
  return (
    <Box>
      <Box width={3}>{glyph}</Box>
      <Box width={24}>
        <Text bold={alive}>{label}</Text>
      </Box>
      {state}
    </Box>
  );
}
