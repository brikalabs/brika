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
  | 'startup';

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
  breathing: {
    frames: ['(•◡•)', '(•ᴗ•)', '(•◡•)'],
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
      '(^◡^) runtime ready',
    ],
    intervalMs: 450,
  },
};
