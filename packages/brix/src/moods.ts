/**
 * Brix mood table — the single-source-of-truth for the mascot's face.
 *
 * A mood is a small kaomoji-style face that fits in a few cells. The
 * bracket variants ((), [], <>, {}) let callers swap delimiters without
 * us having to materialize a new face for every combination.
 *
 *   import { faceOf } from '@brika/brix';
 *   faceOf('thinking');                 //  (◔◡◔)
 *   faceOf('happy', 'square');          //  [^◡^]
 *   faceOf('sleep');                    //  (-◡-) zZ
 *
 * Faces are intentionally narrow (the *eyes* + *mouth* between the
 * delimiters); the bracket pair is added by `wrap()` so we can change
 * the delimiter without forking the body.
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
  | 'success';

export type Bracket = 'round' | 'square' | 'angle' | 'curly';

interface Face {
  /** Eyes + mouth between brackets — e.g. "◕◡◕". */
  readonly body: string;
  /** Optional suffix that sits outside the brackets — e.g. " zZ" for sleep. */
  readonly suffix?: string;
}

const FACES: Readonly<Record<Mood, Face>> = {
  default: { body: '◕◡◕' },
  idle: { body: '•◡•' },
  happy: { body: '^◡^' },
  excited: { body: '◕▿◕' },
  thinking: { body: '◔◡◔' },
  focused: { body: '•~•' },
  curious: { body: '⊙◡⊙' },
  sleep: { body: '-◡-', suffix: ' zZ' },
  sad: { body: '╥◡╥' },
  error: { body: '×◠×' },
  dead: { body: 'x_x' },
  panic: { body: '⊙▂⊙' },
  angry: { body: '•̀◠•́' },
  suspicious: { body: '¬◡¬' },
  love: { body: '♡◡♡' },
  cool: { body: '⌐◡◠' },
  loading: { body: '•▁•' },
  success: { body: '◕‿◕' },
};

const BRACKETS: Readonly<Record<Bracket, readonly [string, string]>> = {
  round: ['(', ')'],
  square: ['[', ']'],
  angle: ['<', '>'],
  curly: ['{', '}'],
};

/** Compose the full face glyph for a given mood and bracket style. */
export function faceOf(mood: Mood, bracket: Bracket = 'round'): string {
  const face = FACES[mood];
  const [open, close] = BRACKETS[bracket];
  return `${open}${face.body}${close}${face.suffix ?? ''}`;
}

/** All declared moods — useful for visual catalog tests / examples. */
export const ALL_MOODS: ReadonlyArray<Mood> = Object.keys(FACES) as Mood[];
