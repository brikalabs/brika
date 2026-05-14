/**
 * Stream-to-lines reader with TTY-redraw normalization. Dev tools like
 * vite, ora-spinners, and bun's filter wrapper emit terminal control
 * sequences intended for an interactive TTY (cursor up, clear line,
 * `\r` to redraw in place). We pipe stdout, so without this
 * normalization those frames stack as duplicated / fragmented lines.
 *
 * Three passes:
 *
 *   1. **Stream parsing**: `\n` finalizes a line; `\r` (without a
 *      following `\n`) is a redraw — the in-progress line is discarded
 *      (the next bytes are about to overwrite it on a real TTY).
 *   2. **Per-line cleanup**: strip non-SGR ANSI escape sequences
 *      (cursor moves, clear-line, cursor visibility). SGR `ESC[…m`
 *      sequences are kept so colors still render.
 *   3. **Dedup**: skip lines identical to the immediately previous
 *      one. This collapses vite's "redraw the banner on every HMR"
 *      pattern without losing real repeated output (which is rarely
 *      back-to-back identical).
 *
 * Also strips the `<pkg> <script>: ` prefix `bun --filter` prepends to
 * every output line — we already display `[svc]` ourselves, so it's
 * pure duplication.
 */

/**
 * Match shape: `<package-name> <script>: ` at line start.
 * Package name = `<chars>/<chars>` (optional leading `@`) so we don't
 * accidentally strip legitimate log lines like `node:fs error:`.
 *
 *   in:  `@brika/signaling dev: [signaling] listening on http://...`
 *   out: `[signaling] listening on http://...`
 *
 * Deterministic — no overlapping greedy quantifiers (the two
 * `[\w.-]+` halves are separated by a literal `/`, and the trailing
 * `\S+:` is preceded by a required space).
 */
const FILTER_PREFIX_RE = /^@?[\w.-]+\/[\w.-]+ \S+:\s?/;

export function stripFilterPrefix(line: string): string {
  return line.replace(FILTER_PREFIX_RE, '');
}

// ─── ANSI control-sequence stripping ────────────────────────────────────────

// ESC (0x1b) and BEL (0x07) are intentional ANSI control bytes that we MUST
// match to strip non-SGR sequences. Constructing the regex via `new RegExp`
// with `String.fromCodePoint` + `String.raw` keeps the control characters
// and the backslash escapes out of the source (which is what linters and
// Sonar flag) without changing runtime behavior.
const ESC = String.fromCodePoint(0x1b);
const BEL = String.fromCodePoint(0x07);
const NON_SGR_CSI_RE = new RegExp(String.raw`${ESC}\[[?\d;]*[ABCDEFGHJKLMSTfsu]`, 'g');
const PRIVATE_MODE_RE = new RegExp(String.raw`${ESC}\[\?\d+[hl]`, 'g');
const OSC_RE = new RegExp(String.raw`${ESC}\][^${BEL}${ESC}]*(?:${BEL}|${ESC}\\)`, 'g');

/**
 * Strip non-SGR ANSI control sequences from `line`. Keeps SGR codes
 * (`ESC[<params>m`) so chalk/picocolors output renders in color;
 * drops cursor movement, clear-line, screen wipes, and cursor
 * visibility — every code that only makes sense in a live TTY.
 */
export function stripControlSequences(line: string): string {
  return line.replace(NON_SGR_CSI_RE, '').replace(PRIVATE_MODE_RE, '').replace(OSC_RE, '');
}

// ─── Stream reader ──────────────────────────────────────────────────────────

interface LineState {
  pending: string;
  lastEmitted: string | null;
}

export async function readStream(
  stream: ReadableStream<Uint8Array>,
  onLine: (line: string) => void
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const state: LineState = { pending: '', lastEmitted: null };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        flushPending(state, onLine);
        return;
      }
      processChunk(decoder.decode(value, { stream: true }), state, onLine);
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Walk one decoded chunk and dispatch each character to the line state.
 * `\n` finalizes the line; `\r` either consumes a following `\n` (CRLF)
 * or discards the in-progress frame (bare CR = TTY redraw).
 */
function processChunk(chunk: string, state: LineState, onLine: (line: string) => void): void {
  for (let i = 0; i < chunk.length; i++) {
    const ch = chunk[i];
    if (ch === '\n') {
      flushPending(state, onLine);
    } else if (ch === '\r') {
      if (chunk[i + 1] === '\n') {
        flushPending(state, onLine);
        i++; // consume the LF half of CRLF
      } else {
        // Bare CR: TTY in-place redraw. Drop the current frame.
        state.pending = '';
      }
    } else {
      state.pending += ch;
    }
  }
}

/**
 * Emit `state.pending` as a line if it's non-empty and not a duplicate
 * of the previous emission. Clears `pending` regardless of whether the
 * line was emitted.
 */
function flushPending(state: LineState, onLine: (line: string) => void): void {
  const cleaned = stripControlSequences(state.pending);
  state.pending = '';
  if (cleaned.length === 0 || cleaned === state.lastEmitted) {
    return;
  }
  state.lastEmitted = cleaned;
  onLine(cleaned);
}
