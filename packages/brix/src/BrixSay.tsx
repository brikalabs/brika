/**
 * `<BrixSay text="…" />` — Brix says something. Speech bubble in a
 * rounded box with the mascot face hanging just outside it. Default
 * orientation is `top` (bubble above the face). Use `orient="above"`
 * for the rare case where the bubble belongs above Brix.
 *
 *   ╭──────────────────────╮
 *   │ workflow deployed!   │
 *   ╰──────────────────────╯
 *          (^◡^)
 *
 * Pass `animate` to make the bubble fill in one word (or one char)
 * at a time while Brix's mouth moves. The text supports the
 * mood-script DSL — `{:mood:}` tokens swap Brix's mood mid-line:
 *
 *   <BrixSay
 *     animate
 *     text="{:thinking:}untangling… {:happy:}done!"
 *   />
 */

import { Box, Text } from 'ink';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { ANIMATIONS } from './animations';
import { Brix, type BrixProps } from './Brix';
import type { TalkMode } from './BrixTalking';
import { faceOf, type Mood } from './moods';
import { expandReveal, parseMoodScript } from './script';

const DEFAULT_WORD_MS = 110;
const DEFAULT_CHAR_MS = 35;
const DEFAULT_MOUTH_MS = 140;
const DEFAULT_TW_CHAR_MS = 28;
const DEFAULT_TW_WORD_PAUSE_MS = 180;

export interface BrixSayProps {
  readonly text: string;
  readonly mood?: Mood;
  readonly bracket?: BrixProps['bracket'];
  /** Where the speech bubble sits relative to Brix. Default `top`. */
  readonly orient?: 'top' | 'above';
  readonly color?: string;
  /**
   * Animate the text. `true` means `word`. `'char'` is strict
   * typewriter, `'typewriter'` is char-by-char with pauses at word
   * boundaries. See {@link TalkMode}.
   */
  readonly animate?: TalkMode | boolean;
  /** Per-step reveal delay for word/char modes. */
  readonly revealMs?: number;
  /** Typewriter mode: per-char delay inside a word. Default 28ms. */
  readonly charMs?: number;
  /** Typewriter mode: extra delay at each word boundary. Default 180ms. */
  readonly wordPauseMs?: number;
  /** Mouth animation tick while the line is still arriving. */
  readonly mouthIntervalMs?: number;
  /** Fired once the last word lands. */
  readonly onDone?: () => void;
}

function pickMode(animate: TalkMode | boolean | undefined): TalkMode {
  if (animate === 'char') {
    return 'char';
  }
  if (animate === 'typewriter') {
    return 'typewriter';
  }
  return 'word';
}

function defaultStepFor(mode: TalkMode, charMs: number): number {
  if (mode === 'char') {
    return DEFAULT_CHAR_MS;
  }
  if (mode === 'typewriter') {
    return charMs;
  }
  return DEFAULT_WORD_MS;
}

export function BrixSay({
  text,
  mood = 'default',
  bracket = 'round',
  orient = 'top',
  color,
  animate,
  revealMs,
  charMs = DEFAULT_TW_CHAR_MS,
  wordPauseMs = DEFAULT_TW_WORD_PAUSE_MS,
  mouthIntervalMs = DEFAULT_MOUTH_MS,
  onDone,
}: Readonly<BrixSayProps>): React.ReactElement {
  const mode = pickMode(animate);
  const enabled = Boolean(animate);
  const stream = useMemo(
    () => expandReveal(parseMoodScript(text, mood), mode, { charMs, wordPauseMs }),
    [text, mood, mode, charMs, wordPauseMs]
  );
  const fallbackStep = revealMs ?? defaultStepFor(mode, charMs);

  const [shown, setShown] = useState(enabled ? 0 : stream.length);
  const [mouthFrame, setMouthFrame] = useState(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (shown >= stream.length) {
      onDone?.();
      return;
    }
    const next = stream[shown];
    const delay = next?.pauseMs ?? fallbackStep;
    const t = setTimeout(() => setShown((n) => n + 1), delay);
    return () => clearTimeout(t);
  }, [enabled, shown, stream, fallbackStep, onDone]);

  const isSpeaking = enabled && shown < stream.length;
  useEffect(() => {
    if (!isSpeaking) {
      return;
    }
    const t = setInterval(
      () => setMouthFrame((f) => (f + 1) % ANIMATIONS.talking.frames.length),
      mouthIntervalMs
    );
    return () => clearInterval(t);
  }, [isSpeaking, mouthIntervalMs]);

  // Strip script tokens for the non-animated path; render full text immediately.
  const fullText = useMemo(
    () =>
      parseMoodScript(text, mood)
        .map((seg) => seg.text)
        .join(''),
    [text, mood]
  );
  const visible = enabled
    ? stream
        .slice(0, shown)
        .map((s) => s.token + s.trailing)
        .join('')
    : fullText;
  const activeMood: Mood = shown > 0 ? (stream[shown - 1]?.mood ?? mood) : mood;
  const faceGlyph = isSpeaking
    ? (ANIMATIONS.talking.frames[mouthFrame] ?? faceOf(activeMood, bracket))
    : faceOf(activeMood, bracket);

  const bubble = (
    <Box borderStyle="round" borderColor="gray" paddingX={1}>
      <Text>{visible || ' '}</Text>
    </Box>
  );
  const face = (
    <Box paddingLeft={6}>
      {isSpeaking ? (
        <Text color={color}>{faceGlyph}</Text>
      ) : (
        <Brix mood={activeMood} bracket={bracket} color={color} />
      )}
    </Box>
  );
  return (
    <Box flexDirection="column">
      {orient === 'top' ? bubble : face}
      {orient === 'top' ? face : bubble}
    </Box>
  );
}
