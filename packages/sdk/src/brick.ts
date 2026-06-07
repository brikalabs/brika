/**
 * The `defineBrick` descriptor: one react-free module per brick.
 *
 * @internal Implementation notes (not author-facing): this module is
 * deliberately NOT in the compiler's externals BRIDGE map, so it bundles as real
 * code in BOTH the plugin subprocess and the browser, and imports zero react. The
 * data channel is built from `defineBrickData`, imported via the BARE
 * `@brika/sdk/brick-views` specifier so the compiler rewrites it to the host
 * bridge in the browser (where `.use()` reads pushed data) while resolving to the
 * real server module in the subprocess (where `.set()` pushes it). The build-time
 * collector hook is imported relatively from the zod-free sink, so neither zod nor
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

/**
 * Define a brick: one react-free descriptor tying a widget's id, display meta,
 * typed config, and a validated data channel into a single source, so the
 * manifest, the view config read, the data push, and tests all derive from it.
 *
 * @param spec The brick descriptor.
 * @param spec.id Persistent key in saved boards. Conventionally equals the
 *   `*.brick.ts` filename; keep it explicit so a file rename never silently
 *   re-keys a deployed widget.
 * @param spec.meta Display metadata lowered into the manifest `bricks[]` entry by
 *   `brika build` (name, description, category, lucide icon, color).
 * @param spec.config Zod object read in the view via `useBrickConfig(descriptor.config)`.
 * @param spec.data Zod schema for the push channel. `descriptor.data.set()`
 *   validates against it in the plugin process; `descriptor.data.use()` reads it
 *   in the browser view (undefined until the first set).
 * @returns A {@link BrickDescriptor} exposing `id`, `meta`, `config`, and a typed
 *   `data` channel with `set` and `use`.
 * @example
 * ```ts
 * import { z } from '@brika/sdk';
 * import { defineBrick } from '@brika/sdk/brick';
 *
 * export const weather = defineBrick({
 *   id: 'weather',
 *   meta: { name: 'Current Weather', category: 'weather', icon: 'cloud' },
 *   config: z.object({ city: z.string().default('Lausanne') }),
 *   data: z.object({ tempC: z.number(), conditions: z.string() }),
 * });
 * // plugin process: weather.data.set({ tempC: 21, conditions: 'Clear' });
 * // view:           const current = weather.data.use();
 * ```
 * @see {@link BrickDescriptor} for the returned shape.
 */
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
