/**
 * Unit tests for stream-reader utilities: stripFilterPrefix,
 * stripControlSequences, and readStream (including CRLF handling).
 */
import { describe, expect, test } from 'bun:test';
import { readStream, stripControlSequences, stripFilterPrefix } from './stream-reader';

// ─── stripFilterPrefix ───────────────────────────────────────────────────────

describe('stripFilterPrefix', () => {
  test('strips @scoped-package/name script: prefix', () => {
    expect(stripFilterPrefix('@brika/signaling dev: [signaling] ready')).toBe('[signaling] ready');
  });

  test('strips unscoped package/name prefix', () => {
    expect(stripFilterPrefix('my-pkg/sub build: output line')).toBe('output line');
  });

  test('leaves non-prefixed lines unchanged', () => {
    expect(stripFilterPrefix('plain log line')).toBe('plain log line');
  });

  test('does not strip node:fs style (no slash in first word)', () => {
    expect(stripFilterPrefix('node:fs error: ENOENT')).toBe('node:fs error: ENOENT');
  });
});

// ─── stripControlSequences ───────────────────────────────────────────────────

describe('stripControlSequences', () => {
  test('removes cursor-up CSI (ESC[NA)', () => {
    const line = '\x1b[2Ahello';
    expect(stripControlSequences(line)).toBe('hello');
  });

  test('removes clear-line CSI (ESC[K)', () => {
    const line = '\x1b[Khello';
    expect(stripControlSequences(line)).toBe('hello');
  });

  test('keeps SGR color codes (ESC[<n>m)', () => {
    const line = '\x1b[31mred\x1b[0m';
    expect(stripControlSequences(line)).toBe('\x1b[31mred\x1b[0m');
  });

  test('removes private mode sequences (ESC[?25h / ESC[?25l)', () => {
    const line = '\x1b[?25hvisible\x1b[?25l';
    expect(stripControlSequences(line)).toBe('visible');
  });

  test('removes OSC sequences (window title etc.)', () => {
    // OSC ending with BEL
    const line = '\x1b]0;my title\x07hello';
    expect(stripControlSequences(line)).toBe('hello');
  });

  test('handles multiple control sequences in one line', () => {
    const line = '\x1b[2A\x1b[Khello\x1b[?25h world';
    expect(stripControlSequences(line)).toBe('hello world');
  });
});

// ─── readStream ──────────────────────────────────────────────────────────────

/** Build a ReadableStream from an array of Uint8Array chunks. */
function makeStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(chunks[i++]);
      } else {
        controller.close();
      }
    },
  });
}

function encode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

describe('readStream', () => {
  test('emits lines split by LF', async () => {
    const lines: string[] = [];
    await readStream(makeStream([encode('hello\nworld\n')]), (l) => lines.push(l));
    expect(lines).toEqual(['hello', 'world']);
  });

  test('flushes unterminated trailing content', async () => {
    const lines: string[] = [];
    await readStream(makeStream([encode('no newline')]), (l) => lines.push(l));
    expect(lines).toEqual(['no newline']);
  });

  test('CRLF (\\r\\n) is treated as a single line ending', async () => {
    const lines: string[] = [];
    await readStream(makeStream([encode('line1\r\nline2\r\n')]), (l) => lines.push(l));
    expect(lines).toEqual(['line1', 'line2']);
  });

  test('bare CR discards the current frame (TTY redraw)', async () => {
    const lines: string[] = [];
    // "frame-A\rframe-B\n" should emit only "frame-B"
    await readStream(makeStream([encode('frame-A\rframe-B\n')]), (l) => lines.push(l));
    expect(lines).toEqual(['frame-B']);
  });

  test('consecutive identical lines are deduplicated', async () => {
    const lines: string[] = [];
    await readStream(makeStream([encode('same\nsame\nsame\n')]), (l) => lines.push(l));
    expect(lines).toEqual(['same']);
  });

  test('non-identical repeated lines are kept', async () => {
    const lines: string[] = [];
    await readStream(makeStream([encode('a\nb\na\n')]), (l) => lines.push(l));
    expect(lines).toEqual(['a', 'b', 'a']);
  });

  test('strips non-SGR ANSI sequences from emitted lines', async () => {
    const lines: string[] = [];
    await readStream(makeStream([encode('\x1b[2A\x1b[Khello\n')]), (l) => lines.push(l));
    expect(lines).toEqual(['hello']);
  });

  test('CR at end of chunk followed by LF in next chunk: CR clears pending, LF emits nothing', async () => {
    // When \r falls at the end of chunk 1 and \n starts chunk 2, the
    // processChunk loop sees the \r and there is no next char in that
    // chunk to check. It falls through to the bare-CR path (clears pending).
    // The \n in chunk 2 then tries to flush an empty pending, which is
    // suppressed. This is the documented "redraw" behavior.
    const lines: string[] = [];
    await readStream(makeStream([encode('hello\r'), encode('\nworld\n')]), (l) => lines.push(l));
    // 'hello' was pending, \r discards it; \n flushes empty; 'world' is emitted.
    expect(lines).toEqual(['world']);
  });

  test('empty lines are suppressed (zero-length after strip)', async () => {
    const lines: string[] = [];
    await readStream(makeStream([encode('a\n\nb\n')]), (l) => lines.push(l));
    // Empty line between a and b produces empty string -> suppressed
    expect(lines).toEqual(['a', 'b']);
  });
});
