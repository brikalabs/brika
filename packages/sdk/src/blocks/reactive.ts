/**
 * Reactive Block API
 *
 * Type-safe, reactive streams API for defining block logic.
 * Uses Zod schemas for type inference and JSON Schema generation.
 */

import { z } from 'zod';
import type { Json } from '../types';
import type { GenericRef, PassthroughRef, ResolvedRef } from './schema-types';

// Re-export everything from @brika/flow
export * from '@brika/flow';

// Re-export Serializable from @brika/serializable
export type { Serializable } from '@brika/serializable';

// Re-export type markers for convenience
export type { GenericRef, PassthroughRef, ResolvedRef } from './schema-types';

// ─────────────────────────────────────────────────────────────────────────────
// Port Definitions with Zod Schemas
// ─────────────────────────────────────────────────────────────────────────────

/** Port metadata */
export interface PortMeta {
  /** Display name. Defaults to the title-cased port key when omitted. */
  name?: string;
  /** Description for tooltip */
  description?: string;
  /**
   * Mark an output as a dynamic template: the editor repeats it once per item of
   * the named config array (e.g. `repeat: 'cases'`), creating ports `<id>-<index>`.
   * Emit to them at runtime with the raw `emit(\`<id>-\${i}\`, data)` context method.
   */
  repeat?: string;
}

/**
 * Input port definition - can hold a Zod schema or GenericRef.
 */
export interface InputDef<T extends z.ZodType | GenericRef<string>> {
  readonly __type: 'input';
  readonly schema: T;
  readonly meta?: PortMeta;
}

/** Schema types accepted for output ports */
type OutputSchema = z.ZodType | PassthroughRef<string> | GenericRef<string> | ResolvedRef;

/**
 * Output port definition - can hold a Zod schema, PassthroughRef, GenericRef, or ResolvedRef.
 */
export interface OutputDef<T extends OutputSchema> {
  readonly __type: 'output';
  readonly schema: T;
  readonly meta?: PortMeta;
}

/**
 * Create a typed input port with Zod schema or generic.
 */
export function input<T extends z.ZodType | GenericRef<string>>(
  schema: T,
  meta?: PortMeta
): InputDef<T> {
  return {
    __type: 'input',
    schema,
    meta,
  };
}

/**
 * Create a typed output port with Zod schema, passthrough, generic, or resolved.
 * The display name defaults to the title-cased port key; pass `meta` to override.
 */
