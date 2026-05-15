/**
 * `<BrixTalking text="…" mood="…" />` — Brix narrates a line one char
 * at a time, with a mouth that flaps locked to the reveal cursor.
 *
 *   <BrixTalking mood="happy" text="workflow deployed!" />
 *
 * Mood-script: the text accepts inline `{:mood:}` tokens that switch
 * Brix's face mid-sentence — perfect for narrating a sequence of
 * states in one line:
 *
 *   <BrixTalking text="{:thinking:}untangling blocks… {:happy:}done!" />
 *
 * Pacing comes from `expandReveal` — every line is pre-compiled into a
 * `RevealStep[]` stream where each step carries its own `pauseMs`. Word
 * boundaries, commas, and sentence-end breaths flow straight from the
 * stream. The mouth flaps once per cursor advance, so the lip motion
 * stays locked to actual character reveal and naturally holds during
 * the long breath after a `.` or `?`.
 *
 * Override pacing with the optional props (`charMs`, `wordPauseMs`,
 * `sentencePauseMs`, `clausePauseMs`). `onDone` fires when the last
 * character lands.
 */

import { Box, Text } from 'ink';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { ANIMATIONS } from './animations';
import { type Bracket, faceOf, type Mood } from './moods';
import { expandReveal, type PacingOptions, parseMoodScript } from './script';

const MIN_TICK_MS = 12;

export interface BrixTalkingProps extends PacingOptions {
  readonly text: string;
  readonly mood?: Mood;
  readonly bracket?: Bracket;
  /** Fired once when the last character lands. */
  readonly onDone?: () => void;
  /** Face accent color (text stays default). */
  readonly faceColor?: string;
}

export function BrixTalking({
  text,
  mood = 'default',
  bracket = 'round',
  charMs,
  wordPauseMs,
  sentencePauseMs,
  clausePauseMs,
  onDone,
  faceColor = 'cyan',
}: Readonly<BrixTalkingProps>): React.ReactElement {
  const stream = useMemo(
    () =>
      expandReveal(parseMoodScript(text, mood), {
        charMs,
        wordPauseMs,
        sentencePauseMs,
        clausePauseMs,
      }),
    [text, mood, charMs, wordPauseMs, sentencePauseMs, clausePauseMs]
  );

  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    if (cursor >= stream.length) {
      onDone?.();
      return;
    }
    const step = stream[cursor];
    const delay = Math.max(MIN_TICK_MS, step?.pauseMs ?? MIN_TICK_MS);
    const t = setTimeout(() => setCursor((n) => n + 1), delay);
    return () => clearTimeout(t);
  }, [cursor, stream, onDone]);

  const visible = stream
    .slice(0, cursor)
    .map((s) => s.token)
    .join('');
  const isSpeaking = cursor < stream.length;

  // Active mood = mood of the most-recently-revealed token (or the prop
  // default before any text has landed).
  const activeMood: Mood = cursor > 0 ? (stream[cursor - 1]?.mood ?? mood) : mood;

  // Mouth flaps once per cursor advance — naturally holds during long
  // breaths because the cursor stops moving.
  const mouthFrames = ANIMATIONS.talking.frames;
  const face = isSpeaking
    ? (mouthFrames[cursor % mouthFrames.length] ?? faceOf(activeMood, bracket))
    : faceOf(activeMood, bracket);

  return (
    <Box>
      <Text color={faceColor}>{face}</Text>
      <Text> {visible}</Text>
    </Box>
  );
}
