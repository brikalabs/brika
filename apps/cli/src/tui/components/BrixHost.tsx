/**
 * The one Brix on screen. Lives in the shell footer.
 *
 * Layout: a fixed-width face slot on the left so swapping glyphs
 * never shifts the bubble; a rounded speech bubble on the right that
 * fills via typewriter when Brix is talking. The bubble border is
 * always painted so the chrome height is stable — no jitter.
 *
 *           ╭───────────────────────────────╮
 *   (•◡•) ◂│ hub is humming along.         │
 *           ╰───────────────────────────────╯
 *
 * The `◂` tail sits flush against the bubble's left border so the
 * whole thing reads as a speech bubble — Brix's face is on the left,
 * the bubble points back at him.
 *
 * Triggers (highest priority first):
 *   1. hub.state change → one-shot reaction emote (wave / oops /
 *      sleep) for ~1.4s, paired with a quick line in the bubble.
 *   2. cli.statusText change → typewriter the new line in the bubble.
 *   3. idle auto-talk timer → every ~22s, pick a contextual line
 *      based on hub state + plugin/workflow counts and say it.
 *
 * Views never render their own Brix; they publish `mood` and
 * `statusText` through <CliProvider>.
 */

import { ANIMATIONS, type AnimationKind, BrixIdle, faceOf, type Mood } from '@brika/brix';
import { Box, Text } from 'ink';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useCli } from '../useCli';

type HubState = 'running' | 'stale' | 'stopped' | 'unknown';

interface Reaction {
  readonly kind: AnimationKind;
  readonly color: string;
  readonly line: string;
}

const REACTIONS: Readonly<Record<HubState, Reaction | null>> = {
  running: { kind: 'wave', color: 'green', line: 'hub is awake — hi!' },
  stale: { kind: 'oops', color: 'yellow', line: 'that pid looks stale.' },
  stopped: { kind: 'sleep', color: 'gray', line: 'hub is asleep — press s.' },
  unknown: null,
};

/**
 * Face slot width — tight enough that the tail-glyph attaches to the
 * bubble visually, wide enough for the longest animation frame the
 * host can show. Sleep's final `(-◡-) zZz` is the widest at 9 cells;
 * we right-align so shorter frames hug the tail.
 */
const FACE_SLOT = 9;
/** Bubble width — wide enough for most lines, fixed so layout is stable. */
const BUBBLE_WIDTH = 56;

const TYPE_MS = 26;
const REACTION_HOLD_MS = 1400;
const SPEECH_HOLD_MS = 1800;
const AUTO_TALK_MIN_MS = 18_000;
const AUTO_TALK_MAX_MS = 32_000;

type Phase = 'idle' | 'speaking' | 'reacting';

interface SpeechState {
  readonly text: string;
  /** Optional reaction animation in the face slot while speaking. */
  readonly reaction?: AnimationKind;
  /** Color tint for the face during this speech. */
  readonly color?: string;
}

