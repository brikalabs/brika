/**
 * The one Brix on screen — lives in the shell footer.
 *
 *           ╭───────────────────────────────╮
 *  (•◡•) ◀┤ hub is humming along.          │
 *           ╰───────────────────────────────╯
 *
 * Layout: a fixed-width face slot on the left so swapping glyphs
 * never shifts the bubble; a manually-drawn `<Bubble>` on the right
 * whose tail (`◀┤`) attaches to the bubble's border via a T-junction
 * so the whole thing reads as a real comic-style speech bubble.
 *
 * Behavior is driven by a pure reducer (`brixHostReducer.ts`) plus
 * four thin effects that translate timer/state changes into events:
 *
 *   1. hub.state change  → dispatch HUB    (wave / oops / sleep reaction)
 *   2. statusText change → dispatch STATUS (typewriter the new line)
 *   3. idle auto-talk    → dispatch IDLE_LINE (contextual one-liner)
 *   4. typewriter tick   → dispatch REVEAL
 *   5. hold timer        → dispatch HOLD_OVER (back to idle)
 *
 * Each face state is its own small component (`<IdleFace>`,
 * `<TalkingFace>`, `<ReactingFace>`) so the per-state `useFrameSeq`
 * lifecycle starts fresh on each phase change.
 */

import {
  ANIMATIONS,
  type AnimationKind,
  BrixIdle,
  Bubble,
  type Mood,
  useFrameSeq,
} from '@brika/brix';
import { Box, Text } from 'ink';
import type React from 'react';
import { useEffect, useMemo, useReducer, useRef } from 'react';
import { useCli } from '../useCli';
import { INITIAL_STATE, isFinished, type Reaction, reduce } from './brixHostReducer';

type HubState = 'running' | 'stale' | 'stopped' | 'unknown';

const REACTIONS: Readonly<Record<HubState, Reaction | null>> = {
  running: { kind: 'wave', color: 'green', line: 'hub is awake — hi!' },
  stale: { kind: 'oops', color: 'yellow', line: 'that pid looks stale.' },
  stopped: { kind: 'sleep', color: 'gray', line: 'hub is asleep — press s.' },
  unknown: null,
};

/** Face slot width — fits the widest reaction frame (sleep's `(-◡-) zZz`). */
const FACE_SLOT = 9;
/** Total bubble width including the tail glyph column. */
const BUBBLE_WIDTH = 56;

const TYPE_MS = 26;
const REACTION_HOLD_MS = 1400;
const SPEECH_HOLD_MS = 1800;
const AUTO_TALK_MIN_MS = 18_000;
const AUTO_TALK_MAX_MS = 32_000;

export function BrixHost(): React.ReactElement {
  const cli = useCli();
  const { hub, mood, statusText } = cli;
  const [state, dispatch] = useReducer(reduce, INITIAL_STATE);

  // ── Effect 1: hub state changes ──────────────────────────────────
  const lastHub = useRef<HubState>(hub.state);
  useEffect(() => {
    if (lastHub.current === hub.state) {
      return;
    }
    lastHub.current = hub.state;
    dispatch({ type: 'HUB', reaction: REACTIONS[hub.state] });
  }, [hub.state]);

  // ── Effect 2: statusText changes ─────────────────────────────────
  const lastText = useRef<string>(statusText);
  useEffect(() => {
    if (lastText.current === statusText) {
      return;
    }
    lastText.current = statusText;
    dispatch({ type: 'STATUS', text: statusText, tint: colorForMood(mood) });
  }, [statusText, mood]);

  // ── Effect 3: idle auto-talk ─────────────────────────────────────
  const idleLines = useIdleLines(cli);
  useEffect(() => {
    if (state.phase !== 'idle') {
      return;
    }
    const delay =
      AUTO_TALK_MIN_MS + Math.floor(Math.random() * (AUTO_TALK_MAX_MS - AUTO_TALK_MIN_MS));
    const t = setTimeout(() => {
      const line = idleLines[Math.floor(Math.random() * idleLines.length)];
      if (line) {
        dispatch({ type: 'IDLE_LINE', text: line, tint: colorForMood(mood) });
      }
    }, delay);
    return () => clearTimeout(t);
  }, [state.phase, idleLines, mood]);

  // ── Effect 4: typewriter reveal ──────────────────────────────────
  useEffect(() => {
    if (state.phase === 'idle' || state.revealed >= state.text.length) {
      return;
    }
    const t = setTimeout(() => dispatch({ type: 'REVEAL' }), TYPE_MS);
    return () => clearTimeout(t);
  }, [state.phase, state.revealed, state.text.length]);

  // ── Effect 5: hold-then-back-to-idle ─────────────────────────────
  const finished = isFinished(state);
  useEffect(() => {
    if (!finished) {
      return;
    }
    const hold = state.phase === 'reacting' ? REACTION_HOLD_MS : SPEECH_HOLD_MS;
    const t = setTimeout(() => dispatch({ type: 'HOLD_OVER' }), hold);
    return () => clearTimeout(t);
  }, [finished, state.phase]);

  const bubbleText = state.phase === 'idle' ? statusText : state.text.slice(0, state.revealed);
  const bubbleDim = state.phase === 'idle';

  return (
    <Box alignItems="center">
      <Box width={FACE_SLOT} height={3} alignItems="center" justifyContent="flex-end">
        <FaceSlot phase={state.phase} reaction={state.reaction} tint={state.tint} mood={mood} />
      </Box>
      <Bubble
        text={bubbleText}
        width={BUBBLE_WIDTH}
        variant="speech"
        tail="left"
        borderColor="gray"
        dim={bubbleDim}
      />
    </Box>
  );
}

