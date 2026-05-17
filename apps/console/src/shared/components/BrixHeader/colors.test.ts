import { describe, expect, test } from 'bun:test';
import type { Mood } from '@brika/brix';
import { colorForMood } from './colors';

describe('colorForMood', () => {
  test.each<readonly [Mood, string]>([
    ['happy', 'green'],
    ['success', 'green'],
    ['proud', 'green'],
    ['error', 'red'],
    ['angry', 'red'],
    ['dead', 'red'],
    ['sleep', 'gray'],
    ['tired', 'gray'],
    ['oops', 'yellow'],
    ['starry', 'yellow'],
    ['love', 'magenta'],
    ['cheeky', 'magenta'],
    ['wink', 'magenta'],
  ])('%s → %s', (mood, tint) => {
    expect(colorForMood(mood)).toBe(tint);
  });

  test('unmapped mood falls back to cyan', () => {
    expect(colorForMood('idle')).toBe('cyan');
    expect(colorForMood('thinking')).toBe('cyan');
    expect(colorForMood('cool')).toBe('cyan');
  });
});
