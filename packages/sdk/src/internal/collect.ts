/**
 * Build-time capability collector.
 *
 * At plugin runtime this is dormant: `defineReactiveBlock` / `defineSpark`
 * call `collectBlock` / `collectSpark`, which are no-ops because no sink is
 * installed. The `brika build` manifest generator calls `installCollector()`
 * first, imports the plugin's block/spark modules so their `define*` calls
 * run, then reads the captured metadata back with `drainCollector()`.
 *
 * The sink lives on `globalThis` so it is shared even if more than one
 * `@brika/sdk` instance is resolved during a build, and so the generator
 * (which lives in `@brika/compiler`) reads the exact records the plugin's
 * `@brika/sdk` wrote.
 */

import type { BlockMeta } from '../blocks/reactive';

/** A block captured during a build pass. */
export interface CollectedBlock {
  id: string;
  meta?: BlockMeta;
}

/** Human-facing spark metadata lowered into the manifest `sparks[]` entry. */
export interface SparkMeta {
  name?: string;
  description?: string;
}

/** A spark captured during a build pass. */
export interface CollectedSpark {
  id: string;
  meta?: SparkMeta;
}

/** Everything captured during a single build pass. */
export interface CollectedManifest {
  blocks: CollectedBlock[];
  sparks: CollectedSpark[];
}

declare global {
  // Present only while `brika build` is collecting. Unset at plugin runtime,
  // which makes the collect* helpers below cheap no-ops.
  var __brikaCollect: CollectedManifest | undefined;
}

/** Begin capturing `define*` registrations. Resets any prior capture. */
export function installCollector(): void {
  globalThis.__brikaCollect = { blocks: [], sparks: [] };
}

/** Return the captured definitions and stop capturing. */
export function drainCollector(): CollectedManifest {
  const sink = globalThis.__brikaCollect ?? { blocks: [], sparks: [] };
  globalThis.__brikaCollect = undefined;
  return sink;
}

/** Record a block definition. No-op unless a collector is installed. */
export function collectBlock(block: CollectedBlock): void {
  globalThis.__brikaCollect?.blocks.push(block);
}

/** Record a spark definition. No-op unless a collector is installed. */
export function collectSpark(spark: CollectedSpark): void {
  globalThis.__brikaCollect?.sparks.push(spark);
}
