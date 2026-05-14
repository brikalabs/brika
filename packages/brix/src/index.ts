/**
 * `@brika/brix` — Brix mascot system for the Brika CLI.
 *
 * Personality: cute, calm, observant, terminal-native — never
 * corporate, never verbose. Brix narrates softly, in lowercase,
 * leaning on a tiny set of expressive faces.
 */

export { ANIMATIONS, type Animation, type AnimationKind } from './animations';
export { Brix, type BrixProps } from './Brix';
export { BrixAnimated, type BrixAnimatedProps } from './BrixAnimated';
export { BrixHeader, type BrixHeaderProps } from './BrixHeader';
export { BrixSay, type BrixSayProps } from './BrixSay';
export { BrixStatusline, type BrixStatuslineProps } from './BrixStatusline';
export { BrixTalking, type BrixTalkingProps, type TalkMode } from './BrixTalking';
export { BRIKA_WORDMARK, brandLine, TAGLINE } from './brand';
export { type BrixLog, type BrixSpinner, brix } from './brixLog';
export { ALL_MOODS, type Bracket, faceOf, type Mood } from './moods';
export { expandReveal, type MoodToken, parseMoodScript, type RevealStep } from './script';
