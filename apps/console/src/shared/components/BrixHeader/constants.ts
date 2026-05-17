/**
 * All the tuning knobs Brix's "alive" behaviour layer pulls. Pulling
 * them into one module keeps the hooks readable and lets us tweak the
 * feel of the mascot without hunting through three files.
 */

import { type PacingOptions, STAGE_WIDTH } from '@brika/brix';

// ─── Bubble layout ────────────────────────────────────────────────────────

/** Chrome we leave around the bubble: AppShell border (2) + body
 *  paddingX (2) + the stage column + a 1-column gap. */
export const HEADER_CHROME = 2 + 2 + STAGE_WIDTH + 1;
export const BUBBLE_MIN_WIDTH = 28;
export const BUBBLE_MAX_WIDTH = 96;

// ─── Speech pacing ────────────────────────────────────────────────────────

/** Named typewriter cadences. `normal` is the default; the operator can
 *  pick a different preset by setting `BRIKA_BRIX_SPEED` to any of
 *  these names (case-insensitive). `instant` disables the typewriter
 *  entirely — full lines land in one frame. `normal` is intentionally
 *  brisk so idle chatter doesn't feel sluggish; choose `slow` if you
 *  want a more contemplative cadence. */
export const PACING_PRESETS = {
  instant: { charMs: 0, wordPauseMs: 0, clausePauseMs: 0, sentencePauseMs: 0 },
  fast: { charMs: 8, wordPauseMs: 30, clausePauseMs: 60, sentencePauseMs: 120 },
  normal: { charMs: 14, wordPauseMs: 55, clausePauseMs: 110, sentencePauseMs: 210 },
  slow: { charMs: 28, wordPauseMs: 120, clausePauseMs: 240, sentencePauseMs: 480 },
} as const satisfies Record<string, PacingOptions>;

export type PacingPreset = keyof typeof PACING_PRESETS;

function selectedPreset(): PacingPreset {
  const env = process.env.BRIKA_BRIX_SPEED?.toLowerCase();
  if (env && env in PACING_PRESETS) {
    return env as PacingPreset;
  }
  return 'normal';
}

/** Default typewriter cadence handed to `brixHostReducer`. Resolved
 *  once at module load from `BRIKA_BRIX_SPEED` (or `normal` if unset
 *  / bogus). Per-line overrides flow through `useBubbleStream.say()`. */
export const PACING: PacingOptions = PACING_PRESETS[selectedPreset()];

/** Instant cadence used for poke lines — they're short reactive
 *  one-liners ("ouch!", "HEY!") that need to land in one frame so the
 *  poke feels snappy. The reveal animation isn't useful for two-word
 *  reactions; the post-reveal hold (`SPEECH_HOLD_MS`) still keeps the
 *  line on screen long enough to read between clicks. */
export const POKE_PACING: PacingOptions = PACING_PRESETS.instant;

/** Minimum delay between reveal ticks. Floors the reducer's per-step
 *  pauseMs so a malformed line can't pin the timer at 0ms. Kept low
 *  (4ms) so the `fast` and `instant` presets aren't artificially
 *  throttled. */
export const MIN_TICK_MS = 4;

/** Hold the final line for a beat once the typewriter finishes, so the
 *  operator gets a chance to actually read it. Reactions (state-change
 *  greetings) get a shorter hold than free speech. */
export const REACTION_HOLD_MS = 900;
export const SPEECH_HOLD_MS = 1200;

// ─── Idle scheduling ──────────────────────────────────────────────────────

/** Range between auto-spoken idle lines. Shorter than the original
 *  18–32s — Brix should chatter often enough that the operator notices
 *  he's *there* without it being annoying. */
export const AUTO_TALK_MIN_MS = 10_000;
export const AUTO_TALK_MAX_MS = 22_000;

/** When picking an idle line, this is the probability we sidestep the
 *  hub-state pool and reach for a time-of-day or random-thought line
 *  instead. Keeps the idle stream from becoming repetitive. */
export const TIME_OF_DAY_BIAS = 0.25;
export const RANDOM_THOUGHT_BIAS = 0.15;

// ─── Easter-egg unlock ────────────────────────────────────────────────────

/** Rapid-click threshold: N pokes within `UNLOCK_TAP_WINDOW_MS` navigate
 *  to the hidden Brix Run route. Tuned so accidental double-pokes don't
 *  trip it but a determined operator can get there in ~1.5 s. */
export const UNLOCK_TAP_COUNT = 5;
export const UNLOCK_TAP_WINDOW_MS = 2000;

// ─── Knockback physics ────────────────────────────────────────────────────

/** Per-axis impulse magnitudes pushed into `useBrixPhysics()` on each
 *  poke. These are *velocity* values (cells/sec), not displacements —
 *  the physics engine integrates them under gravity + friction +
 *  bounce. Biased upward but kept modest so the header stays compact:
 *  vy=14 + gravity=40 → ~2.5-cell apex, comfortably inside the trimmed
 *  jump headroom below. */
export const KICK_MAG_X = 6;
export const KICK_MAG_Y = 14;

/** Vertical headroom (in rows) reserved above Brix's resting position
 *  so the layout has somewhere to draw him at the apex of a jump. Kept
 *  small (2 rows) to keep the header compact; matched by
 *  `MAX_OFFSET.y` in `index.tsx` so high arcs clamp instead of
 *  clipping the sprite at the top. */
export const JUMP_HEADROOM = 2;

// ─── Death + respawn ──────────────────────────────────────────────────────

/** Total pokes (across the whole session, not just the rapid-tap
 *  window) before Brix gives up the ghost. Tuned so determined abuse
 *  triggers it but casual poking doesn't. */
export const LIFETIME_POKE_LIMIT = 20;

/** How long the `dead` emote runs before we swap in the tombstone. The
 *  emote's own beats + `hold` add up to ~2.5 s; this leaves a tiny tail
 *  so the flat-brick frame is fully visible before the cut. */
export const DEAD_EMOTE_MS = 6000;

/** How long the tombstone sits on screen before Brix respawns. Long
 *  enough to feel like a real loss; short enough that the operator
 *  doesn't think the TUI froze. */
export const TOMBSTONE_MS = 60000;

// ─── Poke streak escalation ───────────────────────────────────────────────

/** Tap count threshold above which Brix switches from mild to annoyed
 *  ouch lines. Below this it's the soft pool; at or above (but still
 *  under the unlock count) it's the snarkier pool. */
export const ANNOYED_THRESHOLD = 3;
