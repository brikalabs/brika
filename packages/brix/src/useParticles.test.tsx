/**
 * Tests for `useParticles` — the React adapter that runs the particle
 * simulation on its own interval and returns the rasterized layer. We
 * verify the rasterized output is a Sprite of the requested size, that
 * particles accumulate over time, and that unmount tears the interval
 * down cleanly.
 */

import { describe, expect, test } from 'bun:test';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import React from 'react';
import { sparkles } from './particleEmitters';
import type { Sprite } from './sprite';
import { useParticles } from './useParticles';

function flush(ms = 250): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ProbeProps {
  readonly emitterKey: number;
  readonly width: number;
  readonly height: number;
  readonly seed?: number;
  readonly active?: boolean;
  readonly onSprite: (s: Sprite) => void;
}

function Probe({
  emitterKey,
  width,
  height,
  seed,
  active,
  onSprite,
}: Readonly<ProbeProps>): React.ReactElement {
  const emitter = React.useMemo(
    () => sparkles({ x: 0, y: 0, w: width, h: height }, { rate: 30 }),
    // emitterKey lets a test deliberately swap the emitter to reset particles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [emitterKey, width, height]
  );
  const sprite = useParticles(emitter, { width, height, seed, active });
  onSprite(sprite);
  return React.createElement(Text, null, '.');
}

describe('useParticles', () => {
  test('returns a sprite sized to width/height when active', async () => {
    const latest: { current: Sprite | null } = { current: null };
    const { unmount } = render(
      React.createElement(Probe, {
        emitterKey: 1,
        width: 8,
        height: 3,
        seed: 1,
        onSprite: (s) => {
          latest.current = s;
        },
      })
    );
    await flush();
    expect(latest.current?.width).toBe(8);
    expect(latest.current?.height).toBe(3);
    unmount();
  });

  test('produces particles after at least one tick', async () => {
    const latest: { current: Sprite | null } = { current: null };
    const { unmount } = render(
      React.createElement(Probe, {
        emitterKey: 1,
        width: 10,
        height: 4,
        seed: 7,
        onSprite: (s) => {
          latest.current = s;
        },
      })
    );
    await flush();
    // Look for any opaque cell in the rasterized field.
    const hasAny = latest.current?.rows.some((row) => row.some((cell) => cell !== null));
    expect(hasAny).toBe(true);
    unmount();
  });

  test('skips simulation when inactive — sprite stays empty', async () => {
    const latest: { current: Sprite | null } = { current: null };
    const { unmount } = render(
      React.createElement(Probe, {
        emitterKey: 1,
        width: 8,
        height: 3,
        active: false,
        onSprite: (s) => {
          latest.current = s;
        },
      })
    );
    await flush();
    const hasAny = latest.current?.rows.some((row) => row.some((cell) => cell !== null));
    expect(hasAny).toBe(false);
    unmount();
  });

  test('cleanup on unmount cancels the simulation interval', async () => {
    let renders = 0;
    const { unmount } = render(
      React.createElement(Probe, {
        emitterKey: 1,
        width: 6,
        height: 3,
        onSprite: () => {
          renders += 1;
        },
      })
    );
    await flush();
    const before = renders;
    unmount();
    await flush();
    // After unmount the simulation must not push any further updates.
    expect(renders).toBe(before);
  });
});
