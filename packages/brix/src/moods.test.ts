import { describe, expect, test } from 'bun:test';
import { ALL_MOODS, faceOf, type Mood } from './moods';

describe('faceOf', () => {
  test('default mood with round brackets', () => {
    expect(faceOf('default')).toBe('(◕◡◕)');
  });

  test('thinking mood with square brackets', () => {
    expect(faceOf('thinking', 'square')).toBe('[◔◡◔]');
  });

  test('sleep mood includes trailing zZ suffix', () => {
    expect(faceOf('sleep')).toBe('(-◡-) zZ');
  });

  test('happy with angle brackets', () => {
    expect(faceOf('happy', 'angle')).toBe('<^◡^>');
  });

  test('wink renders the asymmetric eye', () => {
    expect(faceOf('wink')).toBe('(^◡-)');
  });

  test('cheeky carries its musical note suffix', () => {
    expect(faceOf('cheeky')).toBe('(◕ᴗ◕) ♪');
  });

  test('shy keeps both angled eyes inside round brackets', () => {
    expect(faceOf('shy')).toBe('(>◡<)');
  });

  test('every declared mood resolves to a non-empty face', () => {
    for (const mood of ALL_MOODS) {
      const face = faceOf(mood);
      expect(face.length).toBeGreaterThan(0);
    }
  });
});

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
});
