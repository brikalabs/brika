/**
 * Reactive Block API
 *
 * Type-safe, reactive streams API for defining block logic.
 * Uses Zod schemas for type inference and JSON Schema generation.
 */

import { z } from 'zod';

// Re-export everything from @brika/flow
export * from '@brika/flow';

// Re-export Serializable from @brika/serializable
export type { Serializable } from '@brika/serializable';

// ─────────────────────────────────────────────────────────────────────────────
// Port Definitions with Zod Schemas
// ─────────────────────────────────────────────────────────────────────────────

/** Port metadata */
export interface PortMeta {
  /** Display name */
  name: string;
  /** Description for tooltip */
  description?: string;
}

/**
 * Input port definition with Zod schema for type inference.
 */
export interface InputDef<T extends z.ZodType> {
  readonly __type: 'input';
  readonly schema: T;
  readonly meta: PortMeta;
}

/**
 * Output port definition with Zod schema for type inference.
 */
export interface OutputDef<T extends z.ZodType> {
  readonly __type: 'output';
  readonly schema: T;
  readonly meta: PortMeta;
}

/**
 * Create a typed input port with Zod schema.
 */
export function input<T extends z.ZodType>(schema: T, meta: PortMeta): InputDef<T> {
  return { __type: 'input', schema, meta };
}

/**
 * Create a typed output port with Zod schema.
 */
export function output<T extends z.ZodType>(schema: T, meta: PortMeta): OutputDef<T> {
  return { __type: 'output', schema, meta };
}

// ─────────────────────────────────────────────────────────────────────────────
// Block Context Types
// ─────────────────────────────────────────────────────────────────────────────

import type { Emitter, Factory, Flow, Serializable, Source } from '@brika/flow';

/** Extract inferred type from Zod schema */
type ZodInfer<T> = T extends z.ZodType<infer U> ? U : never;

/** Extract inferred type from InputDef */
type InputType<D> = D extends InputDef<infer T> ? ZodInfer<T> : never;

/** Extract inferred type from OutputDef */
type OutputType<D> = D extends OutputDef<infer T> ? ZodInfer<T> : never;

/** Convert input definitions to typed flows */
export type InputFlows<I extends Record<string, InputDef<z.ZodType>>> = {
  readonly [K in keyof I]: Flow<InputType<I[K]>>;
};

/** Convert output definitions to typed emitters */
export type OutputEmitters<O extends Record<string, OutputDef<z.ZodType>>> = {
  readonly [K in keyof O]: Emitter<OutputType<O[K]>>;
};

/**
 * Typed block context with reactive inputs/outputs.
 */
export interface BlockContext<
  TInputs extends Record<string, InputDef<z.ZodType>>,
  TOutputs extends Record<string, OutputDef<z.ZodType>>,
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
   * Start a flow from a value, source, or factory.
   */
  start<T>(input: T | Source<T> | Factory<T>): Flow<T>;

  /** Log a message */
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void;

  /** Call a tool */
  callTool<R = Serializable>(toolId: string, args: Record<string, Serializable>): Promise<R>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Block Spec
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Block specification with typed ports.
 */
export interface ReactiveBlockSpec<
  TInputs extends Record<string, InputDef<z.ZodType>>,
  TOutputs extends Record<string, OutputDef<z.ZodType>>,
  TConfig extends z.ZodObject<z.ZodRawShape>,
> {
  /** Unique block ID */
  id: string;
  /** Display name */
  name?: string;
  /** Description */
  description?: string;
  /** Category for grouping */
  category?: string;
  /** Lucide icon name */
  icon?: string;
  /** Hex color */
  color?: string;
  /** Typed input port definitions */
  inputs: TInputs;
  /** Typed output port definitions */
  outputs: TOutputs;
  /** Zod config schema */
  config: TConfig;
}

/**
 * Block setup function - called when workflow starts.
 */
export type BlockSetup<
  TInputs extends Record<string, InputDef<z.ZodType>>,
  TOutputs extends Record<string, OutputDef<z.ZodType>>,
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
    if (process.env.NODE_ENV !== 'production') {
      const result = this.#schema.safeParse(value);
      if (!result.success) {
        console.warn(`Output validation failed for port "${this.#portId}":`, result.error.message);
      }
    }
    this.#emit(this.#portId, value as SerializableType);
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

import { type Cleanup, CleanupRegistry, FlowImpl, isSource } from '@brika/flow';

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
    const sourceCleanup = factory((value) => flow._push(value));
    cleanup.register(sourceCleanup);
  } else if (isSource(inputVal)) {
    const sourceCleanup = inputVal.start((value) => flow._push(value));
    cleanup.register(sourceCleanup);
  } else {
    const cancelCleanup = setTimeoutFn(() => flow._push(inputVal as T), 0);
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
export function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, { unrepresentable: 'any' }) as Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-exports
// ─────────────────────────────────────────────────────────────────────────────

export { z } from 'zod';
