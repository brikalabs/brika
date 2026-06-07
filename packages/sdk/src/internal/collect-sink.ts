/**
 * Build-time capability collector sink (zod-free).
 *
 * At plugin runtime this is dormant: `defineReactiveBlock` / `defineSpark` /
 * `defineBrick` call the `collect*` helpers, which are no-ops because no sink is
 * installed. `brika build` calls `installCollector()`, imports the plugin's
 * server modules so their `define*` calls run, then reads the captured records
 * with `drainCollector()`.
 *
 * This module imports nothing at runtime (zod only as a type), so it can be
 * pulled into the browser-bundled `@brika/sdk/brick` without dragging zod or
 * server code across the isolation boundary. The sink lives on `globalThis` so
 * it is shared even if more than one `@brika/sdk` instance is resolved.
 */

import type { z } from 'zod';
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

/** Display metadata for a brick descriptor (`defineBrick`). */
export interface BrickMeta {
  name: string;
  description?: string;
  category?: string;
  icon?: string;
  color?: string;
  families?: Array<'sm' | 'md' | 'lg'>;
}

/** A brick captured during a build pass (from `defineBrick`). */
export interface CollectedBrick {
  id: string;
  meta: BrickMeta;
  config: z.ZodType;
  data: z.ZodType;
}

/** Everything captured during a single build pass. */
export interface CollectedManifest {
  blocks: CollectedBlock[];
  sparks: CollectedSpark[];
  bricks: CollectedBrick[];
}

declare global {
  // Present only while `brika build` is collecting. Unset at plugin runtime,
  // which makes the collect* helpers below cheap no-ops.
  var __brikaCollect: CollectedManifest | undefined;
}

/** Begin capturing `define*` registrations. Resets any prior capture. */
export function installCollector(): void {
  globalThis.__brikaCollect = { blocks: [], sparks: [], bricks: [] };
}

/** Return the captured definitions and stop capturing. */
export function drainCollector(): CollectedManifest {
  const sink = globalThis.__brikaCollect ?? { blocks: [], sparks: [], bricks: [] };
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

/** Record a brick descriptor. No-op unless a collector is installed. */
export function collectBrick(brick: CollectedBrick): void {
  globalThis.__brikaCollect?.bricks.push(brick);
}
