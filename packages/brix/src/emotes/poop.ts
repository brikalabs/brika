/**
 * Poop — Brix's most undignified loop. Squats into a low pose, strains
 * with cycling pained faces while wobbling left-right, then erupts
 * into relief. A tiny puff of dust drifts up around him the whole
 * time. Uses the underscore-mouth face family (vacant → squint → sob →
 * glee → delight) added for this exact occasion.
 */

import { type Origin, rateEmitter } from '../particleEmitters';
import { defineEmote } from './builder';

const PUFF_CHARS = ['·', '°', '.', ','] as const;

export const poopEmote = defineEmote('poop', {
  mood: 'shy',
  color: 'yellow',
  line: '{:shy:}brb… business',
  hold: 700,
  loop: true,
  // Small dust puff around the feet — drifts up like an unfortunate aura.
  particles: (o: Origin) =>
    rateEmitter({
      origin: { x: o.x + Math.floor(o.w / 2) - 2, y: o.y + 4, w: 5, h: 1 },
      rate: 3,
      make: (rng, src) => ({
        x: src.x + rng() * src.w,
        y: src.y,
        vx: (rng() - 0.5) * 0.4,
        vy: -0.3 - rng() * 0.2,
        ax: 0,
        ay: 0,
        age: 0,
        life: 900 + rng() * 400,
        chars: PUFF_CHARS,
        color: 'yellow',
        dim: true,
      }),
    }),
  initial: { face: 'focus' },
  beats: [
    // Survey — look around shiftily before committing.
    { kind: 'face', face: 'peek' },
    { kind: 'tween', cx: 6, ms: 220 },
    { kind: 'tween', cx: 8, ms: 220 },
    { kind: 'tween', cx: 7, ms: 180 },

    // Commit — drop into a wide low squat (h=2 reads as a real crouch).
    { kind: 'face', face: 'vacant' },
    { kind: 'tween', h: 2, w: 6, ms: 220, ease: 'easeIn' },
    { kind: 'wait', ms: 200 },

    // Push 1 — body squeezes outward as effort applies, then relaxes.
    { kind: 'face', face: 'squint' },
    { kind: 'tween', w: 7, ms: 180, ease: 'easeOut' },
    { kind: 'tween', w: 5, ms: 140, ease: 'easeIn' },

    // Push 2 — bigger sob, body bulges further.
    { kind: 'face', face: 'sob' },
    { kind: 'tween', w: 9, ms: 220, ease: 'easeOut' },
    { kind: 'tween', w: 5, ms: 160, ease: 'easeIn' },

    // Resignation pause.
    { kind: 'face', face: 'disapprove' },
    { kind: 'wait', ms: 350 },

    // RELEASE — body snaps narrow in relief, face beams.
    { kind: 'face', face: 'glee' },
    { kind: 'tween', w: 3, ms: 90, ease: 'easeOut' },
    { kind: 'tween', w: 5, ms: 180, ease: 'easeOut' },
    { kind: 'wait', ms: 350 },

    // Stand back up, satisfied — quick "ahh that's better" stretch.
    { kind: 'tween', h: 3, ms: 220, ease: 'easeOut' },
    { kind: 'face', face: 'delight' },
    { kind: 'tween', h: 4, ms: 130, ease: 'easeOut' },
    { kind: 'tween', h: 3, ms: 130, ease: 'easeIn' },
    { kind: 'wait', ms: 400 },
  ],
});
