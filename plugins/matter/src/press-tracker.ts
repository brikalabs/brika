/**
 * Press tracker: normalizes raw Matter Switch cluster events into user-level
 * button presses.
 *
 * A physical gesture surfaces as a burst of raw Matter events (initialPress,
 * shortRelease, longPress, multiPressOngoing, multiPressComplete, ...) whose
 * payload fields arrive as strings. Users think in gestures: short, long,
 * double, triple. This module collapses each burst into exactly one
 * normalized press per gesture:
 *
 *   - `longPress`            → emit 'long' immediately (the trailing
 *     `longRelease` carries no extra information and is ignored).
 *   - `shortRelease`         → start (or restart) a short timer; if it fires
 *     without a `multiPressComplete`, the gesture was a single 'short' press.
 *   - `multiPressOngoing`    → a multi-press sequence is confirmed; cancel the
 *     timer and wait for `multiPressComplete`.
 *   - `multiPressComplete`   → emit from `totalNumberOfPressesCounted`
 *     (1 → short, 2 → double, 3 → triple, more → multi).
 *
 * Pure logic, no matter.js imports: the clock is injectable so the state
 * machine is unit-testable.
 */

export type PressType = 'short' | 'long' | 'double' | 'triple' | 'multi';

/** A single user-level gesture. */
export interface NormalizedPress {
  press: PressType;
  count: number;
}

export interface PressTrackerOptions<THandle> {
  /** Called exactly once per recognized gesture. */
  onPress(key: string, press: NormalizedPress): void;
  /** How long after a shortRelease to wait for a multi-press sequence. */
  delayMs?: number;
  /** setTimeout-like scheduler (injectable for tests). */
  schedule(fn: () => void, delayMs: number): THandle;
  /** clearTimeout-like canceller (injectable for tests). */
  cancel(handle: THandle): void;
}

const DEFAULT_DELAY_MS = 400;

/** Raw switch events the tracker understands; everything else is ignored. */
export const SWITCH_PRESS_EVENTS: ReadonlySet<string> = new Set([
  'initialPress',
  'shortRelease',
  'longPress',
  'longRelease',
  'multiPressOngoing',
  'multiPressComplete',
]);

/** Map a multi-press count to a normalized press. */
export function pressFromCount(count: number): NormalizedPress {
  if (count <= 1) {
    return { press: 'short', count: 1 };
  }
  if (count === 2) {
    return { press: 'double', count: 2 };
  }
  if (count === 3) {
    return { press: 'triple', count: 3 };
  }
  return { press: 'multi', count };
}

/** Parse `totalNumberOfPressesCounted` from a stringly-typed event payload. */
function readPressCount(data: Record<string, string>): number {
  const raw = Number(data.totalNumberOfPressesCounted);
  if (!Number.isFinite(raw) || raw < 1) {
    return 1;
  }
  return Math.round(raw);
}

export class PressTracker<THandle> {
  readonly #onPress: (key: string, press: NormalizedPress) => void;
  readonly #delayMs: number;
  readonly #schedule: (fn: () => void, delayMs: number) => THandle;
  readonly #cancel: (handle: THandle) => void;
  readonly #pending = new Map<string, THandle>();

  constructor(options: PressTrackerOptions<THandle>) {
    this.#onPress = options.onPress;
    this.#delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
    this.#schedule = options.schedule;
    this.#cancel = options.cancel;
  }

  /**
   * Feed one raw switch event for a (deviceId, button) key. Unknown events
   * (including `initialPress` and `longRelease`) are ignored.
   */
  handle(key: string, event: string, data: Record<string, string>): void {
    switch (event) {
      case 'longPress':
        this.#cancelPending(key);
        this.#onPress(key, { press: 'long', count: 1 });
        break;
      case 'shortRelease':
        this.#startTimer(key);
        break;
      case 'multiPressOngoing':
        // A multi-press sequence is confirmed; multiPressComplete will follow.
        this.#cancelPending(key);
        break;
      case 'multiPressComplete':
        this.#cancelPending(key);
        this.#onPress(key, pressFromCount(readPressCount(data)));
        break;
      default:
        break;
    }
  }

  #startTimer(key: string): void {
    this.#cancelPending(key);
    const handle = this.#schedule(() => {
      this.#pending.delete(key);
      this.#onPress(key, { press: 'short', count: 1 });
    }, this.#delayMs);
    this.#pending.set(key, handle);
  }

  #cancelPending(key: string): void {
    const handle = this.#pending.get(key);
    if (handle !== undefined) {
      this.#cancel(handle);
      this.#pending.delete(key);
    }
  }
}

/** Press tracker wired to the real clock. */
export function createPressTracker(
  onPress: (key: string, press: NormalizedPress) => void,
  delayMs = DEFAULT_DELAY_MS
): PressTracker<ReturnType<typeof setTimeout>> {
  return new PressTracker({
    onPress,
    delayMs,
    schedule: (fn, ms) => setTimeout(fn, ms),
    cancel: (handle) => clearTimeout(handle),
  });
}
