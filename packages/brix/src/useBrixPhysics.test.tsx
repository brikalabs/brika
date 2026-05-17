/**
 * Behavioural tests for `useBrixPhysics`. The integrator itself lives
 * in `physics.test.ts`; here we focus on the React surface: the hook
 * starts at rest, wakes on `impulse`, returns to rest after gravity +
 * friction settle, and snaps cleanly on `reset`.
 */

import { describe, expect, test } from 'bun:test';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import React, { useEffect } from 'react';
import { useBrixPhysics } from './useBrixPhysics';

interface ProbeProps {
  readonly onApi: (api: ReturnType<typeof useBrixPhysics>) => void;
}

function Probe({ onApi }: Readonly<ProbeProps>): React.ReactElement {
  const api = useBrixPhysics({ tickMs: 16, springStrength: 12, friction: 8 });
  useEffect(() => {
    onApi(api);
  }, [onApi, api]);
  return React.createElement(Text, null, `x=${api.offset.x} y=${api.offset.y}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(ok: () => boolean, timeoutMs = 3000, stepMs = 30): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (ok()) {
      return;
    }
    await sleep(stepMs);
  }
}

describe('useBrixPhysics', () => {
  test('starts at rest at home (offset 0,0, grounded)', async () => {
    const ref: { api: ReturnType<typeof useBrixPhysics> | null } = { api: null };
    const { unmount } = render(
      React.createElement(Probe, {
        onApi: (a) => {
          ref.api = a;
        },
      })
    );
    await sleep(40);
    expect(ref.api?.offset).toEqual({ x: 0, y: 0 });
    expect(ref.api?.state.grounded).toBe(true);
    unmount();
  });

  test('impulse with positive vy lifts Brix off the floor and gravity returns him', async () => {
    let lastY = 0;
    let peakY = 0;
    const { unmount } = render(
      React.createElement(Probe, {
        onApi: (a) => {
          lastY = a.offset.y;
          peakY = Math.max(peakY, lastY);
          // Fire one impulse on mount.
          if (a.state.vy === 0 && a.state.vx === 0 && peakY === 0) {
            a.impulse(0, 14);
          }
        },
      })
    );
    // Let the arc play out: launch → peak → land → settle.
    // Initial window covers a healthy local run; waitFor lets CI slow-paths
    // settle without a fixed timeout that races under load.
    await sleep(1200);
    await waitFor(() => peakY > 0 && lastY === 0);
    expect(peakY).toBeGreaterThan(0);
    expect(lastY).toBe(0); // landed back
    unmount();
  });

  test('horizontal impulse + friction + spring brings cx back home', async () => {
    let last: { x: number; y: number } = { x: 0, y: 0 };
    let kicked = false;
    const { unmount } = render(
      React.createElement(Probe, {
        onApi: (a) => {
          last = a.offset;
          if (!kicked) {
            kicked = true;
            // Pure horizontal kick — should slide, friction stops it,
            // spring walks cx back to 0 offset.
            a.impulse(4, 0);
          }
        },
      })
    );
    await sleep(1500);
    // Eventually returns to home (within snap threshold).
    expect(Math.abs(last.x)).toBeLessThanOrEqual(1);
    unmount();
  });

  test('reset() snaps the body back to home regardless of in-flight motion', async () => {
    const ref: { api: ReturnType<typeof useBrixPhysics> | null } = { api: null };
    const { unmount } = render(
      React.createElement(Probe, {
        onApi: (a) => {
          ref.api = a;
        },
      })
    );
    await sleep(20);
    ref.api?.impulse(8, 10);
    await sleep(60);
    ref.api?.reset();
    await waitFor(() => ref.api?.state.vx === 0 && ref.api?.state.vy === 0);
    expect(ref.api?.offset).toEqual({ x: 0, y: 0 });
    expect(ref.api?.state.vx).toBe(0);
    expect(ref.api?.state.vy).toBe(0);
    unmount();
  });
});
