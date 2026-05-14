/**
 * Non-Ink narrator for one-shot subcommands. Each method writes a
 * single line to stdout/stderr prefixed with the matching Brix mood
 * glyph. Use this for commands whose whole job is to do a thing and
 * print a short result — `brix.ok`, `brix.fail`, etc.
 *
 *   import { brix } from '@brika/brix/log';
 *   brix.info('booting…');               // (•◡•) booting…
 *   brix.think('resolving blocks…');     // (◔◡◔) resolving blocks…
 *   brix.ok('workflow deployed');        // (^◡^) workflow deployed
 *   brix.warn('that plugin is slow');    // (•~•) that plugin is slow
 *   brix.fail('plugin crashed');         // (×◠×) plugin crashed
 *
 *   const sp = brix.spinner('booting');  // animated …
 *   sp.succeed('booted in 240ms');       // → (^◡^) booted in 240ms
 *
 * NO_COLOR is respected: when set, no ANSI escape is emitted around
 * the face glyph.
 */

import pc from 'picocolors';
import { ANIMATIONS } from './animations';
import { faceOf, type Mood } from './moods';

type Writer = (line: string) => void;
type Painter = (text: string) => string;

const moodColor: Readonly<Record<Mood, Painter>> = {
  default: pc.cyan,
  idle: pc.cyan,
  happy: pc.green,
  excited: pc.green,
  thinking: pc.cyan,
  focused: pc.cyan,
  curious: pc.magenta,
  sleep: pc.dim,
  sad: pc.yellow,
  error: pc.red,
  dead: pc.red,
  panic: pc.red,
  angry: pc.red,
  suspicious: pc.yellow,
  love: pc.magenta,
  cool: pc.cyan,
  loading: pc.cyan,
  success: pc.green,
};

function colorEnabled(): boolean {
  // picocolors caches the env at import time; we re-check at call time so a
  // command that sets NO_COLOR after startup still gets uncolored output.
  return !process.env.NO_COLOR;
}

function writeLine(stream: 'stdout' | 'stderr', mood: Mood, message: string): void {
  const face = faceOf(mood);
  const tinted = colorEnabled() ? moodColor[mood](face) : face;
  const out = `${tinted} ${message}\n`;
  if (stream === 'stderr') {
    process.stderr.write(out);
  } else {
    process.stdout.write(out);
  }
}

export interface BrixSpinner {
  /** Stop the spinner without printing a final line. */
  stop(): void;
  /** Stop and replace the line with a `success` mood. */
  succeed(message?: string): void;
  /** Stop and replace the line with an `error` mood. */
  fail(message?: string): void;
}

export interface BrixLog {
  /** `(•◡•) message` — neutral status. */
  info: Writer;
  /** `(◔◡◔) message` — Brix is working on it. */
  think: Writer;
  /** `(^◡^) message` — done, healthy. */
  ok: Writer;
  /** `(•~•) message` — heads-up, not a failure. */
  warn: Writer;
  /** `(×◠×) message` — failure (writes to stderr). */
  fail: Writer;
  /** `(⊙▂⊙) message` — runtime panic (writes to stderr). */
  panic: Writer;
  /** `(x_x) message` — terminal state (writes to stderr). */
  dead: Writer;
  /** `(◕◡◕) message` — plain narration. */
  say: Writer;
  /** `(◕‿◕) message` — explicit success line. */
  yay: Writer;
  /**
   * Render an animated loading face on a single line. Returns a
   * controller — call `succeed` / `fail` / `stop` to finalize.
   * Falls back to one static line when stdout is not a TTY (so CI
   * output stays clean).
   */
  spinner(message: string): BrixSpinner;
}

function makeSpinner(message: string): BrixSpinner {
  if (!process.stdout.isTTY) {
    writeLine('stdout', 'loading', message);
    return {
      stop: () => undefined,
      succeed: (m) => writeLine('stdout', 'success', m ?? message),
      fail: (m) => writeLine('stderr', 'error', m ?? message),
    };
  }
  const { frames, intervalMs } = ANIMATIONS.loading;
  let i = 0;
  const draw = (): void => {
    const face = moodColor.loading(frames[i % frames.length] ?? '');
    process.stdout.write(`\r${face} ${message}`);
    i += 1;
  };
  draw();
  const t = setInterval(draw, intervalMs);
  const clearLine = (): void => {
    process.stdout.write(`\r${' '.repeat(message.length + 8)}\r`);
  };
  return {
    stop() {
      clearInterval(t);
      clearLine();
    },
    succeed(m) {
      clearInterval(t);
      clearLine();
      writeLine('stdout', 'success', m ?? message);
    },
    fail(m) {
      clearInterval(t);
      clearLine();
      writeLine('stderr', 'error', m ?? message);
    },
  };
}

export const brix: BrixLog = {
  info: (m) => writeLine('stdout', 'idle', m),
  think: (m) => writeLine('stdout', 'thinking', m),
  ok: (m) => writeLine('stdout', 'happy', m),
  warn: (m) => writeLine('stdout', 'focused', m),
  fail: (m) => writeLine('stderr', 'error', m),
  panic: (m) => writeLine('stderr', 'panic', m),
  dead: (m) => writeLine('stderr', 'dead', m),
  say: (m) => writeLine('stdout', 'default', m),
  yay: (m) => writeLine('stdout', 'success', m),
  spinner: makeSpinner,
};
