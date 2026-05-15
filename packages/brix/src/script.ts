/**
 * Mood-script — a tiny inline DSL for Brix lines that switch moods
 * mid-sentence. Authors write a single string with `{:mood:}` tokens
 * sprinkled in:
 *
 *   {:thinking:}untangling blocks…{:happy:}done! workflow deployed
 *
 * Tokens swap the mood for everything that follows, up to the next
 * token or end-of-string. The parser returns a flat token stream
 * tagged with the active mood. `<BrixTalking>` walks the stream and
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

  // Reset regex state — `TOKEN_RE` is module-level, so it's stateful
  // across calls.
  TOKEN_RE.lastIndex = 0;

  for (const match of input.matchAll(TOKEN_RE)) {
    const idx = match.index ?? 0;
    if (idx > cursor) {
      out.push({ mood: active, text: input.slice(cursor, idx) });
    }
    const candidate = match[1];
    if (candidate && KNOWN_MOODS.has(candidate)) {
      active = candidate as Mood;
    } else {
      // Preserve the unknown token as literal text so the user sees
      // their typo. Attribute it to the currently-active mood.
      out.push({ mood: active, text: match[0] });
    }
    cursor = idx + match[0].length;
  }
  if (cursor < input.length) {
    out.push({ mood: active, text: input.slice(cursor) });
  }
  // Compact empty chunks defensively (shouldn't happen given the
  // bounds above, but cheap insurance).
  return out.filter((seg) => seg.text.length > 0);
}

/**
 * Flatten a parsed script into the per-token reveal stream the
 * talking animation walks. Each entry is one word (or one char in
 * char-mode) plus the mood active when it landed.
 *
 * `pauseMs` is optional — when set, the talking component should use
 * it as the delay BEFORE revealing the next step (so a brief pause
 * naturally lands on word boundaries in typewriter mode).
 */
export interface RevealStep {
  readonly mood: Mood;
  readonly token: string;
  /** Whitespace that follows this token (empty in char/typewriter modes). */
  readonly trailing: string;
  /** Optional override for the per-step delay. */
  readonly pauseMs?: number;
}

export type RevealMode = 'word' | 'char' | 'typewriter';

export interface ExpandOptions {
  /** Per-char delay inside a word — typewriter mode only. Default 28ms. */
  readonly charMs?: number;
  /** Extra delay between words — typewriter mode only. Default 180ms. */
  readonly wordPauseMs?: number;
  /**
   * Delay before the next word after a sentence-end mark (`.`/`!`/`?`/`…`).
   * Typewriter mode only. Default 420ms — long enough to read as a
   * breath, short enough to keep momentum.
   */
  readonly sentencePauseMs?: number;
  /**
   * Delay before the next word after a clause break (`,`/`;`/`:`).
   * Typewriter mode only. Default 240ms.
   */
  readonly clausePauseMs?: number;
}

const DEFAULT_TW_CHAR_MS = 28;
const DEFAULT_TW_WORD_PAUSE_MS = 180;
const DEFAULT_TW_SENTENCE_PAUSE_MS = 420;
const DEFAULT_TW_CLAUSE_PAUSE_MS = 240;

/**
 * Sentence-end marks earn a long pause before the next word — Brix
 * gets to breathe and the reader gets to land.
 */
const SENTENCE_END = new Set(['.', '!', '?', '…']);
/** Clause breaks earn a moderate pause — comma-length. */
const CLAUSE_BREAK = new Set([',', ';', ':']);

export function expandReveal(
  segments: ReadonlyArray<MoodToken>,
  mode: RevealMode,
  opts: ExpandOptions = {}
): RevealStep[] {
  if (mode === 'char') {
    return expandChar(segments);
  }
  if (mode === 'typewriter') {
    return expandTypewriter(segments, opts);
  }
  return expandWord(segments);
}

function expandChar(segments: ReadonlyArray<MoodToken>): RevealStep[] {
  const out: RevealStep[] = [];
  for (const seg of segments) {
    for (const ch of Array.from(seg.text)) {
      out.push({ mood: seg.mood, token: ch, trailing: '' });
    }
  }
  return out;
}

function expandTypewriter(segments: ReadonlyArray<MoodToken>, opts: ExpandOptions): RevealStep[] {
  const charMs = opts.charMs ?? DEFAULT_TW_CHAR_MS;
  const wordPauseMs = opts.wordPauseMs ?? DEFAULT_TW_WORD_PAUSE_MS;
  const sentencePauseMs = opts.sentencePauseMs ?? DEFAULT_TW_SENTENCE_PAUSE_MS;
  const clausePauseMs = opts.clausePauseMs ?? DEFAULT_TW_CLAUSE_PAUSE_MS;

  const out: RevealStep[] = [];
  let prevWasSpace = true;
  /**
   * Pending pause earned by a punctuation mark we just emitted. Consumed
   * the moment the next non-space char lands — replaces the regular
   * word-boundary pause when stronger so we don't double-up.
   */
  let pendingBreath = 0;

  for (const seg of segments) {
    for (const ch of Array.from(seg.text)) {
      const isSpace = /\s/.test(ch);
      let pauseMs: number;
      if (isSpace) {
        // The space itself reveals at the in-word rate; the long pause
        // belongs on the first letter of the next word.
        pauseMs = charMs;
      } else if (prevWasSpace) {
        // First letter of a new word — pick the longest applicable pause.
        pauseMs = Math.max(pendingBreath, wordPauseMs);
        pendingBreath = 0;
      } else {
        pauseMs = charMs;
      }
      out.push({ mood: seg.mood, token: ch, trailing: '', pauseMs });

      // Queue a breath if this char is punctuation. We only set it
      // when stronger than what's already pending — a `?!` chain
      // doesn't compound, but a `, …` will be promoted to sentence.
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

function expandWord(segments: ReadonlyArray<MoodToken>): RevealStep[] {
  // Split on whitespace but keep the actual whitespace run that
  // followed each word so the recombined sentence preserves original
  // spacing across segment boundaries.
  const out: RevealStep[] = [];
  for (const seg of segments) {
    const wordRe = /(\S+)(\s*)/g;
    for (const m of seg.text.matchAll(wordRe)) {
      const [, token, trailing] = m;
      if (token && token.length > 0) {
        out.push({ mood: seg.mood, token, trailing: trailing ?? '' });
      }
    }
  }
  return out;
}
