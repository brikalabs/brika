/**
 * `<BrixHeader>` — top region of the brika TUI: Brix on the left, a
 * speech bubble immediately to his right.
 *
 *   ╭───────────────╮       ╭───────────────────────────╮
 *   │  (the stage)  │    ◀──┤  hub is humming along.    │
 *   ╰───────────────╯       ╰───────────────────────────╯
 *
 * Speech pacing reuses the same pure reducer the old `<BrixHost>`
 * used (`brixHostReducer`). Hub-state changes drive both the speech
 * line and a body emote so Brix waves/oops/sleeps as state changes.
 *
 * The window-chrome title and hub-status stamp live in `<AppShell>`
 * — this component only owns the Brix + bubble pair.
 */

import {
  BrixStage,
  Bubble,
  type EmoteName,
  EmoteProvider,
  type Mood,
  type PacingOptions,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  useEmote,
} from '@brika/brix';
import { useClickable, useTerminalSize } from '@brika/tui';
import { Box, type DOMElement } from 'ink';
import type React from 'react';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { useCli } from '../hooks/useCli';
import { INITIAL_STATE, isFinished, type Reaction, reduce, visibleText } from './brixHostReducer';

type HubState = 'running' | 'stale' | 'stopped' | 'unknown';

const REACTIONS: Readonly<Record<HubState, Reaction | null>> = {
  running: { kind: 'wave', color: 'green', line: 'hub is awake — hi!' },
  stale: { kind: 'oops', color: 'yellow', line: 'that pid looks stale.' },
  stopped: { kind: 'sleep', color: 'gray', line: 'hub is asleep — Ctrl+S to wake.' },
  unknown: null,
};

const HUB_EMOTES: Readonly<Record<HubState, EmoteName | null>> = {
  running: 'wave',
  stale: 'oops',
  stopped: 'sleep',
  unknown: null,
};

const PACING: PacingOptions = {
  charMs: 26,
  wordPauseMs: 110,
  clausePauseMs: 220,
  sentencePauseMs: 420,
};

const MIN_TICK_MS = 12;

const REACTION_HOLD_MS = 1400;
const SPEECH_HOLD_MS = 1800;
const AUTO_TALK_MIN_MS = 18_000;
const AUTO_TALK_MAX_MS = 32_000;

/** Chrome we leave around the bubble: AppShell border (2) + body
 *  paddingX (2) + the stage column + a 1-column gap. */
const HEADER_CHROME = 2 + 2 + STAGE_WIDTH + 1;
const BUBBLE_MIN_WIDTH = 28;
const BUBBLE_MAX_WIDTH = 96;

export function BrixHeader(): React.ReactElement {
  return (
    <EmoteProvider>
      <BrixHeaderInner />
    </EmoteProvider>
  );
}

