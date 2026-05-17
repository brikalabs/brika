/**
 * `useBrixPhysics` — live 1-body simulation for the mascot.
 *
 * Wraps the pure `step` integrator (see `physics.ts`) in a React hook
 * that any consumer can drive imperatively. Each call to `impulse(vx,
 * vy)` adds velocity to the current state; gravity then pulls Brix
 * back to the floor, ground friction damps horizontal motion, and an
 * optional spring force walks him back to his home column once he's
 * at rest. The result is a `{ x, y }` cell offset the caller can apply
 * to whatever element renders the mascot.
 *
 * Why a hook instead of an emote? Emotes are pre-baked timelines —
 * great for canned animations like `hop` or `wave`. Live impulses
 * (random recoil on a click, knockback from an event, etc.) can't be
 * scripted ahead of time, so they need real-time integration.
 *
 *   const { offset, impulse } = useBrixPhysics();
 *   <Box marginLeft={offset.x} marginTop={-offset.y}>
 *     <BrixStage … />
 *   </Box>
 *   // somewhere on a click handler:
 *   impulse(randomBetween(-6, 6), randomBetween(8, 14));
 *
 * The simulation is dormant when the body is at rest at home — the
 * interval is cleared and there's no per-frame work until the next
 * impulse wakes it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { type BrickState, GRAVITY, makeBrick, step } from './physics';

export interface UseBrixPhysicsOptions {
  /** Cells/sec². Defaults to the brix-wide `GRAVITY` (40). */
  readonly gravity?: number;
  /** Integration step, in ms. Default 33 (~30 Hz). */
  readonly tickMs?: number;
  /** Per-second damping on horizontal velocity while grounded. Higher
   *  values stop a slide sooner. Default 6 — `vx = 5` decays to ~`2.5`
   *  in ~115ms. */
  readonly friction?: number;
  /** Per-second pull toward `home.cx` once the body is grounded and
   *  has stopped sliding. Set to `0` to disable the spring (Brix stays
   *  wherever he lands). Default 8. */
  readonly springStrength?: number;
  /** Coefficient of restitution at floor impact (0..1).
   *
   *  - `0` (default): no bounce — Brix lands and sticks.
   *  - `0.4`–`0.6`:   reads as a "real" bounce that decays over a few hops.
   *  - `1`:           perfectly elastic, bounces forever (until you drop
   *                   below the per-impact rest threshold). */
  readonly bounce?: number;
  /** Hard caps on velocity after each impulse (absolute value).
   *  Stops chained impulses from stacking into unreadable mach-speed
   *  motion. Either axis can be omitted to leave that one unclamped. */
  readonly maxVelocity?: {
    readonly x?: number;
    readonly y?: number;
  };
  /** Hard caps on displacement from home (absolute value, in cells).
   *  `x` clamps `cx` to `[home.cx ± max]`; `y` clamps height above the
   *  floor. Applied every integration step so a body that would
   *  otherwise fly off the rendered canvas is corralled. */
  readonly maxOffset?: {
    readonly x?: number;
    readonly y?: number;
  };
  /** Resting position. Defaults to the brick's natural `cx = 7, y = 0`. */
  readonly home?: {
    readonly cx?: number;
    readonly y?: number;
  };
}

export interface BrixPhysicsApi {
  /** Live physics state — `cx`, `vx`, `y`, `vy`, `grounded`. */
  readonly state: BrickState;
  /** Integer cell offset from the home position. Apply to the
   *  rendered mascot via `marginLeft={offset.x}` and (because terminal
   *  rows grow downward but `y` measures height above the floor)
   *  `marginTop={-offset.y}` if the parent reserves headroom. */
  readonly offset: { readonly x: number; readonly y: number };
  /** Push velocity into the simulation. `vx` is cells/sec horizontal
   *  (positive = right); `vy` is cells/sec vertical (positive = up).
   *  Multiple impulses stack. */
  readonly impulse: (vx: number, vy: number) => void;
  /** Snap the body back to its home position, killing all velocity. */
  readonly reset: () => void;
}

/** Below this absolute horizontal speed we snap `vx` to zero so the
 *  spring can take over without a long crawl-to-stop. */
const VX_SNAP_THRESHOLD = 0.5;
/** Same for the spring's home-pull — within this distance we snap `cx`
 *  to home so the body parks cleanly. */
const HOME_SNAP_THRESHOLD = 0.4;