export function output<T extends OutputSchema>(schema: T, meta?: PortMeta): OutputDef<T> {
  return {
    __type: 'output',
    schema,
    meta,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Block Context Types
// ─────────────────────────────────────────────────────────────────────────────

import type { Cleanup, CleanupRegistry, Emitter, Factory, Flow, Source } from '@brika/flow';
import { FlowImpl, isSource } from '@brika/flow';

/** Extract inferred type from Zod schema, GenericRef, PassthroughRef, or ResolvedRef */
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

/** Extract inferred type from InputDef */
type InputType<D> = D extends InputDef<infer T> ? SchemaInfer<T> : never;

/** Extract inferred type from OutputDef */
type OutputType<D> = D extends OutputDef<infer T> ? SchemaInfer<T> : never;

/** Convert input definitions to typed flows */
export type InputFlows<I extends Record<string, InputDef<z.ZodType | GenericRef<string>>>> = {
  readonly [K in keyof I]: Flow<InputType<I[K]>>;
};

/** Convert output definitions to typed emitters */
export type OutputEmitters<O extends Record<string, OutputDef<OutputSchema>>> = {
  readonly [K in keyof O]: Emitter<OutputType<O[K]>>;
};

/** Result of a `ctx.callTool` invocation (mirrors the hub `ToolResult`). */
export interface ToolCallResult {
  ok: boolean;
  content?: string;
  data?: Json;
}

/** A registered tool as seen by a block via `ctx.listTools` (qualified id). */
export interface ToolInfo {
  id: string;
  description?: string;
  inputSchema?: Json;
}

/**
 * Typed block context with reactive inputs/outputs.
 */
export interface BlockContext<
  TInputs extends Record<string, InputDef<z.ZodType | GenericRef<string>>>,
  TOutputs extends Record<string, OutputDef<OutputSchema>>,
  TConfig extends z.ZodObject<z.ZodRawShape>,
> {
  /** Block instance ID */
  readonly blockId: string;

  /** Workflow ID */
  readonly workflowId: string;

  /** Typed input flows */
  readonly inputs: InputFlows<TInputs>;

  /** Typed output emitters */
  readonly outputs: OutputEmitters<TOutputs>;

  /** Typed configuration */
  readonly config: z.infer<TConfig>;

  /**
   * Raw emit to any output port id, including dynamic template ports
   * (e.g. `emit(\`case-\${i}\`, data)`). Bypasses per-port schema validation, so
   * prefer the typed `outputs` emitters for statically-declared ports.
   */
  emit(portId: string, data: unknown): void;

  /** Self-returning context */
  readonly context: this;

  /**
   * Start a flow from a value, source, or factory.
   */
  start<T>(input: T | Source<T> | Factory<T>): Flow<T>;

  /**
   * Call a hub-registered tool by id and await its result. The tool may be
   * provided by any plugin (the registry is global). Args and result are JSON.
   */
  callTool(tool: string, args: Record<string, Json>): Promise<ToolCallResult>;

  /**
   * Enumerate every tool registered across all plugins (qualified ids +
   * descriptions + input schemas), e.g. to hand them to a model as tools.
   */
  listTools(): Promise<ToolInfo[]>;

  /**
   * Block-scoped logger. Entries land in the workflow's run trace (and the
   * live debug stream), keyed to this block, with an optional structured
   * payload, so per-step data like reasoning, token usage, or cost is
   * persisted with the run instead of vanishing into the global plugin logs.
   */
  readonly log: BlockLogger;
}

/** Block-scoped structured logger (see {@link BlockContext.log}). */
export interface BlockLogger {
  debug(message: string, data?: Json): void;
  info(message: string, data?: Json): void;
  warn(message: string, data?: Json): void;
  error(message: string, data?: Json): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Block Spec
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Human-facing block metadata. `brika build` lowers this into the plugin
 * manifest `blocks[]` entry, so co-locating it on the definition makes the
 * source the single source of truth and the generated, committed manifest
 * the artifact the host reads.
 */
export interface BlockMeta {
  /** Display name shown in the workflow editor. */
  name: string;
  /** One-line description. */
  description?: string;
  /** Manifest category bucket. */
  category: 'trigger' | 'flow' | 'action' | 'transform';
  /** Lucide icon name. */
  icon?: string;
  /** Accent color as `#RRGGBB`. */
  color?: string;
}

/**
 * Block specification with typed ports.
 */
export interface ReactiveBlockSpec<
  TInputs extends Record<string, InputDef<z.ZodType | GenericRef<string>>>,
  TOutputs extends Record<string, OutputDef<OutputSchema>>,
  TConfig extends z.ZodObject<z.ZodRawShape>,
> {
  /** Unique block ID (local to the plugin). */
  id: string;
  /**
   * Display metadata lowered into the manifest by `brika build`. Optional so
   * existing plugins that still hand-author `blocks[]` keep compiling; once a
   * block carries `meta`, `brika build` owns its manifest entry.
   */
  meta?: BlockMeta;
  /** Typed input port definitions. Omit for source/trigger blocks with no inputs. */
  inputs?: TInputs;
  /** Typed output port definitions. Omit for sink/action blocks with no outputs. */
  outputs?: TOutputs;
  /** Zod config schema */
  config: TConfig;
}

/**
 * Block setup function - called when workflow starts.
 */
export type BlockSetup<
  TInputs extends Record<string, InputDef<z.ZodType | GenericRef<string>>>,
  TOutputs extends Record<string, OutputDef<OutputSchema>>,
  TConfig extends z.ZodObject<z.ZodRawShape>,
> = (ctx: BlockContext<TInputs, TOutputs, TConfig>) => void;

// ─────────────────────────────────────────────────────────────────────────────
// Emitter Implementation
// ─────────────────────────────────────────────────────────────────────────────

import type { Serializable as SerializableType } from '@brika/serializable';

class EmitterImpl<T> implements Emitter<T> {
  readonly #emit: (portId: string, value: SerializableType) => void;
  readonly #portId: string;
  readonly #schema: z.ZodType;

  constructor(
    portId: string,
    schema: z.ZodType,
    emit: (portId: string, value: SerializableType) => void
  ) {
    this.#portId = portId;
    this.#schema = schema;
    this.#emit = emit;
  }

  emit(value: T): void {
    const result = this.#schema.safeParse(value);
    if (!result.success) {
      console.warn(`Output validation failed for port "${this.#portId}":`, result.error.message);
      return; // Drop invalid data — don't propagate type mismatches
    }
    this.#emit(this.#portId, result.data as SerializableType);
  }

  emitAll(values: T[]): void {
    for (const v of values) {
      this.emit(v);
    }
  }
}

/** Create an Emitter for an output port */
export function createEmitter<T>(
  portId: string,
  schema: z.ZodType,
  emit: (portId: string, value: SerializableType) => void
): Emitter<T> {
  return new EmitterImpl<T>(portId, schema, emit);
}

// ─────────────────────────────────────────────────────────────────────────────
// Flow from Input Helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a Flow from a value, source, or factory.
 */
export function createFlowFromInput<T>(
  inputVal: T | Source<T> | Factory<T>,
  setTimeoutFn: (fn: () => void, ms: number) => Cleanup,
  cleanup: CleanupRegistry
): FlowImpl<T> {
  const flow = new FlowImpl<T>(setTimeoutFn, cleanup);

  if (typeof inputVal === 'function') {
    const factory = inputVal as Factory<T>;
    const sourceCleanup = factory((value) => flow.push(value));
    cleanup.register(sourceCleanup);
  } else if (isSource(inputVal)) {
    const sourceCleanup = inputVal.start((value) => flow.push(value));
    cleanup.register(sourceCleanup);
  } else {
    const cancelCleanup = setTimeoutFn(() => flow.push(inputVal), 0);
    cleanup.register(cancelCleanup);
  }

  return flow;
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON Schema Generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a Zod schema to JSON Schema for API.
 */
export function zodToJsonSchema(schema: z.ZodType): Record<string, Json> {
  return z.toJSONSchema(schema, {
    unrepresentable: 'any',
  }) as Record<string, Json>;
}

/** Convert Zod schema to TypeScript-like type string */
export function zodToTypeName(schema: z.ZodType): string {
  try {
    return toTS(
      z.toJSONSchema(schema, {
        unrepresentable: 'any',
      }) as Record<string, unknown>
    );
  } catch {
    return 'unknown';
  }
}

function toTS(s: Record<string, unknown>): string {
  const t = s.type as string;
  if (t === 'integer') {
    return 'number';
  }
  if (['string', 'number', 'boolean', 'null'].includes(t)) {
    return t;
  }
  if (t === 'array') {
    return `${toTS(s.items as Record<string, unknown>)}[]`;
  }
  if (t === 'object') {
    const p = s.properties as Record<string, Record<string, unknown>>;
    return p
      ? `{${Object.entries(p)
          .map(([k, v]) => `${k}: ${toTS(v)}`)
          .join(', ')}}`
      : '{}';
  }
  if (s.anyOf) {
    return (s.anyOf as Record<string, unknown>[]).map(toTS).join(' | ');
  }
  if (s.enum) {
    return (s.enum as unknown[]).map((v) => (typeof v === 'string' ? `"${v}"` : v)).join(' | ');
  }
  return 'unknown';
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-exports
// ─────────────────────────────────────────────────────────────────────────────

export { z } from 'zod';
