/**
 * Aggregated emote catalog. Each emote is defined in its own file so
 * editing one doesn't drag the others around — and adding a new one
 * is just: create `./foo.ts`, `defineEmote('foo', …)`, then add a
 * line below.
 *
 * `satisfies` (instead of a `Record<string, EmoteDef>` annotation)
 * keeps the literal property names in the inferred type, so
 * `EmoteName` ends up as `'idle' | 'wave' | …` and consumers get
 * compile-time typo protection.
 */

export { type Beat, defineEmote, type EmoteSpec, type FaceInput } from './builder';
export type { EmoteDef } from './types';

import { boogieEmote } from './boogie';
import { bowEmote } from './bow';
import { celebrateEmote } from './celebrate';
import { coolEmote } from './cool';
import { crouchEmote } from './crouch';
import { cryEmote } from './cry';
import { danceEmote } from './dance';
import { dashEmote, fleeEmote } from './dash';
import { deadEmote } from './dead';
import { hopEmote } from './hop';
import { idleEmote } from './idle';
import { loveEmote } from './love';
import { nodEmote } from './nod';
import { nomEmote } from './nom';
import { oopsEmote } from './oops';
import { panicEmote } from './panic';
import { patrolEmote, wanderingEmote } from './patrol';
import { peekEmote } from './peek';
import { poopEmote } from './poop';
import { shakeEmote } from './shake';
import { shockEmote } from './shock';
import { sleepEmote } from './sleep';
import { somersaultEmote } from './somersault';
import { thinkEmote } from './think';
import type { EmoteDef } from './types';
import { waveEmote } from './wave';
import { winkEmote } from './wink';
import { wraparoundEmote } from './wraparound';
import { yawnEmote } from './yawn';

export const EMOTE_LIBRARY = {
  idle: idleEmote,
  wave: waveEmote,
  celebrate: celebrateEmote,
  hop: hopEmote,
  sleep: sleepEmote,
  love: loveEmote,
  dance: danceEmote,
  oops: oopsEmote,
  panic: panicEmote,
  think: thinkEmote,
  nom: nomEmote,
  wink: winkEmote,
  cool: coolEmote,
  dead: deadEmote,
  crouch: crouchEmote,
  cry: cryEmote,
  bow: bowEmote,
  shock: shockEmote,
  yawn: yawnEmote,
  nod: nodEmote,
  shake: shakeEmote,
  dash: dashEmote,
  flee: fleeEmote,
  patrol: patrolEmote,
  wandering: wanderingEmote,
  peek: peekEmote,
  wraparound: wraparoundEmote,
  boogie: boogieEmote,
  somersault: somersaultEmote,
  poop: poopEmote,
} satisfies Readonly<Record<string, EmoteDef>>;

export type EmoteName = keyof typeof EMOTE_LIBRARY;

/** Default fallback the stage falls back to when nothing is playing. */
export { idleEmote as EMOTE_IDLE } from './idle';
