/**
 * `defineBrick` — one react-free descriptor per brick, tying its id, display
 * meta, zod `config`, and zod `data` together so the manifest, the runtime
 * config read, the typed+validated data channel, and tests all derive from one
 * source. Replaces the hand-maintained `brick-data.ts` sidecar.
 *
 * This module is deliberately NOT in the compiler's externals BRIDGE map, so it
 * bundles as real code in BOTH the plugin subprocess and the browser. It imports
 * zero react. The data channel is built from `defineBrickData`, imported via the
 * BARE `@brika/sdk/brick-views` specifier so the compiler rewrites it to the host
 * bridge in the browser (where `.use()` reads pushed data) while resolving to the
 * real server module in the subprocess (where `.set()` pushes it). The build-time
 * collector hook is imported relatively from the zod-free sink, so no zod or
 * server code crosses into the browser bundle.
 */

import { defineBrickData } from '@brika/sdk/brick-views';
import type { z } from 'zod';
import { type BrickMeta, collectBrick } from './internal/collect-sink';

export interface BrickDescriptor<
  TConfig extends z.ZodObject<z.ZodRawShape>,
  TData extends z.ZodType,
> {
  readonly id: string;
  readonly meta: BrickMeta;
  /** The zod config schema; pass to `useBrickConfig()` in the view for typed config. */
  readonly config: TConfig;
  /** Typed, validated data channel: `.set()` in the plugin process, `.use()` in the view. */
  readonly data: {
    set(value: z.infer<TData>): void;
    use(): z.infer<TData> | undefined;
  };
}

export function defineBrick<TConfig extends z.ZodObject<z.ZodRawShape>, TData extends z.ZodType>(
  spec: Readonly<{ id: string; meta: BrickMeta; config: TConfig; data: TData }>
): BrickDescriptor<TConfig, TData> {
  // Captured by `brika build`; no-op at plugin runtime.
  collectBrick({ id: spec.id, meta: spec.meta, config: spec.config, data: spec.data });

  const channel = defineBrickData<z.infer<TData>>(spec.id);
  return {
    id: spec.id,
    meta: spec.meta,
    config: spec.config,
    data: {
      // Validate against the descriptor's own schema before crossing the IPC
      // boundary, so a malformed payload fails at the source, not in the view.
      set: (value) => channel.set(spec.data.parse(value)),
      use: () => channel.use(),
    },
  };
}
