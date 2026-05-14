/**
 * `<BrixTalking text="…" mood="…" />` — Brix says something one word
 * at a time while his mouth animates. Stops moving once every word
 * has landed.
 *
 *   <BrixTalking mood="happy" text="workflow deployed!" />
 *
 * Mood-script: the text accepts inline `{:mood:}` tokens that switch
 * Brix's face mid-sentence — perfect for narrating a sequence of
 * states in one line:
 *
 *   <BrixTalking text="{:thinking:}untangling blocks… {:happy:}done!" />
 *
 * The active mood follows whichever segment of text is on screen, so
 * the face changes the moment the new section starts revealing.
 *
 * Reveal pacing is per-word (default 110ms), so longer copy reads at
 * the same cadence regardless of length. Mouth frames swap every
 * `mouthIntervalMs` (default 140ms) while text is still arriving;
 * once the message is complete, Brix snaps to the final mood face
 * and stops moving.
 *
 * Use `mode="char"` for a tighter typewriter feel (one cell at a time);
 * default `mode="word"` lands a whole token per tick.
 */

import { Box, Text } from 'ink';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { ANIMATIONS } from './animations';
import { type Bracket, faceOf, type Mood } from './moods';
import { expandReveal, parseMoodScript } from './script';

const DEFAULT_WORD_MS = 110;
const DEFAULT_CHAR_MS = 35;
const DEFAULT_MOUTH_MS = 140;
const DEFAULT_TW_CHAR_MS = 28;
const DEFAULT_TW_WORD_PAUSE_MS = 180;

/**
 * - `word` — one whole word per tick (default; reads like normal copy).
 * - `char` — strict typewriter, one cell per tick at uniform pace.
 * - `typewriter` — char-by-char but FAST inside a word, brief pause at
 *   every word boundary. Feels like someone actually typing.
 */
export type TalkMode = 'word' | 'char' | 'typewriter';

function defaultStepFor(mode: TalkMode, charMs: number): number {
  if (mode === 'char') {
    return DEFAULT_CHAR_MS;
  }
  if (mode === 'typewriter') {
    return charMs;
  }
  return DEFAULT_WORD_MS;
}

export interface BrixTalkingProps {
  readonly text: string;
  readonly mood?: Mood;
  readonly bracket?: Bracket;
  /** Reveal mode — see {@link TalkMode}. Default `word`. */
  readonly mode?: TalkMode;
  /** Override the per-step reveal delay (word + char modes only). */
  readonly revealMs?: number;
  /** Typewriter mode: per-char delay inside a word. Default 28ms. */
  readonly charMs?: number;
  /** Typewriter mode: extra delay at each word boundary. Default 180ms. */
  readonly wordPauseMs?: number;
  /** Override the mouth-animation tick. */
  readonly mouthIntervalMs?: number;
  /** Fired once when the last word lands. */
  readonly onDone?: () => void;
  /** Face accent color (text stays default). */
  readonly faceColor?: string;
}

export function BrixTalking({
  text,
  mood = 'default',
  bracket = 'round',
  mode = 'word',
  revealMs,
  charMs = DEFAULT_TW_CHAR_MS,
  wordPauseMs = DEFAULT_TW_WORD_PAUSE_MS,
  mouthIntervalMs = DEFAULT_MOUTH_MS,
  onDone,
  faceColor = 'cyan',
}: Readonly<BrixTalkingProps>): React.ReactElement {
  const stream = useMemo(
    () => expandReveal(parseMoodScript(text, mood), mode, { charMs, wordPauseMs }),
    [text, mood, mode, charMs, wordPauseMs]
  );
  const fallbackStep = revealMs ?? defaultStepFor(mode, charMs);

  const [shown, setShown] = useState(0);
  const [mouthFrame, setMouthFrame] = useState(0);

  useEffect(() => {
    if (shown >= stream.length) {
      onDone?.();
      return;
    }
    const next = stream[shown];
    const delay = next?.pauseMs ?? fallbackStep;
    const t = setTimeout(() => setShown((n) => n + 1), delay);
    return () => clearTimeout(t);
  }, [shown, stream, fallbackStep, onDone]);

  const isSpeaking = shown < stream.length;
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

  const visible = stream
    .slice(0, shown)
    .map((s) => s.token + s.trailing)
    .join('');

  // Active mood: the mood of the most-recently-revealed token, or
  // the prop default before any text has landed.
  const activeMood: Mood = shown > 0 ? (stream[shown - 1]?.mood ?? mood) : mood;

  const face = isSpeaking
    ? (ANIMATIONS.talking.frames[mouthFrame] ?? faceOf(activeMood, bracket))
    : faceOf(activeMood, bracket);

  return (
    <Box>
      <Text color={faceColor}>{face}</Text>
      <Text> {visible}</Text>
    </Box>
  );
}