export function useBrixPhysics(opts: Readonly<UseBrixPhysicsOptions> = {}): BrixPhysicsApi {
  const gravity = opts.gravity ?? GRAVITY;
  const tickMs = opts.tickMs ?? 33;
  const friction = opts.friction ?? 6;
  const springStrength = opts.springStrength ?? 8;
  const bounce = opts.bounce ?? 0;
  const maxVx = opts.maxVelocity?.x ?? Number.POSITIVE_INFINITY;
  const maxVy = opts.maxVelocity?.y ?? Number.POSITIVE_INFINITY;
  const maxOffsetX = opts.maxOffset?.x ?? Number.POSITIVE_INFINITY;
  const maxOffsetY = opts.maxOffset?.y ?? Number.POSITIVE_INFINITY;
  const homeCx = opts.home?.cx ?? makeBrick().cx;
  const homeY = opts.home?.y ?? makeBrick().y;

  const [state, setState] = useState<BrickState>(() =>
    makeBrick({ cx: homeCx, y: homeY, grounded: true })
  );

  // Keep the integrator parameters in refs so the tick effect can stay
  // tied to "should we be running?" rather than restarting whenever a
  // tuning value happens to change.
  const paramsRef = useRef<IntegrateParams>({
    gravity,
    tickMs,
    friction,
    springStrength,
    bounce,
    maxOffsetX,
    maxOffsetY,
    homeCx,
    homeY,
  });
  paramsRef.current = {
    gravity,
    tickMs,
    friction,
    springStrength,
    bounce,
    maxOffsetX,
    maxOffsetY,
    homeCx,
    homeY,
  };

  const atRest =
    state.grounded && state.vx === 0 && state.vy === 0 && state.cx === homeCx && state.y === homeY;

  useEffect(() => {
    if (atRest) {
      return;
    }
    const id = setInterval(() => {
      setState((prev) => integrate(prev, paramsRef.current));
    }, paramsRef.current.tickMs);
    return () => clearInterval(id);
  }, [atRest]);

  const impulse = useCallback(
    (vx: number, vy: number) => {
      setState((prev) => ({
        ...prev,
        vx: clampMagnitude(prev.vx + vx, maxVx),
        vy: clampMagnitude(prev.vy + vy, maxVy),
        grounded: prev.y === 0 && vy <= 0,
      }));
    },
    [maxVx, maxVy]
  );

  const reset = useCallback(() => {
    setState(
      makeBrick({ cx: paramsRef.current.homeCx, y: paramsRef.current.homeY, grounded: true })
    );
  }, []);

  return {
    state,
    offset: { x: Math.round(state.cx - homeCx), y: Math.round(state.y) },
    impulse,
    reset,
  };
}

interface IntegrateParams {
  readonly gravity: number;
  readonly tickMs: number;
  readonly friction: number;
  readonly springStrength: number;
  readonly bounce: number;
  readonly maxOffsetX: number;
  readonly maxOffsetY: number;
  readonly homeCx: number;
  readonly homeY: number;
}

/** Clamp `v` into `[-max, max]`. `max = Infinity` is a no-op. */
function clampMagnitude(v: number, max: number): number {
  if (v > max) {
    return max;
  }
  if (v < -max) {
    return -max;
  }
  return v;
}

/** Stop position into the wall so a body pinned against the cap
 *  doesn't keep ticking against it. Returns the (possibly-clamped)
 *  position and the velocity zeroed-out only when it would push past
 *  the limit. `max = Infinity` is a no-op on both. */
function clampAxis(
  position: number,
  velocity: number,
  min: number,
  max: number
): { readonly position: number; readonly velocity: number } {
  if (position > max) {
    // Past the upper cap: clip outward velocity (positive) to 0.
    return { position: max, velocity: Math.min(velocity, 0) };
  }
  if (position < min) {
    // Past the lower cap: clip outward velocity (negative) to 0.
    return { position: min, velocity: Math.max(velocity, 0) };
  }
  return { position, velocity };
}

/** Friction + spring-back-to-home; only meaningful while grounded. */
function applyGroundForces(
  cx: number,
  vx: number,
  p: IntegrateParams
): { readonly cx: number; readonly vx: number } {
  const dt = p.tickMs / 1000;
  let newVx = vx * Math.max(0, 1 - p.friction * dt);
  if (Math.abs(newVx) < VX_SNAP_THRESHOLD) {
    newVx = 0;
  }
  let newCx = cx;
  if (newVx === 0 && p.springStrength > 0) {
    const delta = p.homeCx - newCx;
    newCx =
      Math.abs(delta) < HOME_SNAP_THRESHOLD ? p.homeCx : newCx + delta * p.springStrength * dt;
  }
  return { cx: newCx, vx: newVx };
}

/** One simulation step: gravity (via `step`, with optional bounce) →
 *  position clamps → ground friction → spring back to home. Pure so
 *  it's trivially testable. */
function integrate(prev: BrickState, p: IntegrateParams): BrickState {
  const next = step(prev, p.tickMs, p.gravity, p.bounce);
  const xClamp = clampAxis(next.cx, next.vx, p.homeCx - p.maxOffsetX, p.homeCx + p.maxOffsetX);
  const yClamp = clampAxis(next.y, next.vy, 0, p.maxOffsetY);
  if (!next.grounded) {
    return {
      ...next,
      cx: xClamp.position,
      vx: xClamp.velocity,
      y: yClamp.position,
      vy: yClamp.velocity,
    };
  }
  const ground = applyGroundForces(xClamp.position, xClamp.velocity, p);
  return { ...next, cx: ground.cx, vx: ground.vx, y: yClamp.position, vy: yClamp.velocity };
}
