/**
 * Reactive Block Test Harness
 *
 * `createMockBlockContext()` stands a `defineReactiveBlock()` block up in
 * isolation — no hub, no IPC, no prelude. Tests push values to its inputs,
 * read what it emits on its outputs, and (optionally) stub the secrets and
 * preferences APIs the block reads at runtime.
 */
import type { Serializable } from '@brika/serializable';
import type { z } from 'zod';
import type {
  GenericRef,
  InputDef,
  OutputDef,
  PassthroughRef,
  ResolvedRef,
} from '../blocks/reactive';
import type { CompiledReactiveBlock } from '../blocks/reactive-define';

/**
 * Global symbol matching the one read by `getContext()` in `src/context.ts`.
 * The harness writes a stub here so the block's `getSecret()` /
 * `getPreferences()` calls find a working context without ever needing a
 * real hub. We use `globalThis` (not a direct import) because some tests
 * mock `'../context'` process-wide via `bun:test`'s `mock.module`, which
 * would otherwise strip whatever testing seam we exported.
 */
const TEST_CTX = Symbol.for('brika.testing.context');
interface TestCtxGlobal {
  [TEST_CTX]?: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Type plumbing — mirror reactive.ts so push/emitted are statically checked.
// ─────────────────────────────────────────────────────────────────────────────

type OutputSchema = z.ZodType | PassthroughRef<string> | GenericRef<string> | ResolvedRef;

type SchemaInfer<T> =
  T extends z.ZodType<infer U>
    ? U
    : T extends GenericRef
      ? unknown
      : T extends PassthroughRef
        ? unknown
        : T extends ResolvedRef
          ? unknown
          : never;

type InputType<D> = D extends InputDef<infer T> ? SchemaInfer<T> : never;
type OutputType<D> = D extends OutputDef<infer T> ? SchemaInfer<T> : never;

/**
 * Harness handle returned by `createMockBlockContext`.
 *
 * - `push(name, value)` delivers a value to one of the block's inputs.
 *   The port name is constrained to `keyof TInputs`; the value type is
 *   inferred from the input's Zod schema.
 * - `emitted(name)` returns every value the block has emitted on the given
 *   output port since the last `clear()`. Typed against the output schema.
 * - `clear(name?)` empties the emitted buffer for one port, or all ports.
 * - `start()` / `stop()` invoke the block's runtime lifecycle.
 * - `flush()` awaits queued microtasks (handy after `push()` when the
 *   block uses async pipelines).
 * - `config` is the resolved (Zod-parsed) config object.
 */
export interface MockBlockHarness<
  TInputs extends Record<string, InputDef<z.ZodType | GenericRef<string>>>,
  TOutputs extends Record<string, OutputDef<OutputSchema>>,
  TConfig extends z.ZodObject<z.ZodRawShape>,
> {
  /** Start the block — runs the setup function with a mock context. */
  start(): Promise<void>;
  /** Stop the block — invokes the block's cleanup. */
  stop(): Promise<void>;
  /** Push a value to one of the block's inputs (port name is type-checked). */
  push<K extends keyof TInputs & string>(name: K, value: InputType<TInputs[K]>): void;
  /** Read the emitted-value buffer for an output port (typed). */
  emitted<K extends keyof TOutputs & string>(name: K): Array<OutputType<TOutputs[K]>>;
  /** Empty the emitted-value buffer for one port, or for every port if omitted. */
  clear<K extends keyof TOutputs & string>(name?: K): void;
  /** Yield to the event loop so microtasks settle. */
  flush(): Promise<void>;
  /** Resolved configuration (validated against the block's Zod config schema). */
  readonly config: z.infer<TConfig>;
  /** Block's declared identifier (mirrors `block.id`). */
  readonly blockId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Options & internal context stub
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Options for `createMockBlockContext`.
 *
 * @typeParam TConfig - Zod object schema used for the block's config.
 */
export interface CreateMockBlockContextOptions<TConfig extends z.ZodObject<z.ZodRawShape>> {
  /** Block instance id reported on the mock context. Defaults to `mock-block`. */
  blockId?: string;
  /** Workflow id reported on the mock context. Defaults to `mock-workflow`. */
  workflowId?: string;
  /**
   * Config values delivered to the block. Validated against the spec's Zod
   * config schema, so defaults defined on the schema are applied here too.
   */
  config?: Partial<z.input<TConfig>>;
  /**
   * Map of secret keys to values returned by `getSecret(key)` calls inside
   * the block. Keys not present resolve to `null` (matching the real API).
   */
  secrets?: Record<string, string>;
  /**
   * Preferences object returned by `getPreferences()` calls inside the
   * block. The harness validates against any schema passed by the block.
   */
  preferences?: Record<string, unknown>;
}

/** Minimal Context surface required by the secret/preference APIs. */
interface ContextStub {
  getSecret(key: string): Promise<string | null>;
  setSecret(key: string, value: string): Promise<void>;
  deleteSecret(key: string): Promise<boolean>;
  getPreferences(): Record<string, unknown>;
  onPreferencesChange(handler: (prefs: Record<string, unknown>) => void): () => void;
  updatePreference(key: string, value: unknown): void;
}

function buildContextStub(
  secrets: Map<string, string>,
  preferences: Record<string, unknown>
): ContextStub {
  const explicit: ContextStub = {
    getSecret(key) {
      return Promise.resolve(secrets.has(key) ? (secrets.get(key) ?? null) : null);
    },
    setSecret(key, value) {
      if (value === '') {
        secrets.delete(key);
      } else {
        secrets.set(key, value);
      }
      return Promise.resolve();
    },
    deleteSecret(key) {
      return Promise.resolve(secrets.delete(key));
    },
    getPreferences() {
      return preferences;
    },
    onPreferencesChange() {
      // No-op in the harness: there is no hub to push updates.
      return () => undefined;
    },
    updatePreference(key, value) {
      preferences[key] = value;
    },
  };
  // Wrap in a Proxy so methods we haven't modelled (log, registerSpark,
  // onInit/onStop, register*…) fall through to a no-op instead of throwing
  // when a block's handler calls them mid-test.
  const noop = (): undefined => undefined;
  const fallback: ProxyHandler<typeof noop> = {
    get(_t, p) {
      return typeof p === 'symbol' ? undefined : new Proxy(noop, fallback);
    },
    apply() {
      return undefined;
    },
  };
  return new Proxy(explicit, {
    get(target, prop, receiver) {
      const own = Reflect.get(target, prop, receiver);
      if (own !== undefined) {
        return own;
      }
      return typeof prop === 'symbol' ? undefined : new Proxy(noop, fallback);
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Harness factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a unit-test harness for a `defineReactiveBlock()` block.
 *
 * The block is run in isolation: no hub, no IPC, no prelude. The harness
 * uses the block's own `start()` factory to wire its reactive runtime, so
 * the setup function executes against the same `BlockContext` it would see
 * inside the hub — only the IPC `emit()` is replaced by an in-memory buffer
 * and the singleton `getContext()` is stubbed for the block's `getSecret()`
 * / `getPreferences()` calls.
 *
 * @example
 * ```ts
 * import { createMockBlockContext } from '@brika/sdk/testing';
 * import { myBlock } from '../src/blocks/my-block';
 *
 * const h = createMockBlockContext(myBlock, {
 *   config: { threshold: 5 },
 *   secrets: { token: 'abc' },
 *   preferences: { units: 'metric' },
 * });
 * await h.start();
 * h.push('temperature', 22);
 * await h.flush();
 * expect(h.emitted('comfort')).toHaveLength(1);
 * await h.stop();
 * ```
 */
export function createMockBlockContext<
  TInputs extends Record<string, InputDef<z.ZodType | GenericRef<string>>>,
  TOutputs extends Record<string, OutputDef<OutputSchema>>,
  TConfig extends z.ZodObject<z.ZodRawShape>,
>(
  block: CompiledReactiveBlock<TInputs, TOutputs, TConfig>,
  options: CreateMockBlockContextOptions<TConfig> = {}
): MockBlockHarness<TInputs, TOutputs, TConfig> {
  const blockId = options.blockId ?? 'mock-block';
  const workflowId = options.workflowId ?? 'mock-workflow';
  const config = (options.config ?? {}) as Record<string, unknown>;
  const secrets = new Map<string, string>(Object.entries(options.secrets ?? {}));
  const preferences: Record<string, unknown> = { ...options.preferences };

  // Buffers per output port; only ports declared on the block get an entry.
  // emit() into an unknown port is silently dropped (mirroring the prelude).
  const buffers = new Map<string, Serializable[]>();
  for (const port of block.outputs) {
    buffers.set(port.id, []);
  }

  type Instance = ReturnType<CompiledReactiveBlock['start']>;
  let instance: Instance | null = null;
  let previousContext: unknown = undefined;
  let contextInstalled = false;

  // Build the stub once — harness consumers may mutate `secrets`/`preferences`
  // via `setSecret`/`updatePreference` calls inside the block; the stub
  // closure shares the underlying Map/object so changes are visible to
  // subsequent calls.
  const stub = buildContextStub(secrets, preferences);

  const installContextStub = (): void => {
    // Snapshot whatever override was installed before us (could be another
    // harness instance nested in the same test) so restore is symmetric.
    const slot = globalThis as TestCtxGlobal;
    previousContext = slot[TEST_CTX];
    slot[TEST_CTX] = stub;
    contextInstalled = true;
  };

  const restoreContextStub = (): void => {
    if (!contextInstalled) {
      return;
    }
    contextInstalled = false;
    const slot = globalThis as TestCtxGlobal;
    if (previousContext === undefined) {
      delete slot[TEST_CTX];
    } else {
      slot[TEST_CTX] = previousContext;
    }
  };

  return {
    blockId,
    get config(): z.infer<TConfig> {
      // We return the user-supplied input map; the spec's Zod schema is
      // applied by the block itself inside start(). Consumers usually
      // construct this in tests, so giving them back what they passed is
      // the most predictable contract.
      return config as z.infer<TConfig>;
    },

    async start() {
      if (instance) {
        return;
      }
      installContextStub();
      instance = block.start({
        blockId,
        workflowId,
        config,
        emit(portId, data) {
          // Real prelude silently drops emits to unknown ports; mirror that.
          const buf = buffers.get(portId);
          if (buf) {
            buf.push(data);
          }
        },
      });
      // Yield once so any setTimeout(..., 0) primers (used by
      // createFlowFromInput for static values) get a chance to land.
      await Promise.resolve();
    },

    async stop() {
      if (instance) {
        instance.stop();
        instance = null;
      }
      restoreContextStub();
      await Promise.resolve();
    },

    push(name, value) {
      if (!instance) {
        throw new Error(`createMockBlockContext: cannot push("${String(name)}") before start()`);
      }
      instance.pushInput(name, value as Serializable);
    },

    emitted(name) {
      const buf = buffers.get(name);
      if (!buf) {
        return [];
      }
      // Typed cast: the buffer holds Serializable, but every value pushed
      // through the block's emitter has been validated against the output's
      // Zod schema (or accepted as-is for generic/passthrough), so the
      // declared output type is sound here.
      return buf.slice() as Array<OutputType<TOutputs[typeof name]>>;
    },

    clear(name) {
      if (name === undefined) {
        for (const id of buffers.keys()) {
          buffers.set(id, []);
        }
        return;
      }
      const buf = buffers.get(name);
      if (buf) {
        buf.length = 0;
      }
    },

    async flush() {
      // Two microtask yields cover both the immediate subscriber pass and
      // any chained promises (e.g. operators that await before forwarding).
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}