export function BrixHost(): React.ReactElement {
  const cli = useCli();
  const { hub, mood, statusText } = cli;

  const [phase, setPhase] = useState<Phase>('idle');
  const [speech, setSpeech] = useState<SpeechState>({ text: '' });
  const [revealed, setRevealed] = useState('');
  const [mouthFrame, setMouthFrame] = useState(0);
  const [reactionFrame, setReactionFrame] = useState(0);

  const lastHub = useRef<HubState>(hub.state);
  const lastText = useRef<string>(statusText);

  function speak(next: SpeechState): void {
    setSpeech(next);
    setRevealed('');
    setMouthFrame(0);
    setReactionFrame(0);
    setPhase(next.reaction ? 'reacting' : 'speaking');
  }

  // Trigger #1 — hub state change → reaction emote + line.
  useEffect(() => {
    if (lastHub.current === hub.state) {
      return;
    }
    lastHub.current = hub.state;
    const r = REACTIONS[hub.state];
    if (!r) {
      return;
    }
    speak({ text: r.line, reaction: r.kind, color: r.color });
  }, [hub.state]);

  // Trigger #2 — view published a new statusText.
  useEffect(() => {
    if (lastText.current === statusText) {
      return;
    }
    lastText.current = statusText;
    if (statusText.trim().length === 0) {
      return;
    }
    speak({ text: statusText, color: colorForMood(mood) });
  }, [statusText, mood]);

  // Trigger #3 — idle auto-talk. Only fires when nothing else is.
  const idlePool = useIdleLines(cli);
  useEffect(() => {
    if (phase !== 'idle') {
      return;
    }
    const delay =
      AUTO_TALK_MIN_MS + Math.floor(Math.random() * (AUTO_TALK_MAX_MS - AUTO_TALK_MIN_MS));
    const t = setTimeout(() => {
      const line = idlePool[Math.floor(Math.random() * idlePool.length)];
      if (line) {
        speak({ text: line, color: colorForMood(mood) });
      }
    }, delay);
    return () => clearTimeout(t);
  }, [phase, idlePool, mood]);

  // Typewriter reveal while speaking or reacting.
  useEffect(() => {
    if (phase === 'idle') {
      return;
    }
    if (revealed.length >= speech.text.length) {
      const hold = phase === 'reacting' ? REACTION_HOLD_MS : SPEECH_HOLD_MS;
      const t = setTimeout(() => setPhase('idle'), hold);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setRevealed(speech.text.slice(0, revealed.length + 1));
    }, TYPE_MS);
    return () => clearTimeout(t);
  }, [phase, revealed, speech.text]);

  // Mouth animation while a line is still arriving.
  const isTyping = phase !== 'idle' && revealed.length < speech.text.length;
  useEffect(() => {
    if (!isTyping) {
      return;
    }
    const t = setInterval(
      () => setMouthFrame((f) => (f + 1) % ANIMATIONS.talking.frames.length),
      140
    );
    return () => clearInterval(t);
  }, [isTyping]);

  // Reaction-animation walk.
  useEffect(() => {
    if (phase !== 'reacting' || !speech.reaction) {
      setReactionFrame(0);
      return;
    }
    const anim = ANIMATIONS[speech.reaction];
    const t = setInterval(
      () => setReactionFrame((f) => (f + 1) % anim.frames.length),
      anim.intervalMs
    );
    return () => clearInterval(t);
  }, [phase, speech.reaction]);

  // Pick the face glyph + color for the current frame.
  let faceGlyph = '';
  let faceColor = colorForMood(mood);
  if (phase === 'reacting' && speech.reaction) {
    const frames = ANIMATIONS[speech.reaction].frames;
    faceGlyph = frames[reactionFrame] ?? frames[frames.length - 1] ?? faceOf(mood);
    faceColor = speech.color ?? faceColor;
  } else if (phase === 'speaking') {
    faceGlyph = ANIMATIONS.talking.frames[mouthFrame] ?? faceOf(mood);
    faceColor = speech.color ?? faceColor;
  }

  const bubbleText = phase === 'idle' ? statusText : revealed;
  const bubbleDim = phase === 'idle';

  return (
    <Box alignItems="center">
      <Box width={FACE_SLOT} height={3} alignItems="center" justifyContent="flex-end">
        {phase === 'idle' ? (
          <BrixIdle mood={mood} color={faceColor} />
        ) : (
          <Text color={faceColor}>{faceGlyph}</Text>
        )}
      </Box>
      <Box height={3} alignItems="center">
        <Text color="gray">◂</Text>
      </Box>
      <Box borderStyle="round" borderColor="gray" paddingX={1} width={BUBBLE_WIDTH}>
        <Text dimColor={bubbleDim}>{bubbleText || ' '}</Text>
      </Box>
    </Box>
  );
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
 * Pool of contextual lines Brix can drop when idle. Recomputed
 * whenever the underlying state changes, so a fresh deploy / new
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
