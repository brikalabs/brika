/**
 * Tiny 1-body physics — just enough to make Brix feel like he stands
 * on a floor, jumps with a real arc, and lands with intent. Y is
 * height above the floor (positive up, zero = feet on floor). VX is
 * horizontal speed in cells per second. Gravity pulls VY down.
 *
 * The simulator is a pure function: `step(state, dt)` returns the
 * next state. No timers, no closures — the emote compiler walks the
 * step in fixed dt slices and snapshots a Brix sprite per slice.
 */

/** Cells/sec². Tuned so a `vy = 18` impulse arcs roughly 4 cells
 *  high and lands in ~900ms — feels Mario-ish at terminal scale. */
export const GRAVITY = 40;

export interface BrickState {
  /** Horizontal centre in cell coordinates (float). */
  readonly cx: number;
  /** Cells/sec horizontal velocity. */
  readonly vx: number;
  /** Height of the feet above the floor row (≥ 0). */
  readonly y: number;
  /** Cells/sec vertical velocity (positive = upward). */
  readonly vy: number;
  /** Body width in cells (odd numbers look best). */
  readonly w: number;
  /** Body height in cells. */
  readonly h: number;
  /** True iff the body is resting on the floor. */
  readonly grounded: boolean;
}

export function makeBrick(overrides: Partial<BrickState> = {}): BrickState {
  return {
    cx: 7,
    vx: 0,
    y: 0,
    vy: 0,
    w: 5,
    h: 3,
    grounded: true,
    ...overrides,
  };
}

/**
 * Integrate one step of explicit Euler with floor collision.
 * Anything below `y = 0` snaps to the floor and zeros vy.
 */
export function step(state: BrickState, dtMs: number, gravity = GRAVITY): BrickState {
  const dt = dtMs / 1000;
  const vy = state.vy - gravity * dt;
  const y = state.y + vy * dt;
  const cx = state.cx + state.vx * dt;
  if (y <= 0 && vy <= 0) {
    return { ...state, cx, y: 0, vy: 0, grounded: true };
  }
  return { ...state, cx, y, vy, grounded: false };
}