interface FaceSlotProps {
  readonly phase: 'idle' | 'speaking' | 'reacting';
  readonly reaction: AnimationKind | null;
  readonly tint: string;
  readonly mood: Mood;
}

/**
 * Picks the right face component for the current phase. The
 * conditional render naturally unmounts the previous face on phase
 * change, so each `useFrameSeq` lifecycle inside starts at frame 0
 * — no reset bookkeeping needed in the parent.
 */
function FaceSlot({ phase, reaction, tint, mood }: Readonly<FaceSlotProps>): React.ReactElement {
  if (phase === 'reacting' && reaction) {
    return <ReactingFace kind={reaction} color={tint} />;
  }
  if (phase === 'speaking') {
    return <TalkingFace color={tint} />;
  }
  return <BrixIdle mood={mood} color={tint} />;
}

function TalkingFace({ color }: Readonly<{ color: string }>): React.ReactElement {
  const { frame } = useFrameSeq(ANIMATIONS.talking);
  return <Text color={color}>{frame}</Text>;
}

function ReactingFace({
  kind,
  color,
}: Readonly<{ kind: AnimationKind; color: string }>): React.ReactElement {
  // Reactions are typically one-shots already (loop: false in the
  // animation definition). For looping ones (wave / sleep), the
  // host's HOLD_OVER timer eventually returns us to idle anyway.
  const { frame } = useFrameSeq(ANIMATIONS[kind]);
  return <Text color={color}>{frame}</Text>;
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

/**
 * The pool of contextual lines Brix can drop when idle. Recomputed
 * whenever the underlying state changes so a fresh deploy / new
 * plugin shows up in the rotation immediately.
 */
function useIdleLines(cli: ReturnType<typeof useCli>): ReadonlyArray<string> {
  return useMemo(() => {
    const lines: string[] = [];
    if (cli.hub.state === 'running') {
      lines.push('hub is humming along.');
      lines.push('all systems quiet.');
    }
    if (cli.hub.state === 'stopped') {
      lines.push('hub is sleeping — press s to wake it.');
      lines.push('nothing to watch — yet.');
    }
    if (cli.hub.state === 'stale') {
      lines.push('that pid looks stale — try r.');
    }
    if (cli.plugins.length === 0) {
      lines.push('no plugins yet — press p to add one.');
    } else if (cli.plugins.length === 1) {
      lines.push('one plugin on board.');
    } else {
      lines.push(`${cli.plugins.length} plugins on board.`);
    }
    if (cli.workflows.length === 0) {
      lines.push('no workflows yet — try w.');
    } else if (cli.workflows.length === 1) {
      lines.push('one workflow wired up.');
    } else {
      lines.push(`${cli.workflows.length} workflows wired up.`);
    }
    lines.push("i'm just chilling.");
    lines.push('press ? for help.');
    lines.push('tiny blocks. big automation.');
    return lines;
  }, [cli.hub.state, cli.plugins.length, cli.workflows.length]);
}
