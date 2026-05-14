/**
 * Brix animation frame sets. Each animation is a fixed cycle of
 * pre-composed face glyphs (already including brackets — Brix's
 * `bracket` prop only affects static moods, not animations).
 *
 * Animations are designed to be rendered by a `<BrixAnimated>` component
 * that walks `frames[i % frames.length]` on `intervalMs`. Frame counts
 * are kept short so the cycle feels deliberate, not jittery.
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

export interface Animation {
  readonly frames: ReadonlyArray<string>;
  readonly intervalMs: number;
}

export const ANIMATIONS: Readonly<Record<AnimationKind, Animation>> = {
  loading: {
    frames: ['(•  •)', '(•▁•)', '(•▃•)', '(•▄•)', '(•▆•)', '(•█•)'],
    intervalMs: 120,
  },
  thinking: {
    frames: ['(•◡•)', '(◔◡◔)', '(◔▿◔)', '(◔◡◔)'],
    intervalMs: 220,
  },
  /**
   * Idle breathing — a soft in/out cycle with a single closed-eye
   * blink woven in so Brix never looks frozen. Don't tighten the
   * interval: the long beat is what reads as "alive but calm".
   */
  breathing: {
    frames: ['(•◡•)', '(•ᴗ•)', '(•◡•)', '(-◡-)', '(•◡•)'],
    intervalMs: 600,
  },
  talking: {
    frames: ['(◕◡◕)', '(◕▿◕)', '(◕◠◕)', '(◕◡◕)'],
    intervalMs: 140,
  },
  sleep: {
    frames: ['(-◡-)', '(-◡-) z', '(-◡-) zZ', '(-◡-) zZz'],
    intervalMs: 600,
  },
  panic: {
    frames: ['(⊙▂⊙)', '(⊙▃⊙)', '(⊙▂⊙)'],
    intervalMs: 110,
  },
  error: {
    frames: ['(×◠×)', '(×▂×)', '(x_x)'],
    intervalMs: 220,
  },
  /**
   * Startup is a *narrative* sequence rather than a loop — callers
   * usually render it once with `loop: false` so it lands on
   * `(^◡^) runtime ready`.
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
  },
  /**
   * Single-shot blink — useful as an overlay sprinkled into an idle
   * loop. Two frames: open, closed, open.
   */
  blink: {
    frames: ['(•◡•)', '(-◡-)', '(•◡•)'],
    intervalMs: 90,
  },
  /**
   * Eyes glance left, center, right, back. Used for "looking around"
   * idle behavior — gives Brix a curious, observant vibe.
   */
  glance: {
    frames: ['(•◡•)', '(◔◡•)', '(•◡•)', '(•◡◔)', '(•◡•)'],
    intervalMs: 260,
  },
  /**
   * A friendly hello-wave with a tiny hand. Brix's body alternates
   * between two side states so the wave reads at a glance.
   */
  wave: {
    frames: ['(^◡^)/', '(^◡^)~', '(^◡^)/', '\\(^◡^)'],
    intervalMs: 180,
  },
  /**
   * Cheeky little dance with musical notes. The face moves with the
   * beat; the note swaps to suggest tempo.
   */
  dance: {
    frames: ['♪ (◕▿◕) ♪', '♫ (◕◡◕) ♫', '♪ (^◡^) ♪', '♫ (◕▿◕) ♫'],
    intervalMs: 200,
  },
  /**
   * Processing as eating — mouth opens, closes, opens, swallows.
   * Use for "ingesting" data: importing a plugin, parsing config.
   */
  nom: {
    frames: ['(◕ᴗ◕)', '(◕▿◕)', '(◕◡◕)', '(◕‿◕)'],
    intervalMs: 160,
  },
  /**
   * Two-frame bounce — Brix scoots a hair to the right. Pair with a
   * brief render to communicate "I'm on it" without committing to
   * a full thinking spinner.
   */
  hop: {
    frames: ['(•ᴗ•)', ' (•ᴗ•)', '(•ᴗ•)', ' (•ᴗ•)'],
    intervalMs: 220,
  },
  /**
   * A soft recoil — gentler than `error` / `panic`. Lands on a
   * sheepish face. Use for non-fatal mistakes.
   */
  oops: {
    frames: ['(>﹏<)', '(>◡<)', '(•◡•)'],
    intervalMs: 280,
  },
  /**
   * Celebration with sparkles. Lands on a starry-eyed face.
   * One-shot — pass `loop={false}` if you want it to settle.
   */
  celebrate: {
    frames: ['(◕▿◕)', '✦ (◕▿◕) ✦', '✧ (^◡^) ✧', '✦ (✦◡✦) ✦', '  (✦◡✦)  '],
    intervalMs: 200,
  },
  /**
   * Heartbeat — for `love` mood / very-happy moments. The heart
   * pulses next to a soft smiling Brix.
   */
  love: {
    frames: ['(♡◡♡)  ', '(♡◡♡) ♥', '(♡◡♡) ♡', '(♡◡♡)  '],
    intervalMs: 320,
  },
  /**
   * One-shot wink — open, close, open. Tiny and disarming.
   */
  wink: {
    frames: ['(^◡^)', '(^◡-)', '(^◡^)'],
    intervalMs: 180,
  },
};
