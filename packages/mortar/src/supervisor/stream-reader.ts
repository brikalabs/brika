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
 *      (cursor moves, clear-line, cursor visibility). SGR `\x1b[…m`
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
 * Match shape: `<no-space-token> <no-space-token>: ` at line start.
 * The first token must contain `@` or `/` (workspace package name) so
 * we don't accidentally strip legitimate log lines like `node:fs error:`.
 *
 *   in:  `@brika/signaling dev: [signaling] listening on http://...`
 *   out: `[signaling] listening on http://...`
 */
const FILTER_PREFIX_RE = /^[\w@./-]*[@/][\w@./-]*\s+\S+:\s?/;

export function stripFilterPrefix(line: string): string {
  return line.replace(FILTER_PREFIX_RE, '');
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: matching ESC bytes is the whole job
const NON_SGR_CSI_RE = /\x1b\[[?\d;]*[ABCDEFGHJKLMSTfsu]/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching ESC bytes is the whole job
const PRIVATE_MODE_RE = /\x1b\[\?\d+[hl]/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching ESC + BEL bytes is the whole job
const OSC_RE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

/**
 * Strip non-SGR ANSI control sequences from `line`. Keeps SGR codes
 * (`\x1b[<params>m`) so chalk/picocolors output renders in color;
 * drops cursor movement, clear-line, screen wipes, and cursor
 * visibility — every code that only makes sense in a live TTY.
 */
export function stripControlSequences(line: string): string {
  return line.replace(NON_SGR_CSI_RE, '').replace(PRIVATE_MODE_RE, '').replace(OSC_RE, '');
}

export async function readStream(
  stream: ReadableStream<Uint8Array>,
  onLine: (line: string) => void
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let lastEmitted: string | null = null;

  const flushPending = (): void => {
    const cleaned = stripControlSequences(pending);
    pending = '';
    if (cleaned.length === 0) {
      return;
    }
    if (cleaned === lastEmitted) {
      return;
    }
    lastEmitted = cleaned;
    onLine(cleaned);
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        if (pending.length > 0) {
          flushPending();
        }
        return;
      }
      const chunk = decoder.decode(value, { stream: true });
      for (let i = 0; i < chunk.length; i++) {
        const ch = chunk[i];
        if (ch === '\n') {
          flushPending();
        } else if (ch === '\r') {
          // CRLF: treat as a normal newline; consume the `\n` here too.
          if (chunk[i + 1] === '\n') {
            flushPending();
            i++;
          } else {
            // Bare `\r`: in-place redraw. Discard the current frame —
            // whatever comes next is overwriting it on a real TTY.
            pending = '';
          }
        } else {
          pending += ch;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