function BrixHeaderInner(): React.ReactElement {
  const cli = useCli();
  const { hub, mood, statusText, activityEmote } = cli;
  const [state, dispatch] = useReducer(reduce, INITIAL_STATE);
  const { columns } = useTerminalSize();
  const bubbleWidth = Math.min(
    BUBBLE_MAX_WIDTH,
    Math.max(BUBBLE_MIN_WIDTH, columns - HEADER_CHROME)
  );

  const api = useEmote();
  const lastHubForEmote = useRef<HubState | null>(null);
  useEffect(() => {
    if (lastHubForEmote.current === hub.state) {
      return;
    }
    lastHubForEmote.current = hub.state;
    const name = HUB_EMOTES[hub.state];
    if (name) {
      api.play(name);
    }
  }, [hub.state, api]);

  // Activity rotation: CliProvider flips `activityEmote` every 10–18s
  // while the hub is up. Each change swaps Brix's animation to match
  // the "-ing" caption (snacking → nom, pooping → crouch, etc.).
  const lastActivityEmote = useRef<EmoteName | null>(null);
  useEffect(() => {
    if (activityEmote === null || activityEmote === lastActivityEmote.current) {
      lastActivityEmote.current = activityEmote;
      return;
    }
    lastActivityEmote.current = activityEmote;
    api.play(activityEmote);
  }, [activityEmote, api]);

  const lastHub = useRef<HubState>(hub.state);
  useEffect(() => {
    if (lastHub.current === hub.state) {
      return;
    }
    lastHub.current = hub.state;
    dispatch({ type: 'HUB', reaction: REACTIONS[hub.state], pacing: PACING });
  }, [hub.state]);

  const lastText = useRef<string>(statusText);
  useEffect(() => {
    if (lastText.current === statusText) {
      return;
    }
    lastText.current = statusText;
    dispatch({ type: 'STATUS', text: statusText, tint: colorForMood(mood), pacing: PACING });
  }, [statusText, mood]);

  const idleLines = useIdleLines(cli);
  useEffect(() => {
    if (state.phase !== 'idle') {
      return;
    }
    const delay = AUTO_TALK_MIN_MS + randomInt(AUTO_TALK_MAX_MS - AUTO_TALK_MIN_MS);
    const t = setTimeout(() => {
      const line = idleLines[randomInt(idleLines.length)];
      if (line) {
        dispatch({
          type: 'IDLE_LINE',
          text: line,
          tint: colorForMood(mood),
          pacing: PACING,
        });
      }
    }, delay);
    return () => clearTimeout(t);
  }, [state.phase, idleLines, mood]);

  useEffect(() => {
    if (state.phase === 'idle' || state.cursor >= state.stream.length) {
      return;
    }
    const step = state.stream[state.cursor];
    const delay = Math.max(MIN_TICK_MS, step?.pauseMs ?? PACING.charMs ?? MIN_TICK_MS);
    const t = setTimeout(() => dispatch({ type: 'REVEAL' }), delay);
    return () => clearTimeout(t);
  }, [state.phase, state.cursor, state.stream]);

  const finished = isFinished(state);
  useEffect(() => {
    if (!finished) {
      return;
    }
    const hold = state.phase === 'reacting' ? REACTION_HOLD_MS : SPEECH_HOLD_MS;
    const t = setTimeout(() => dispatch({ type: 'HOLD_OVER' }), hold);
    return () => clearTimeout(t);
  }, [finished, state.phase]);

  const bubbleText = state.phase === 'idle' ? statusText : visibleText(state);
  const bubbleDim = state.phase === 'idle';
  const bubbleTint = state.phase === 'idle' ? 'gray' : state.tint;
  // Mouth flaps while the typewriter is actively revealing characters
  // — not during the post-reveal hold and not in idle.
  const speaking = state.phase !== 'idle' && state.cursor < state.stream.length;

  // Clicking on Brix pokes him — plays `oops`, types an "ouch!" into
  // the bubble. Cheap easter egg; no nav side-effects.
  const brixRef = useRef<DOMElement>(null);
  const poke = useCallback(() => {
    api.play('oops');
    dispatch({
      type: 'STATUS',
      text: '{:oops:}ouch!',
      tint: 'yellow',
      pacing: PACING,
    });
  }, [api]);
  useClickable(brixRef, poke);

  return (
    <Box>
      <Box ref={brixRef} width={STAGE_WIDTH} height={STAGE_HEIGHT}>
        <BrixStage
          bubble={false}
          floor={false}
          width={STAGE_WIDTH}
          height={STAGE_HEIGHT}
          speaking={speaking}
        />
      </Box>
      <Box height={STAGE_HEIGHT} marginLeft={1} alignItems="center">
        <Bubble
          text={bubbleText}
          width={bubbleWidth}
          variant="speech"
          tail="left"
          borderColor={bubbleTint}
          dim={bubbleDim}
        />
      </Box>
    </Box>
  );
}

function randomInt(max: number): number {
  if (max <= 0) {
    return 0;
  }
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] ?? 0) % max;
}

function colorForMood(m: Mood): string {
  switch (m) {
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

const IDLE_LINES_BY_STATE: Readonly<Record<HubState, ReadonlyArray<string>>> = {
  running: ['hub is humming along.', 'all systems quiet.'],
  stopped: ['hub is sleeping — Ctrl+S to wake it.', 'nothing to watch — yet.'],
  stale: ['that pid looks stale — try r.'],
  unknown: [],
};
const COMMON_IDLE_LINES: ReadonlyArray<string> = [
  "i'm just chilling.",
  'press ? for help.',
  'tiny blocks. big automation.',
];

function useIdleLines(cli: ReturnType<typeof useCli>): ReadonlyArray<string> {
  return useMemo(
    () => [...IDLE_LINES_BY_STATE[cli.hub.state], ...COMMON_IDLE_LINES],
    [cli.hub.state]
  );
}
