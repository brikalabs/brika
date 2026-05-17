/**
 * `@brika/brix` — Brix mascot system for the Brika CLI.
 *
 * Personality: cute, calm, observant, terminal-native — never
 * corporate, never verbose. Brix narrates softly, in lowercase,
 * leaning on a tiny set of expressive faces.
 *
 * The mascot is rendered as a composed multi-row sprite stage:
 * `<BrixStage>` + `<EmoteProvider>` drive Brix's face, body, and
 * particles via the global emote bus, with speech rendered through
 * `<Bubble>` and pacing primitives from `script.ts`.
 */

export {
  BrixPhysicsProvider,
  type BrixPhysicsProviderProps,
  useBrixImpulse,
} from './BrixPhysicsProvider';
export { BrixStage, type BrixStageProps } from './BrixStage';
export {
  Bubble,
  type BubbleContentRenderer,
  type BubbleProps,
  type BubbleTail,
  type BubbleVariant,
} from './Bubble';
export { type BrickRender, renderBrick, type StageGeom } from './brick';
export {
  type EmoteApi,
  EmoteProvider,
  type EmoteProviderProps,
  type PlayOptions,
  useEmote,
  useEmoteOn,
} from './EmoteProvider';
export {
  type Beat,
  defineEmote,
  EMOTE_IDLE,
  EMOTE_LIBRARY,
  type EmoteDef,
  type EmoteName,
  type EmoteSpec,
  type FaceInput,
} from './emotes';
export { ALL_MOODS, type Mood } from './moods';
export {
  CONFETTI_CHARS,
  confetti,
  type EmitterTuning,
  HEART_CHARS,
  hearts,
  NOTE_CHARS,
  notes,
  type Origin,
  rateEmitter,
  SPARKLE_CHARS,
  sparkles,
  TEAR_CHARS,
  tears,
  Z_CHARS,
  zZz,
} from './particleEmitters';
export {
  type Emitter,
  emptyField,
  type Particle,
  type ParticleField,
  renderField,
  stepField,
} from './particles';
export { type BrickState, GRAVITY, makeBrick, step as stepPhysics } from './physics';
export { SpriteView, type SpriteViewProps } from './SpriteView';
export {
  expandReveal,
  type MoodToken,
  type PacingOptions,
  parseMoodScript,
  type RevealStep,
} from './script';
export {
  type CanvasSize,
  type Cell,
  compose,
  EMPTY_SPRITE,
  type LayerInput,
  type LayerPlacement,
  type ParseOptions,
  parseSprite,
  type Sprite,
  type SpriteRow,
  tint,
  translate,
} from './sprite';
export {
  FACE_BLINK,
  FACE_BY_NAME,
  FACE_CHEEKY,
  FACE_COOL,
  FACE_CURIOUS,
  FACE_DEAD,
  FACE_EXCITED,
  FACE_FOCUS,
  FACE_HAPPY,
  FACE_LOVE,
  FACE_NEUTRAL,
  FACE_OOPS,
  FACE_PANIC,
  FACE_SHY,
  FACE_SLEEPY,
  FACE_STARRY,
  FACE_SUSPICIOUS,
  FACE_THINKING,
  FACE_TIRED,
  FACE_WINK,
  type FaceName,
  FLOOR_SPRITE,
  floorSprite,
  STAGE_FLOOR_LINE_Y,
  STAGE_FLOOR_Y,
  STAGE_GEOM,
  STAGE_HEIGHT,
  STAGE_WIDTH,
} from './stageSprites';
export {
  type Clip,
  clip,
  clipDuration,
  clipFrameAt,
  clipFrameIndexAt,
  parallel,
  sequence,
  type Timeline,
  type Track,
  timeline,
  timelineDone,
  timelineDuration,
  track,
  tracksAt,
} from './timeline';
export {
  type BrixPhysicsApi,
  type UseBrixPhysicsOptions,
  useBrixPhysics,
} from './useBrixPhysics';
export { type UseParticlesOpts, useParticles } from './useParticles';
export { type TimelineState, type UseTimelineOptions, useTimeline } from './useTimeline';
