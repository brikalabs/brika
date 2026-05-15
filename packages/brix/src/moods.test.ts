import { describe, expect, test } from 'bun:test';
import { ALL_MOODS, type Mood } from './moods';

describe('ALL_MOODS', () => {
  test('contains every documented mood', () => {
    const expected: ReadonlyArray<Mood> = [
      'default',
      'idle',
      'happy',
      'excited',
      'thinking',
      'focused',
      'curious',
      'sleep',
      'sad',
      'error',
      'dead',
      'panic',
      'angry',
      'suspicious',
      'love',
      'cool',
      'loading',
      'success',
      'wink',
      'shy',
      'proud',
      'tired',
      'oops',
      'woah',
      'boop',
      'cheeky',
      'starry',
    ];
    expect(new Set(ALL_MOODS)).toEqual(new Set(expected));
  });

  test('has no duplicates', () => {
    expect(new Set(ALL_MOODS).size).toBe(ALL_MOODS.length);
  });
});
