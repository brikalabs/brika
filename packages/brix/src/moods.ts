/**
 * Brix mood enum — the only API surface for tagging a line with a
 * tonal color. `Mood` drives the speech-bubble tint and is the token
 * the mood-script parser (`{:happy:}…`) accepts.
 *
 *   import type { Mood } from '@brika/brix';
 *   const m: Mood = 'thinking';
 *
 * The kaomoji-style face glyphs that used to live here are gone — the
 * stage-based mascot (`<BrixStage>` + `EmoteProvider`) renders Brix's
 * face as composed sprite layers instead.
 */

export type Mood =
  | 'default'
  | 'idle'
  | 'happy'
  | 'excited'
  | 'thinking'
  | 'focused'
  | 'curious'
  | 'sleep'
  | 'sad'
  | 'error'
  | 'dead'
  | 'panic'
  | 'angry'
  | 'suspicious'
  | 'love'
  | 'cool'
  | 'loading'
  | 'success'
  | 'wink'
  | 'shy'
  | 'proud'
  | 'tired'
  | 'oops'
  | 'woah'
  | 'boop'
  | 'cheeky'
  | 'starry';

/** All declared moods — used by the mood-script parser to validate tokens. */
export const ALL_MOODS: ReadonlyArray<Mood> = [
  'default',
  'idle',
  'happy',
  'excited',
  'thinking',
  'focused',
  'curious',
  'sleep',
  'sad',
  'error',
  'dead',
  'panic',
  'angry',
  'suspicious',
  'love',
  'cool',
  'loading',
  'success',
  'wink',
  'shy',
  'proud',
  'tired',
  'oops',
  'woah',
  'boop',
  'cheeky',
  'starry',
];
