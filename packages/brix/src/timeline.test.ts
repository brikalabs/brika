import { describe, expect, test } from 'bun:test';
import { parseSprite } from './sprite';
import {
  clip,
  clipDuration,
  clipFrameAt,
  parallel,
  sequence,
  timeline,
  timelineDone,
  timelineDuration,
  tracksAt,
} from './timeline';

const A = parseSprite('A');
const B = parseSprite('B');
const C = parseSprite('C');

describe('clipDuration', () => {
  test('uniform durations multiply by frame count', () => {
    expect(clipDuration(clip([A, B, C], 100))).toBe(300);
  });

  test('per-frame array sums', () => {
    expect(clipDuration(clip([A, B, C], [100, 200, 50]))).toBe(350);
  });

  test('per-frame array repeats its last entry when short', () => {
    expect(clipDuration(clip([A, B, C], [100]))).toBe(300);
  });
});

describe('clipFrameAt', () => {
  test('lands on frame i for uniform timing', () => {
    const c = clip([A, B, C], 100);
    expect(clipFrameAt(c, 0)?.rows[0]?.[0]?.ch).toBe('A');
    expect(clipFrameAt(c, 150)?.rows[0]?.[0]?.ch).toBe('B');
    expect(clipFrameAt(c, 250)?.rows[0]?.[0]?.ch).toBe('C');
  });

  test('loops by default', () => {
    const c = clip([A, B], 100);
    expect(clipFrameAt(c, 250)?.rows[0]?.[0]?.ch).toBe('A');
    expect(clipFrameAt(c, 350)?.rows[0]?.[0]?.ch).toBe('B');
  });

  test('pins last frame when non-looping and past end', () => {
    const c = clip([A, B], 100, { loop: false });
    expect(clipFrameAt(c, 10_000)?.rows[0]?.[0]?.ch).toBe('B');
  });

  test('returns first frame for negative time', () => {
    const c = clip([A, B], 100, { loop: false });
    expect(clipFrameAt(c, -50)?.rows[0]?.[0]?.ch).toBe('A');
  });

  test('returns null for an empty clip', () => {
    expect(clipFrameAt(clip([], 100), 0)).toBeNull();
  });
});

describe('sequence', () => {
  test('packs clips back-to-back', () => {
    const tl = sequence([clip([A], 100, { loop: false }), clip([B], 200, { loop: false })]);
    expect(timelineDuration(tl)).toBe(300);
    expect(tracksAt(tl, 50)[0]?.rows[0]?.[0]?.ch).toBe('A');
    expect(tracksAt(tl, 150)[0]?.rows[0]?.[0]?.ch).toBe('B');
  });

  test('respects timeline loop flag', () => {
    const tl = sequence([clip([A], 100, { loop: false }), clip([B], 100, { loop: false })], {
      loop: true,
    });
    expect(tracksAt(tl, 250)[0]?.rows[0]?.[0]?.ch).toBe('A');
  });
});

describe('parallel', () => {
  test('returns one sprite per running clip', () => {
    const tl = parallel([clip([A], 100), clip([B], 100)]);
    const out = tracksAt(tl, 50);
    expect(out).toHaveLength(2);
    expect(out[0]?.rows[0]?.[0]?.ch).toBe('A');
    expect(out[1]?.rows[0]?.[0]?.ch).toBe('B');
  });
});

describe('timeline / timelineDone', () => {
  test('track delays push start time', () => {
    const tl = timeline([{ clip: clip([A], 100, { loop: false }), delay: 200 }]);
    expect(tracksAt(tl, 50)).toHaveLength(0);
    expect(tracksAt(tl, 250)[0]?.rows[0]?.[0]?.ch).toBe('A');
  });

  test('timelineDone fires only for non-looping past total', () => {
    const tl = sequence([clip([A], 100, { loop: false })]);
    expect(timelineDone(tl, 50)).toBe(false);
    expect(timelineDone(tl, 200)).toBe(true);
  });

  test('looping timeline is never done', () => {
    const tl = parallel([clip([A, B], 100)], { loop: true });
    expect(timelineDone(tl, 99_999)).toBe(false);
  });
});
