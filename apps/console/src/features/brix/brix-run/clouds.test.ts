/**
 * Unit tests for the parallax cloud layer. `tickClouds` is deterministic
 * in motion but uses `rand()` when a cloud respawns; we only assert the
 * observable invariants (count preserved, motion direction, recycle
 * coordinate on the right) — never a specific glyph.
 */

import { describe, expect, test } from 'bun:test';
import { type Cloud, cloudCount, makeInitialClouds, tickClouds } from './clouds';
import { CLOUD_SPEED_RATIO } from './constants';

describe('cloudCount', () => {
  test('clamps to at least 3 for narrow worlds', () => {
    expect(cloudCount(10)).toBe(3);
    expect(cloudCount(0)).toBe(3);
  });

  test('clamps to at most 12 for very wide worlds', () => {
    expect(cloudCount(500)).toBe(12);
  });

  test('scales 1-per-10 cells inside the band', () => {
    expect(cloudCount(60)).toBe(6);
    expect(cloudCount(80)).toBe(8);
  });
});

describe('makeInitialClouds', () => {
  test('produces exactly cloudCount(width) clouds', () => {
    const clouds = makeInitialClouds(60);
    expect(clouds).toHaveLength(cloudCount(60));
  });

  test('every cloud has a non-empty glyph and a finite x position', () => {
    const clouds = makeInitialClouds(80);
    for (const c of clouds) {
      expect(c.glyph.length).toBeGreaterThan(0);
      expect(Number.isFinite(c.x)).toBe(true);
      expect(Number.isFinite(c.y)).toBe(true);
    }
  });

  test('assigns sequential ids starting at 1', () => {
    const clouds = makeInitialClouds(60);
    const ids = clouds.map((c) => c.id).sort((a, b) => a - b);
    expect(ids[0]).toBe(1);
    expect(ids[ids.length - 1]).toBe(clouds.length);
  });
});

describe('tickClouds', () => {
  test('preserves the cloud count on every tick', () => {
    const clouds = makeInitialClouds(60);
    const ticked = tickClouds(clouds, 0.1, 10, 60);
    expect(ticked).toHaveLength(clouds.length);
  });

  test('on-screen clouds drift left by scrollSpeed * CLOUD_SPEED_RATIO * dt', () => {
    const cloud: Cloud = { id: 1, x: 40, y: 0, glyph: '~⌒~' };
    const ticked = tickClouds([cloud], 0.5, 10, 60);
    const expected = 40 - 10 * CLOUD_SPEED_RATIO * 0.5;
    expect(ticked[0]?.x).toBeCloseTo(expected, 5);
  });

  test('preserves the cloud id when a cloud merely drifts', () => {
    const cloud: Cloud = { id: 7, x: 30, y: 0, glyph: '◌◌◌' };
    const ticked = tickClouds([cloud], 0.1, 10, 60);
    expect(ticked[0]?.id).toBe(7);
  });

  test('a cloud whose glyph fully exited the left edge respawns on the right', () => {
    const cloud: Cloud = { id: 1, x: -10, y: 0, glyph: '~⌒~' };
    const ticked = tickClouds([cloud], 1, 100, 60);
    // After recycling the new x must be ≥ worldWidth.
    expect(ticked[0]?.x).toBeGreaterThanOrEqual(60);
    expect(ticked[0]?.id).toBe(1);
  });

  test('empty cloud list → empty output (no crash)', () => {
    expect(tickClouds([], 0.1, 10, 60)).toEqual([]);
  });
});
