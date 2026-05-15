/**
 * `@brika/brix` — Brix mascot system for the Brika CLI.
 *
 * Personality: cute, calm, observant, terminal-native — never
 * corporate, never verbose. Brix narrates softly, in lowercase,
 * leaning on a tiny set of expressive faces.
 */

export {
  ANIMATIONS,
  type Animation,
  type AnimationKind,
  type AnimationTag,
} from './animations';
export { BrixIdle, type BrixIdleProps } from './BrixIdle';
export { BrixTalking, type BrixTalkingProps } from './BrixTalking';
export {
  Bubble,
  type BubbleProps,
  type BubbleTail,
  type BubbleVariant,
} from './Bubble';
export { type BrixLog, type BrixSpinner, brix } from './brixLog';
export {
  DEFAULT_IDLE_PROGRAM,
  type IdleEmote,
  type IdleProgram,
  makeRng,
  pickIdleEmote,
} from './idle';
export { ALL_MOODS, type Bracket, faceOf, type Mood } from './moods';
export {
  expandReveal,
  type MoodToken,
  type PacingOptions,
  parseMoodScript,
  type RevealStep,
} from './script';
export { type FrameSeqOptions, type FrameSeqState, useFrameSeq } from './useFrameSeq';
