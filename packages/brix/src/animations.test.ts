import { describe, expect, test } from 'bun:test';
import { ANIMATIONS, type AnimationKind } from './animations';

const ALL_KINDS: ReadonlyArray<AnimationKind> = [
  'loading',
  'thinking',
  'breathing',
  'talking',
  'sleep',
  'panic',
  'error',
  'startup',
  'blink',
  'glance',
  'wave',
  'dance',
  'nom',
  'hop',
  'oops',
  'celebrate',
  'love',
  'wink',
];

describe('ANIMATIONS', () => {
  test('every kind has at least two non-empty frames', () => {
    for (const kind of ALL_KINDS) {
      const anim = ANIMATIONS[kind];
      expect(anim.frames.length).toBeGreaterThanOrEqual(2);
      for (const f of anim.frames) {
        expect(f.length).toBeGreaterThan(0);
      }
    }
  });

  test('every kind has a sane interval (60ms ≤ interval ≤ 800ms)', () => {
    for (const kind of ALL_KINDS) {
      const { intervalMs } = ANIMATIONS[kind];
      expect(intervalMs).toBeGreaterThanOrEqual(60);
      expect(intervalMs).toBeLessThanOrEqual(800);
    }
  });

  test('startup is one-shot and lands on a ready frame', () => {
    const last = ANIMATIONS.startup.frames[ANIMATIONS.startup.frames.length - 1];
    expect(last).toContain('ready');
  });

  test('breathing weaves a closed-eye blink into the cycle', () => {
    const joined = ANIMATIONS.breathing.frames.join('|');
    expect(joined).toContain('(-◡-)');
  });

  test('celebrate carries a sparkle somewhere', () => {
    const joined = ANIMATIONS.celebrate.frames.join('|');
    expect(joined).toMatch(/[✦✧]/);
  });

  test('wave includes a hand glyph in every frame', () => {
    for (const f of ANIMATIONS.wave.frames) {
      expect(f).toMatch(/[\\/~]/);
    }
  });
});
