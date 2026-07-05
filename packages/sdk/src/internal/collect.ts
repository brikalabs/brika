/**
 * Build-time capability collector (`@brika/sdk/collect`).
 *
 * The collect contract (sink + zod lowering) lives in `@brika/schema/collect`,
 * the leaf package, so `@brika/compiler` consumes it without depending on the
 * SDK. This module re-exports it and adds `installBuildContext`, which needs
 * the SDK's prelude-bridge brand and therefore cannot live in the leaf.
 */

export type {
  BlockMeta,
  BrickMeta,
  BrickMetaInput,
  CollectedBlock,
  CollectedBrick,
  CollectedManifest,
  CollectedSpark,
  PreferenceEntry,
  PreferencesResult,
  SparkMeta,
} from '@brika/schema/collect';
export {
  collectBlock,
  collectBrick,
  collectSpark,
  drainCollector,
  installCollector,
  isZodSchema,
  parseBrickMeta,
  zodToPreferences,
} from '@brika/schema/collect';
export { installBuildContext } from './build-context';
