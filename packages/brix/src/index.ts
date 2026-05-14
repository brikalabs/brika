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
export { Brix, type BrixProps } from './Brix';
export { BrixAnimated, type BrixAnimatedProps } from './BrixAnimated';
export { BrixHeader, type BrixHeaderProps } from './BrixHeader';
export { BrixIdle, type BrixIdleProps } from './BrixIdle';
export { BrixSay, type BrixSayProps } from './BrixSay';
export { BrixStatusline, type BrixStatuslineProps } from './BrixStatusline';
export { BrixTalking, type BrixTalkingProps, type TalkMode } from './BrixTalking';
export {
  Bubble,
  type BubbleProps,
  type BubbleTail,
  type BubbleVariant,
} from './Bubble';
export { BRIKA_WORDMARK, brandLine, TAGLINE } from './brand';
export { type BrixLog, type BrixSpinner, brix } from './brixLog';
export {
  DEFAULT_IDLE_PROGRAM,
  type IdleEmote,
  type IdleProgram,
  makeRng,
  pickIdleEmote,
} from './idle';
export { ALL_MOODS, type Bracket, faceOf, type Mood } from './moods';
export { expandReveal, type MoodToken, parseMoodScript, type RevealStep } from './script';
export {
  HEARTS,
  NOTES,
  PETALS,
  pickSticker,
  SPARKLES,
  STARS,
  type StickerKind,
} from './stickers';
export { type FrameSeqOptions, type FrameSeqState, useFrameSeq } from './useFrameSeq';
