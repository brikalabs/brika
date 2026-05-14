/**
 * Brix animation frame sets. Each animation is a fixed cycle of
 * pre-composed face glyphs (already including brackets — Brix's
 * `bracket` prop only affects static moods, not animations).
 *
 * Animations are walked by `useFrameSeq` (and the components built on
 * it: `<BrixAnimated>`, `<BrixIdle>`). The `loop` and `tag` fields are
 * defaults that callers can override per-mount.
 *
 *   - `loop: false`  →  one-shot. Sits on the last frame when done.
 *   - `tag: 'narrative'`  →  storytelling sequence, not for loops.
 *   - `tag: 'emote'`  →  short interjection; idle program picks these.
 *   - `tag: 'reaction'` →  triggered by state changes (wave/oops/sleep).
 *   - `tag: 'baseline'` →  ambient (breathing); the canvas idle sits on.
 */

export type AnimationKind =
  | 'loading'
  | 'thinking'
  | 'breathing'
  | 'talking'
  | 'sleep'
  | 'panic'
  | 'error'
  | 'startup'
  | 'blink'
  | 'glance'
  | 'wave'
  | 'dance'
  | 'nom'
  | 'hop'
  | 'oops'
  | 'celebrate'
  | 'love'
  | 'wink';

/** Classification used by composers (idle program, reaction picker, etc.). */
export type AnimationTag = 'baseline' | 'emote' | 'reaction' | 'narrative' | 'spinner';

export interface Animation {
  readonly frames: ReadonlyArray<string>;
  readonly intervalMs: number;
  /** Default loop behavior — overridden per-mount. Defaults to `true`. */
  readonly loop?: boolean;
  /** Hint for layout: the cell width to reserve regardless of frame variance. */
  readonly width?: number;
  /** Used by composers to filter the animation library. */
  readonly tag?: AnimationTag;
}

