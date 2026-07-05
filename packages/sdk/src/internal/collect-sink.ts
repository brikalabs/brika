/**
 * Build-time capability collector sink. The implementation lives in
 * `@brika/schema/collect-sink` (the leaf package) so the compiler consumes the
 * same contract without depending on `@brika/sdk`; this module re-exports it
 * for the SDK's internal producers (`defineBlock` / `defineSpark` /
 * `defineBrick`) and stays zod-free so `@brika/sdk/brick` can bundle it for
 * the browser.
 */

export type {
  BlockMeta,
  BrickMeta,
  CollectedBlock,
  CollectedBrick,
  CollectedManifest,
  CollectedSpark,
  SparkMeta,
} from '@brika/schema/collect-sink';
export {
  collectBlock,
  collectBrick,
  collectSpark,
  drainCollector,
  installCollector,
} from '@brika/schema/collect-sink';
