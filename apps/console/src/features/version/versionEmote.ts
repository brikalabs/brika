import { confetti, defineEmote, type EmoteDef, type Origin } from '@brika/brix';

const FOREVER_HOLD_MS = 60_000;

export function buildVersionEmote(): EmoteDef {
  return defineEmote('version', {
    mood: 'starry',
    color: 'cyan',
    hold: FOREVER_HOLD_MS,
    priority: 5,
    particles: (o: Origin) => confetti({ x: o.x + 1, y: o.y, w: o.w - 2, h: o.h }),
    initial: { face: 'happy' },
    beats: [
      { kind: 'tween', cx: 5, ms: 140, ease: 'easeOut' },
      { kind: 'tween', cx: 9, ms: 180, ease: 'easeOut' },
      { kind: 'tween', cx: 7, ms: 140, ease: 'easeOut' },
      { kind: 'tween', h: 2, ms: 120, ease: 'easeIn' },
      { kind: 'tween', h: 4, ms: 100, ease: 'easeOut' },
      { kind: 'face', face: 'starry' },
      { kind: 'impulse', vy: 12 },
      { kind: 'waitLand', maxMs: 1500 },
      { kind: 'tween', h: 2, ms: 100, ease: 'easeIn' },
      { kind: 'tween', h: 3, ms: 140, ease: 'easeOut' },
      { kind: 'face', face: 'happy' },
      { kind: 'wait', ms: 220 },
      { kind: 'face', face: 'love' },
      { kind: 'wait', ms: 240 },
    ],
  });
}