export const ANIMATIONS: Readonly<Record<AnimationKind, Animation>> = {
  loading: {
    frames: ['(•  •)', '(•▁•)', '(•▃•)', '(•▄•)', '(•▆•)', '(•█•)'],
    intervalMs: 120,
    tag: 'spinner',
    width: 5,
  },
  thinking: {
    frames: ['(•◡•)', '(◔◡◔)', '(◔▿◔)', '(◔◡◔)'],
    intervalMs: 220,
    tag: 'reaction',
    width: 5,
  },
  /**
   * Idle breathing — a soft in/out cycle with a single closed-eye
   * blink woven in so Brix never looks frozen. Don't tighten the
   * interval: the long beat is what reads as "alive but calm".
   */
  breathing: {
    frames: ['(•◡•)', '(•ᴗ•)', '(•◡•)', '(-◡-)', '(•◡•)'],
    intervalMs: 600,
    tag: 'baseline',
    width: 5,
  },
  talking: {
    frames: ['(◕◡◕)', '(◕▿◕)', '(◕◠◕)', '(◕◡◕)'],
    intervalMs: 140,
    tag: 'spinner',
    width: 5,
  },
  sleep: {
    frames: ['(-◡-)', '(-◡-) z', '(-◡-) zZ', '(-◡-) zZz'],
    intervalMs: 600,
    tag: 'reaction',
    width: 9,
  },
  panic: {
    frames: ['(⊙▂⊙)', '(⊙▃⊙)', '(⊙▂⊙)'],
    intervalMs: 110,
    tag: 'reaction',
    width: 5,
  },
  error: {
    frames: ['(×◠×)', '(×▂×)', '(x_x)'],
    intervalMs: 220,
    loop: false,
    tag: 'reaction',
    width: 5,
  },
  /**
   * Startup is a *narrative* sequence rather than a loop — lands on
   * `(^◡^) runtime ready`. `loop: false` makes that default behavior.
   */
  startup: {
    frames: [
      '(•◡•) booting...',
      '(◔◡◔) loading plugins...',
      '(◕▿◕) building workflows...',
      '(◕ᴗ◕) ♪ humming…',
      '(^◡^) runtime ready',
    ],
    intervalMs: 450,
    loop: false,
    tag: 'narrative',
  },
  /**
   * Single-shot blink — useful as an overlay sprinkled into an idle
   * loop. Two frames: open, closed, open.
   */
  blink: {
    frames: ['(•◡•)', '(-◡-)', '(•◡•)'],
    intervalMs: 90,
    loop: false,
    tag: 'emote',
    width: 5,
  },
  /**
   * Eyes glance left, center, right, back. Used for "looking around"
   * idle behavior — gives Brix a curious, observant vibe.
   */
  glance: {
    frames: ['(•◡•)', '(◔◡•)', '(•◡•)', '(•◡◔)', '(•◡•)'],
    intervalMs: 260,
    loop: false,
    tag: 'emote',
    width: 5,
  },
  /**
   * A friendly hello-wave with a tiny hand. Brix's body alternates
   * between two side states so the wave reads at a glance.
   */
  wave: {
    frames: ['(^◡^)/', '(^◡^)~', '(^◡^)/', '\\(^◡^)'],
    intervalMs: 180,
    tag: 'reaction',
    width: 6,
  },
  /**
   * Cheeky little dance with musical notes. The face moves with the
   * beat; the note swaps to suggest tempo.
   */
  dance: {
    frames: ['♪ (◕▿◕) ♪', '♫ (◕◡◕) ♫', '♪ (^◡^) ♪', '♫ (◕▿◕) ♫'],
    intervalMs: 200,
    tag: 'reaction',
    width: 10,
  },
  /**
   * Processing as eating — mouth opens, closes, opens, swallows.
   * Use for "ingesting" data: importing a plugin, parsing config.
   */
  nom: {
    frames: ['(◕ᴗ◕)', '(◕▿◕)', '(◕◡◕)', '(◕‿◕)'],
    intervalMs: 160,
    loop: false,
    tag: 'emote',
    width: 5,
  },
  /**
   * Two-frame bounce — Brix scoots a hair to the right. Pair with a
   * brief render to communicate "I'm on it" without committing to
   * a full thinking spinner.
   */
  hop: {
    frames: ['(•ᴗ•)', ' (•ᴗ•)', '(•ᴗ•)', ' (•ᴗ•)'],
    intervalMs: 220,
    loop: false,
    tag: 'emote',
    width: 6,
  },
  /**
   * A soft recoil — gentler than `error` / `panic`. Lands on a
   * sheepish face. Use for non-fatal mistakes.
   */
  oops: {
    frames: ['(>﹏<)', '(>◡<)', '(•◡•)'],
    intervalMs: 280,
    loop: false,
    tag: 'reaction',
    width: 5,
  },
  /**
   * Celebration with sparkles. Lands on a starry-eyed face.
   * One-shot — pass `loop={false}` if you want it to settle.
   */
  celebrate: {
    frames: ['(◕▿◕)', '✦ (◕▿◕) ✦', '✧ (^◡^) ✧', '✦ (✦◡✦) ✦', '  (✦◡✦)  '],
    intervalMs: 200,
    loop: false,
    tag: 'reaction',
    width: 10,
  },
  /**
   * Heartbeat — for `love` mood / very-happy moments. The heart
   * pulses next to a soft smiling Brix.
   */
  love: {
    frames: ['(♡◡♡)  ', '(♡◡♡) ♥', '(♡◡♡) ♡', '(♡◡♡)  '],
    intervalMs: 320,
    tag: 'reaction',
    width: 7,
  },
  /**
   * One-shot wink — open, close, open. Tiny and disarming.
   */
  wink: {
    frames: ['(^◡^)', '(^◡-)', '(^◡^)'],
    intervalMs: 180,
    loop: false,
    tag: 'emote',
    width: 5,
  },
};
