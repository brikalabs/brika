/**
 * Unit tests for the READY / PAUSED / GAME OVER overlay sprites. We
 * verify the panel container's dimensions and the new-high-score
 * highlight branch; specific glyph cells are an implementation detail
 * of the brix parser.
 */

import { describe, expect, test } from 'bun:test';
import { gameOverPanel, pausedPanel, readyPanel } from './panels';

function hasGlyph(
  sprite: { rows: ReadonlyArray<ReadonlyArray<{ ch: string } | null>> },
  glyph: string
): boolean {
  return sprite.rows.some((row) => row.some((c) => c?.ch === glyph));
}

describe('readyPanel', () => {
  test('produces a positive-sized sprite', () => {
    const sprite = readyPanel(true);
    expect(sprite.width).toBeGreaterThan(0);
    expect(sprite.height).toBeGreaterThan(0);
  });

  test('blink=true includes the ▸ press-to-play marker; blink=false hides it', () => {
    expect(hasGlyph(readyPanel(true), '▸')).toBe(true);
    expect(hasGlyph(readyPanel(false), '▸')).toBe(false);
  });

  test('both blink states share the same panel dimensions', () => {
    const a = readyPanel(true);
    const b = readyPanel(false);
    expect(a.width).toBe(b.width);
    expect(a.height).toBe(b.height);
  });
});

describe('pausedPanel', () => {
  test('produces a positive-sized sprite', () => {
    const sprite = pausedPanel();
    expect(sprite.width).toBeGreaterThan(0);
    expect(sprite.height).toBeGreaterThan(0);
  });

  test('is more compact than the ready panel (fewer rows)', () => {
    expect(pausedPanel().height).toBeLessThan(readyPanel(true).height);
  });
});

describe('gameOverPanel', () => {
  test('produces a positive-sized sprite for a regular run', () => {
    const sprite = gameOverPanel(5, 10);
    expect(sprite.width).toBeGreaterThan(0);
    expect(sprite.height).toBeGreaterThan(0);
  });

  test('a new high score includes the ★ highlight marker', () => {
    expect(hasGlyph(gameOverPanel(15, 15), '★')).toBe(true);
  });

  test('a beaten run does not include the ★ highlight marker', () => {
    expect(hasGlyph(gameOverPanel(5, 10), '★')).toBe(false);
  });

  test('zero score never triggers the new-high-score highlight even when score == best', () => {
    expect(hasGlyph(gameOverPanel(0, 0), '★')).toBe(false);
  });
});
