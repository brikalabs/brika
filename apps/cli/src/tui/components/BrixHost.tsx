/**
 * The one Brix on screen — lives in the shell footer. Owns idle
 * motion (breathing + occasional blinks/glances), reactions to hub
 * state changes (a one-shot wave / oops / sleep emote), and talking
 * (typewriter reveal whenever a view publishes a new status line).
 *
 * Views never render their own Brix while inside the shell. They
 * publish `mood` + `statusText` through <CliProvider>; BrixHost reads
 * those and is the only mascot painted in the chrome.
 */

import { type AnimationKind, BrixAnimated, BrixIdle, BrixTalking, type Mood } from '@brika/brix';
import { Box, Text } from 'ink';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useCli } from '../useCli';

type HubState = 'running' | 'stale' | 'stopped' | 'unknown';

interface Reaction {
  readonly kind: AnimationKind;
  readonly color: string;
}

const REACTIONS: Readonly<Record<HubState, Reaction | null>> = {
  running: { kind: 'wave', color: 'green' },
  stale: { kind: 'oops', color: 'yellow' },
  stopped: { kind: 'sleep', color: 'gray' },
  unknown: null,
};

const REACTION_MS = 1400;
const TALK_HOLD_MS = 2200;

type Phase = 'idle' | 'reacting' | 'talking';

export function BrixHost(): React.ReactElement {
  const cli = useCli();
  const { hub, mood, statusText } = cli;

  const [phase, setPhase] = useState<Phase>('idle');
  const lastHub = useRef<HubState>(hub.state);
  const lastText = useRef<string>(statusText);
  const lastReaction = useRef<Reaction | null>(null);

  // Reaction trigger: any hub-state change after mount.
  useEffect(() => {
    if (lastHub.current === hub.state) {
      return;
    }
    lastHub.current = hub.state;
    const reaction = REACTIONS[hub.state];
    if (!reaction) {
      return;
    }
    lastReaction.current = reaction;
    setPhase('reacting');
    const t = setTimeout(() => setPhase('idle'), REACTION_MS);
    return () => clearTimeout(t);
  }, [hub.state]);

  // Talk trigger: statusText changed → typewriter the new line, then
  // hold it for a beat before drifting back to idle.
  useEffect(() => {
    if (lastText.current === statusText) {
      return;
    }
    lastText.current = statusText;
    setPhase('talking');
    // Failsafe: if BrixTalking's onDone never fires (empty line, etc.)
    // we still come back to idle after TALK_HOLD_MS.
    const t = setTimeout(() => setPhase('idle'), TALK_HOLD_MS);
    return () => clearTimeout(t);
  }, [statusText]);

  if (phase === 'reacting' && lastReaction.current) {
    return (
      <Box>
        <BrixAnimated kind={lastReaction.current.kind} color={lastReaction.current.color} />
        <Text> {statusText}</Text>
      </Box>
    );
  }

  if (phase === 'talking') {
    return (
      <Box>
        <BrixTalking
          mood={mood}
          mode="typewriter"
          text={statusText}
          onDone={() => setPhase('idle')}
        />
      </Box>
    );
  }

  return (
    <Box>
      <BrixIdle mood={mood as Mood} color={colorForMood(mood)} />
      <Text> {statusText}</Text>
    </Box>
  );
}

function colorForMood(mood: Mood): string {
  switch (mood) {
    case 'happy':
    case 'success':
    case 'proud':
      return 'green';
    case 'error':
    case 'panic':
    case 'dead':
    case 'angry':
      return 'red';
    case 'sad':
    case 'tired':
    case 'sleep':
      return 'gray';
    case 'oops':
    case 'suspicious':
    case 'starry':
      return 'yellow';
    case 'love':
    case 'shy':
    case 'cheeky':
    case 'boop':
    case 'wink':
      return 'magenta';
    default:
      return 'cyan';
  }
}
