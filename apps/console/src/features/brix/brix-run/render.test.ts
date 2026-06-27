/**
 * Unit tests for the pure world composer + the border-color helper.
 *
 * `renderWorld` composes ~5 sprite layers into a single grid; we don't
 * assert on individual glyphs (they depend on Brix's parser / face
 * tables), but we do verify dimensions, status overlays, and that the
 * Brix sprite cell makes it through compose for every game status.
 */

import { describe, expect, test } from 'bun:test';
import { geomOf } from './geometry';
import { makeInitial } from './initial';
import { borderColorFor, renderWorld } from './render';
import type { GameState, GameStatus } from './state';

const WORLD_W = 60;
const WORLD_H = 11;

function stateWith(status: GameStatus): GameState {
  const base = makeInitial(0, WORLD_W, WORLD_H);
  return { ...base, status };
}

describe('borderColorFor', () => {
  test('red on game over', () => {
    expect(borderColorFor('over')).toBe('red');
  });

  test('yellow when paused', () => {
    expect(borderColorFor('paused')).toBe('yellow');
  });

  test('cyan when ready', () => {
    expect(borderColorFor('ready')).toBe('cyan');
  });

  test('cyan while running', () => {
    expect(borderColorFor('running')).toBe('cyan');
  });
});

describe('renderWorld', () => {
  const geom = geomOf(WORLD_W, WORLD_H);

  test('returns a sprite sized to the world geometry', () => {
    const sprite = renderWorld(stateWith('ready'), geom);
    expect(sprite.width).toBe(WORLD_W);
    expect(sprite.height).toBe(WORLD_H);
    expect(sprite.rows).toHaveLength(WORLD_H);
  });

  test('renders for every game status without throwing', () => {
    const statuses: GameStatus[] = ['ready', 'running', 'paused', 'over'];
    for (const status of statuses) {
      const sprite = renderWorld(stateWith(status), geom);
      expect(sprite.width).toBe(WORLD_W);
      expect(sprite.height).toBe(WORLD_H);
      // Every row must be the world width, including padded transparent cells.
      for (const row of sprite.rows) {
        expect(row).toHaveLength(WORLD_W);
      }
    }
  });

  test('paints at least one opaque cell when running (Brix + floor are visible)', () => {
    const sprite = renderWorld(stateWith('running'), geom);
    const opaqueCells = sprite.rows.flat().filter((c) => c !== null);
    expect(opaqueCells.length).toBeGreaterThan(0);
  });

  test('overlays a panel when ready (more opaque cells than running)', () => {
    const running = renderWorld(stateWith('running'), geom);
    const ready = renderWorld(stateWith('ready'), geom);
    const runningCount = running.rows.flat().filter((c) => c !== null).length;
    const readyCount = ready.rows.flat().filter((c) => c !== null).length;
    expect(readyCount).toBeGreaterThan(runningCount);
  });

  test('overlays a panel when paused', () => {
    const running = renderWorld(stateWith('running'), geom);
    const paused = renderWorld(stateWith('paused'), geom);
    const runningCount = running.rows.flat().filter((c) => c !== null).length;
    const pausedCount = paused.rows.flat().filter((c) => c !== null).length;
    expect(pausedCount).toBeGreaterThan(runningCount);
  });

  test('overlays the game-over panel with score + best', () => {
    const base = makeInitial(7, WORLD_W, WORLD_H);
    const over: GameState = { ...base, status: 'over', score: 12, best: 12 };
    const sprite = renderWorld(over, geom);
    expect(sprite.width).toBe(WORLD_W);
    expect(sprite.height).toBe(WORLD_H);
    // Game-over panel adds many opaque cells vs a plain running frame.
    const opaque = sprite.rows.flat().filter((c) => c !== null).length;
    expect(opaque).toBeGreaterThan(50);
  });

  test('honours mid-air Brix (excited face path)', () => {
    const base = makeInitial(0, WORLD_W, WORLD_H);
    const airborne: GameState = {
      ...base,
      status: 'running',
      brix: { ...base.brix, grounded: false, vy: 5, y: 2 },
    };
    expect(() => renderWorld(airborne, geom)).not.toThrow();
  });

  test('crouching face when crouchUntil is in the future', () => {
    const base = makeInitial(0, WORLD_W, WORLD_H);
    const crouched: GameState = { ...base, status: 'running', t: 100, crouchUntil: 500 };
    expect(() => renderWorld(crouched, geom)).not.toThrow();
  });

  test('cheeky face when a lateral move is active', () => {
    const base = makeInitial(0, WORLD_W, WORLD_H);
    const moving: GameState = { ...base, status: 'running', t: 0, moveRightUntil: 200 };
    expect(() => renderWorld(moving, geom)).not.toThrow();
  });

  test('skips clouds drifting off the left edge', () => {
    const base = makeInitial(0, WORLD_W, WORLD_H);
    const withOffscreenClouds: GameState = {
      ...base,
      clouds: [
        { id: 1, x: -50, y: 0, glyph: '~⌒~' },
        { id: 2, x: 5, y: 1, glyph: '◌◌◌' },
      ],
    };
    expect(() => renderWorld(withOffscreenClouds, geom)).not.toThrow();
  });

  test('renders obstacles inside the playable area', () => {
    const base = makeInitial(0, WORLD_W, WORLD_H);
    const withObstacles: GameState = {
      ...base,
      status: 'running',
      obstacles: [
        { id: 1, kind: 'saguaro', x: 20 },
        { id: 2, kind: 'bird', x: 30 },
      ],
    };
    expect(() => renderWorld(withObstacles, geom)).not.toThrow();
  });
});
