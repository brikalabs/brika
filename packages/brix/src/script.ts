/**
 * Mood-script — a tiny inline DSL for Brix lines that switch moods
 * mid-sentence. Authors write a single string with `{:mood:}` tokens
 * sprinkled in:
 *
 *   {:thinking:}untangling blocks…{:happy:}done! workflow deployed
 *
 * Tokens swap the mood for everything that follows, up to the next
 * token or end-of-string. The parser returns a flat token stream
 * tagged with the active mood. The talking host walks the stream and
 * flips the face whenever a new mood-segment lands.
 *
 * Unknown mood names are passed through as literal text (so authors
 * notice typos in the rendered output rather than silently losing a
 * face change).
 */

import { ALL_MOODS, type Mood } from './moods';

export interface MoodToken {
  /** Mood active for this chunk of text. */
  readonly mood: Mood;
  /** Plain text — never empty. */
  readonly text: string;
}

const TOKEN_RE = /\{:([a-z]+):\}/g;
const KNOWN_MOODS: ReadonlySet<string> = new Set(ALL_MOODS);

function isMood(candidate: string): candidate is Mood {
  return KNOWN_MOODS.has(candidate);
}

/**
 * Split a mood-script string into ordered `(mood, text)` chunks. When
 * no tokens are present (or `defaultMood` matches throughout), returns
 * a single chunk covering the whole string.
 */
export function parseMoodScript(input: string, defaultMood: Mood = 'default'): MoodToken[] {
  if (input.length === 0) {
    return [];
  }

  const out: MoodToken[] = [];
  let cursor = 0;
  let active: Mood = defaultMood;

  TOKEN_RE.lastIndex = 0;
  for (const match of input.matchAll(TOKEN_RE)) {
    const idx = match.index ?? 0;
    if (idx > cursor) {
      out.push({ mood: active, text: input.slice(cursor, idx) });
    }
    const candidate = match[1];
    if (candidate && isMood(candidate)) {
      active = candidate;
    } else {
      // Preserve unknown tokens as literal text so the typo is visible.
      out.push({ mood: active, text: match[0] });
    }
    cursor = idx + match[0].length;
  }
  if (cursor < input.length) {
    out.push({ mood: active, text: input.slice(cursor) });
  }
  return out.filter((seg) => seg.text.length > 0);
}

/**
 * One step in the per-character reveal stream. The talking host walks
 * the stream and reads `pauseMs` for the delay before showing the next
 * step — so word-boundary, comma, and sentence-end breaths are encoded
 * once, in the stream, instead of recomputed at render time.
 */
export interface RevealStep {
  readonly mood: Mood;
  /** Single character that lands on this step. */
  readonly token: string;
  /** Always empty in the current shape — kept for stream consumers that
   *  concatenate `token + trailing` to render the visible prefix. */
  readonly trailing: '';
  /** Delay (ms) before this step lands. */
  readonly pauseMs: number;
}

export interface PacingOptions {
  /** Per-char delay inside a word. Default 28ms. */
  readonly charMs?: number;
  /** Extra delay at each word boundary. Default 180ms. */
  readonly wordPauseMs?: number;
  /** Delay after a sentence-end mark (`.`/`!`/`?`/`…`). Default 420ms —
   *  long enough to read as a breath, short enough to keep momentum. */
  readonly sentencePauseMs?: number;
  /** Delay after a clause break (`,`/`;`/`:`). Default 240ms. */
  readonly clausePauseMs?: number;
}

const DEFAULT_CHAR_MS = 28;
const DEFAULT_WORD_PAUSE_MS = 180;
const DEFAULT_SENTENCE_PAUSE_MS = 420;
const DEFAULT_CLAUSE_PAUSE_MS = 240;

const SENTENCE_END: ReadonlySet<string> = new Set(['.', '!', '?', '…']);
const CLAUSE_BREAK: ReadonlySet<string> = new Set([',', ';', ':']);
const WHITESPACE: ReadonlySet<string> = new Set([' ', '\t', '\n', '\r']);

/**
 * Compile a parsed mood-script into a per-character reveal stream.
 * Each step carries its own `pauseMs`, so the host effect just walks
 * the cursor and reads the delay — no pacing math at render time.
 *
 * Pause precedence on the first letter of a new word:
 *   max(punctuation-breath, wordPauseMs). A `?!` chain doesn't compound,
 *   but a `, …` is promoted to sentence strength.
 */
export function expandReveal(
  segments: ReadonlyArray<MoodToken>,
  opts: PacingOptions = {}
): RevealStep[] {
  const charMs = opts.charMs ?? DEFAULT_CHAR_MS;
  const wordPauseMs = opts.wordPauseMs ?? DEFAULT_WORD_PAUSE_MS;
  const sentencePauseMs = opts.sentencePauseMs ?? DEFAULT_SENTENCE_PAUSE_MS;
  const clausePauseMs = opts.clausePauseMs ?? DEFAULT_CLAUSE_PAUSE_MS;

  const out: RevealStep[] = [];
  let prevWasSpace = true;
  let pendingBreath = 0;

  for (const seg of segments) {
    for (const ch of Array.from(seg.text)) {
      const isSpace = WHITESPACE.has(ch);
      let pauseMs: number;
      if (isSpace) {
        pauseMs = charMs;
      } else if (prevWasSpace) {
        pauseMs = Math.max(pendingBreath, wordPauseMs);
        pendingBreath = 0;
      } else {
        pauseMs = charMs;
      }
      out.push({ mood: seg.mood, token: ch, trailing: '', pauseMs });

      if (SENTENCE_END.has(ch)) {
        pendingBreath = Math.max(pendingBreath, sentencePauseMs);
      } else if (CLAUSE_BREAK.has(ch)) {
        pendingBreath = Math.max(pendingBreath, clausePauseMs);
      }
      prevWasSpace = isSpace;
    }
  }
  return out;
}
