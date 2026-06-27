/**
 * Sanity checks for the `poop` emote — verifies the EmoteDef shape
 * produced by `defineEmote` matches the contract the stage expects
 * (mood/color, non-empty beats compile to a non-empty timeline, and
 * an optional particle emitter that takes an origin and returns an
 * Emitter).
 */

import { describe, expect, test } from 'bun:test';
import { poopEmote } from './poop';

describe('poopEmote', () => {
  test('exposes the expected metadata', () => {
    expect(poopEmote.name).toBe('poop');
    expect(poopEmote.mood).toBe('shy');
    expect(poopEmote.color).toBe('yellow');
    expect(poopEmote.line).toContain('business');
    expect(poopEmote.hold).toBe(700);
  });

  test('compiles to a non-empty looping timeline', () => {
    expect(poopEmote.timeline.tracks.length).toBeGreaterThan(0);
    expect(poopEmote.timeline.loop).toBe(true);
    const frames = poopEmote.timeline.tracks[0]?.clip.frames ?? [];
    expect(frames.length).toBeGreaterThan(0);
  });

  test('per-frame state array is parallel to the timeline frames', () => {
    const frames = poopEmote.timeline.tracks[0]?.clip.frames ?? [];
    expect(poopEmote.states).toHaveLength(frames.length);
    for (const state of poopEmote.states) {
      expect(typeof state.cx).toBe('number');
      expect(typeof state.w).toBe('number');
      expect(typeof state.h).toBe('number');
      expect(state.face).toBeDefined();
    }
  });

  test('particles factory returns an emitter with a spawn function', () => {
    expect(poopEmote.particles).toBeDefined();
    const emitter = poopEmote.particles?.({ x: 0, y: 0, w: 15, h: 7 });
    expect(emitter).toBeDefined();
    expect(typeof emitter?.spawn).toBe('function');
  });
});
