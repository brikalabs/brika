/**
 * Reactive Block Definition
 *
 * Type-safe defineBlock with Zod-typed inputs/outputs.
 * All subscriptions via .to() and .on() are automatically cleaned up when the block stops.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { Serializable } from '@brika/serializable';
import { z } from 'zod';
import { log } from '../api/logging';
import { getContext } from '../context';
import { collectBlock } from '../internal/collect';
import { type TemplateScope, templatedConfigView } from '../internal/template';
import type { Json } from '../types';
import {
  type BlockContext,
  type BlockLogger,
  type BlockSetup,
  type Cleanup,
  CleanupRegistry,
  createEmitter,
  createFlow,
  createFlowFromInput,
  type Emitter,
  type Factory,
  type Flow,
  FlowImpl,
  type GenericRef,
  type InputDef,
  type OutputDef,
  type PassthroughRef,
  type ReactiveBlockSpec,
  type ResolvedRef,
  type Source,
  type ToolCallResult,
  type ToolInfo,
  zodToJsonSchema,
  zodToTypeName,
} from './reactive';
import type { BlockDefinition, BlockPort, BlockSchema } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Compiled Reactive Block
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A compiled reactive block with metadata and runtime functions.
 */
export interface CompiledReactiveBlock extends BlockDefinition {
  /** Start the block - creates reactive context and runs setup */
  start(ctx: BlockRuntimeContext): BlockInstance;
}

/** Runtime context provided by the workflow engine */
export interface BlockRuntimeContext {
  blockId: string;
  workflowId: string;
  config: Record<string, unknown>;
  emit(portId: string, data: Serializable, causationId?: string): void;
  /**
   * Call a hub-registered tool by id. Always provided by the hub prelude at
   * runtime; optional here only so test harnesses can build a minimal context
   * (the typed `run()` context surfaces it as required).
   */
  callTool?(tool: string, args: Record<string, Json>): Promise<ToolCallResult>;
  /** Enumerate registered tools. Always provided at runtime (see `callTool`). */
  listTools?(): Promise<ToolInfo[]>;
  /**
   * Block-scoped log channel into the workflow run trace. Optional for the
   * same reason as `callTool`: test harnesses build a minimal context. When
   * absent, the typed context's `log` falls back to the plugin global logger.
   */
  log?(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: Json): void;
}

/** Running block instance */
export interface BlockInstance {
  /** Push data to an input port */
  pushInput(portId: string, data: Serializable, causationId?: string): void;
  /** Stop the block and clean up */
  stop(): void;
}

/** Wrap non-record payloads so the global logger's meta stays an object. */
function asLogMeta(data: Json | undefined): Record<string, Json> | undefined {
  if (data === undefined) {
    return undefined;
  }
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    return data;
  }
  return { value: data };
}

/**
 * Block-scoped logger bound to the runtime's `log` channel (run trace) when
 * available, falling back to the plugin's global logger (tests, older hubs).
 */
function makeBlockLogger(ctx: BlockRuntimeContext): BlockLogger {
  const send = (level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: Json) => {
    if (ctx.log) {
      ctx.log(level, message, data);
    } else {
      log[level](message, asLogMeta(data));
    }
  };
  return {
    debug: (message, data) => send('debug', message, data),
    info: (message, data) => send('info', message, data),
    warn: (message, data) => send('warn', message, data),
    error: (message, data) => send('error', message, data),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Define Reactive Block
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Define a block with Zod-typed reactive inputs/outputs.
 * All subscriptions via .to() and .on() are automatically cleaned up when the block stops.
 *
 * @example
 * ```ts
 * import { defineReactiveBlock, input, output, combine, map, interval, z } from "@brika/sdk";
 *
 * export const comfortBlock = defineReactiveBlock({
 *   id: "comfort-index",
 *
 *   inputs: {
 *     temperature: input(z.number(), { name: "Temperature °C" }),
 *     humidity: input(z.number(), { name: "Humidity %" }),
 *   },
 *
 *   outputs: {
 *     comfort: output(z.object({
 *       score: z.number(),
 *       label: z.string(),
 *     }), { name: "Comfort" }),
 *     alert: output(z.string(), { name: "Alert" }),
 *   },
 *
 *   config: z.object({
 *     minTemp: z.number().default(18),
 *     maxTemp: z.number().default(26),
 *   }),
 *
 * }, ({ inputs, outputs, config, start, log }) => {
 *   // Combine and transform
 *   combine(inputs.temperature, inputs.humidity)
 *     .pipe(map(([temp, hum]) => ({
 *       score: Math.round(100 - Math.abs(temp - 22) * 5),
 *       label: temp > 26 ? "Hot" : "Good",
 *     })))
 *     .to(outputs.comfort);
 *
 *   // Conditional alerts
 *   inputs.temperature.on(temp => {
 *     if (temp > config.maxTemp) {
 *       outputs.alert.emit(`Too hot: ${temp}°C`);
 *     }
 *   });
 *
 *   // Start from source
 *   start(interval(1000)).to(outputs.tick);
 * });
 * ```
 */
type OutputDefSchema = z.ZodType | PassthroughRef | GenericRef<string> | ResolvedRef;

/** Title-case a port key for its default display name (`trigger` -> `Trigger`). */
function portDisplayName(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function compileBlock<
  TInputs extends Record<string, InputDef<z.ZodType | GenericRef<string>>>,
  TOutputs extends Record<string, OutputDef<OutputDefSchema>>,
  TConfig extends z.ZodObject<z.ZodRawShape>,
>(
  spec: ReactiveBlockSpec<TInputs, TOutputs, TConfig>,
  setup: BlockSetup<TInputs, TOutputs, TConfig>
): CompiledReactiveBlock {
  // Capture id + display metadata + config field names for `brika build`
  // (fields drive the `fields.<name>.label` i18n keys). No-op at plugin runtime.
  collectBlock({
    id: spec.id,
    meta: spec.meta,
    configFields: Object.keys(spec.config.shape).sort((a, b) => a.localeCompare(b)),
  });

  const configJsonSchema = zodToBlockSchema(spec.config);

  // Get TypeScript-like type name from schema (not resolving passthrough/resolved)
  const getBaseTypeName = (schema: OutputDefSchema): string => {
    if (schema && typeof schema === 'object' && '__type' in schema) {
      if (schema.__type === 'generic') {
        return `generic<${schema.__generic}>`;
      }
      // Don't resolve passthrough here - it will be resolved later
      if (schema.__type === 'passthrough') {
        return `__passthrough:${schema.__passthrough}`;
      }
      // Resolved types use $resolve:source:configField format for UI type inference
      if (schema.__type === 'resolved') {
        return `$resolve:${schema.__source}:${schema.__configField}`;
      }
    }
    return zodToTypeName(schema);
  };

  // Get structural TypeDescriptor from schema/ref (for @brika/type-system)
  // Produces a JSON-serializable TypeDescriptor without importing the type-system package.
  const getTypeDescriptor = (schema: OutputDefSchema): Record<string, unknown> => {
    if (schema && typeof schema === 'object' && '__type' in schema) {
      return markerRefToDescriptor(schema) ?? { kind: 'unknown' };
    }
    try {
      return jsonSchemaToTypeDescriptor(zodToJsonSchema(schema));
    } catch {
      return { kind: 'unknown' };
    }
  };

  // Get JSON Schema from Zod schema (returns undefined for generic/passthrough/resolved)
  const getJsonSchema = (schema: OutputDefSchema): Record<string, unknown> | undefined => {
    if (schema && typeof schema === 'object' && '__type' in schema) {
      return undefined;
    }
    try {
      return zodToJsonSchema(schema);
    } catch {
      return undefined;
    }
  };

  // Get runtime schema - returns the internal _schema for GenericRef/PassthroughRef/ResolvedRef
  const getRuntimeSchema = (schema: OutputDefSchema): z.ZodType => {
    if (schema && typeof schema === 'object' && '_schema' in schema) {
      return schema._schema;
    }
    return schema;
  };

  // Build input map for passthrough resolution
  const inputMap = new Map<
    string,
    {
      type: Record<string, unknown>;
      jsonSchema?: Record<string, unknown>;
    }
  >();
  for (const [id, def] of Object.entries(spec.inputs ?? {})) {
    inputMap.set(id, {
      type: getTypeDescriptor(def.schema),
      jsonSchema: getJsonSchema(def.schema),
    });
  }

  // Convert input definitions to BlockPort[]
  const inputs: BlockPort[] = Object.entries(spec.inputs ?? {}).map(([id, def]) => ({
    id,
    name: def.meta?.name ?? portDisplayName(id),
    direction: 'input' as const,
    type: getTypeDescriptor(def.schema),
    jsonSchema: getJsonSchema(def.schema),
  }));

  // Convert output definitions to BlockPort[] - resolve passthrough to input type
  const outputs: BlockPort[] = Object.entries(spec.outputs ?? {}).map(([id, def]) => {
    const baseTypeName = getBaseTypeName(def.schema);
    const typeDesc = getTypeDescriptor(def.schema);

    // If it's a passthrough, resolve to the linked input's concrete type.
    // If the linked input is generic/unresolved, keep the passthrough descriptor
    // so the UI inference engine can resolve it dynamically at connection time.
    if (baseTypeName.startsWith('__passthrough:')) {
      const inputId = baseTypeName.replace('__passthrough:', '');
      const linkedInput = inputMap.get(inputId);
      if (linkedInput) {
        const linkedKind = linkedInput.type.kind;
        const isResolvable =
          linkedKind === 'generic' || linkedKind === 'passthrough' || linkedKind === 'resolved';
        if (!isResolvable) {
          // Linked input is concrete — resolve statically
          return {
            id,
            name: def.meta?.name ?? portDisplayName(id),
            direction: 'output' as const,
            type: linkedInput.type,
            jsonSchema: linkedInput.jsonSchema,
            dynamic: def.meta?.repeat,
          };
        }
        // Linked input is generic/unresolved — preserve passthrough for dynamic inference
      }
    }

    return {
      id,
      name: def.meta?.name ?? portDisplayName(id),
      direction: 'output' as const,
      type: typeDesc,
      jsonSchema: getJsonSchema(def.schema),
      dynamic: def.meta?.repeat,
    };
  });

  // Create the block definition
  const blockDef: CompiledReactiveBlock = {
    id: spec.id,
    inputs,
    outputs,
    schema: configJsonSchema,
    // Host-scheduled trigger declaration, forwarded to the hub so it can own
    // the schedule. Omitted entirely for ordinary blocks.
    ...(spec.trigger ? { trigger: spec.trigger } : {}),

    // Start function - creates reactive context and runs setup
    start(ctx: BlockRuntimeContext): BlockInstance {
      // Create cleanup registry
      const cleanup = new CleanupRegistry();

      const blockLogger = makeBlockLogger(ctx);

      // Causation trace: pushInput binds the triggering run's id around the
      // delivery, and AsyncLocalStorage carries it through the handlers' async
      // continuations, so every emit can name the exact run that caused it
      // (fan-in safe correlation, no hub-side guessing).
      const causation = new AsyncLocalStorage<string>();

      // Handler crashes (sync throw or async rejection) land in the run trace
      // as structured errors instead of dying as unhandled rejections.
      const onFlowError = (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        blockLogger.error(`Unhandled error in block handler: ${message}`, { error: message });
      };

      // setTimeout wrapper with auto-cleanup
      const setTimeoutWrapper = (fn: () => void, ms: number): Cleanup => {
        const id = setTimeout(fn, ms);
        const cancel = () => clearTimeout(id);
        cleanup.register(cancel);
        return cancel;
      };

      // Create flows for each input
      const flows = new Map<string, FlowImpl<unknown>>();
      for (const id of Object.keys(spec.inputs ?? {})) {
        flows.set(id, createFlow<unknown>(setTimeoutWrapper, cleanup, onFlowError));
      }

      // Emit carrying the causation of the input that (transitively) caused it
      const emitWithCausation = (portId: string, value: Serializable) => {
        const causationId = causation.getStore();
        if (causationId) {
          ctx.emit(portId, value, causationId);
        } else {
          ctx.emit(portId, value);
        }
      };

      // Create emitters for each output; validation drops are loud (run trace)
      const outputEmitters = {} as Record<string, Emitter<unknown>>;
      for (const [id, def] of Object.entries(spec.outputs ?? {})) {
        outputEmitters[id] = createEmitter<unknown>(
          id,
          getRuntimeSchema(def.schema),
          emitWithCausation,
          (portId, message) => {
            blockLogger.warn(`Output validation failed for "${portId}", emit dropped`, {
              port: portId,
              error: message,
            });
          }
        );
      }

      // Parse and validate config. Abort the block start on failure rather than
      // running setup() with an all-undefined `{}` config (which silently starts
      // a misconfigured block); the runtime then marks the block failed.
      const configResult = spec.config.safeParse(ctx.config);
      if (!configResult.success) {
        blockLogger.error(`Config validation failed: ${configResult.error.message}`);
        throw new Error(`Block config validation failed: ${configResult.error.message}`);
      }
      // Live scope for `{{ inputs.<port> }}` / `{{ config.<key> }}` expressions
      // embedded in string config fields. Updated on every input event below; the
      // config view resolves templated fields against it at read time.
      const scope: TemplateScope = { inputs: {}, config: configResult.data };
      const config = templatedConfigView(configResult.data, scope);

      // Build input flows object
      const inputFlows = Object.fromEntries([...flows.entries()].map(([id, flow]) => [id, flow]));

      // start() function for creating flows from values/sources/factories
      const start = <T>(input: T | Source<T> | Factory<T>): Flow<T> => {
        return createFlowFromInput(input, setTimeoutWrapper, cleanup, onFlowError);
      };

      const reactiveCtx = {
        blockId: ctx.blockId,
        workflowId: ctx.workflowId,
        inputs: inputFlows,
        outputs: outputEmitters,
        config,
        start,
        // Launder unknown -> Serializable without a cast; the value is already
        // serialized downstream. Used for dynamic template ports (emit `case-N`).
        emit: (portId: string, data: unknown) => emitWithCausation(portId, z.any().parse(data)),
        callTool: ctx.callTool,
        listTools: ctx.listTools,
        log: blockLogger,
        get context() {
          return this;
        },
      } as unknown as BlockContext<TInputs, TOutputs, TConfig>;

      // Call setup function
      setup(reactiveCtx);

      // Return instance handle
      return {
        pushInput(portId: string, data: Serializable, causationId?: string): void {
          // Always validate input data; drops are loud (run trace), not silent
          const inputDef = spec.inputs?.[portId];
          if (inputDef) {
            const runtimeSchema = getRuntimeSchema(inputDef.schema);
            const result = runtimeSchema.safeParse(data);
            if (!result.success) {
              blockLogger.warn(`Input validation failed for "${portId}", data dropped`, {
                port: portId,
                error: result.error.message,
              });
              return; // Drop invalid data
            }
          }

          const deliver = () => {
            // Record the latest value so this block's `{{ inputs.<port> }}`
            // expressions resolve against it on the handlers that fire below.
            scope.inputs[portId] = data;

            // Push to flow
            const flow = flows.get(portId);
            if (flow) {
              flow.push(data);
            }
          };

          if (causationId) {
            causation.run(causationId, deliver);
          } else {
            deliver();
          }
        },

        stop(): void {
          // Clean up all subscriptions
          cleanup.cleanup();

          // Clear all flows
          for (const flow of flows.values()) {
            flow.clear();
          }
        },
      };
    },
  };

  // Register the block with the hub
  try {
    getContext().registerBlock(blockDef);
  } catch {
    // Context may not be available during testing or when imported outside plugin runtime
  }

  return blockDef;
}

/**
 * Define a reactive workflow block.
 *
 * Inputs/outputs are typed Zod ports (a port's display name defaults to its key,
 * so `input(z.generic())` is enough), `config` is a Zod object, and `run` holds
 * the reactive setup. `brika build` lowers `meta` into the manifest.
 *
 * @param spec The block definition: `id`, `meta`, `inputs`, `outputs`, `config`,
 *   and `run` (the reactive setup, called once when the block starts).
 * @returns A compiled block the hub can instantiate.
 * @example
 * ```ts
 * import { defineBlock, input, output, z } from '@brika/sdk';
 *
 * export const gate = defineBlock({
 *   id: 'gate',
 *   meta: { name: 'Gate', category: 'transform' },
 *   inputs: { in: input(z.generic()) },          // name "In" from the key
 *   outputs: { out: output(z.generic()) },
 *   config: z.object({ open: z.boolean().default(true) }),
 *   run({ inputs, outputs, config }) {
 *     inputs.in.on((value) => {
 *       if (config.open) outputs.out.emit(value);
 *     });
 *   },
 * });
 * ```
 */
export function defineBlock<
  TInputs extends Record<string, InputDef<z.ZodType | GenericRef<string>>>,
  TOutputs extends Record<string, OutputDef<OutputDefSchema>>,
  TConfig extends z.ZodObject<z.ZodRawShape>,
>(
  spec: ReactiveBlockSpec<TInputs, TOutputs, TConfig> & {
    run: BlockSetup<TInputs, TOutputs, TConfig>;
  }
): CompiledReactiveBlock {
  return compileBlock(spec, spec.run);
}

/**
 * Two-argument block definition.
 *
 * @internal Not part of the public `@brika/sdk` surface (not re-exported from the
 *   package index): plugin authors use {@link defineBlock}. Retained for the SDK's
 *   own block tests, which exercise the compiler against the historical shape.
 */
export function defineReactiveBlock<
  TInputs extends Record<string, InputDef<z.ZodType | GenericRef<string>>>,
  TOutputs extends Record<string, OutputDef<OutputDefSchema>>,
  TConfig extends z.ZodObject<z.ZodRawShape>,
>(
  spec: ReactiveBlockSpec<TInputs, TOutputs, TConfig>,
  setup: BlockSetup<TInputs, TOutputs, TConfig>
): CompiledReactiveBlock {
  return compileBlock(spec, setup);
}

// ─────────────────────────────────────────────────────────────────────────────
// Type Guard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a value is a CompiledReactiveBlock
 */
export function isCompiledReactiveBlock(value: unknown): value is CompiledReactiveBlock {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.start === 'function' &&
    Array.isArray(obj.inputs) &&
    Array.isArray(obj.outputs)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────

/** Convert a marker ref (generic/passthrough/resolved) to a TypeDescriptor-shaped object */
function markerRefToDescriptor(
  schema: PassthroughRef | GenericRef<string> | ResolvedRef
): Record<string, unknown> | null {
  if (schema.__type === 'generic') {
    return { kind: 'generic', typeVar: schema.__generic ?? 'T' };
  }
  if (schema.__type === 'passthrough') {
    return { kind: 'passthrough', sourcePortId: schema.__passthrough ?? '' };
  }
  if (schema.__type === 'resolved') {
    return {
      kind: 'resolved',
      source: schema.__source ?? '',
      configField: schema.__configField ?? '',
    };
  }
  return null;
}

/** Convert JSON Schema to a TypeDescriptor-shaped plain object */
function jsonSchemaToTypeDescriptor(schema: Record<string, unknown>): Record<string, unknown> {
  const composite = jsonSchemaComposite(schema);
  if (composite) {
    return composite;
  }

  const type = schema.type as string | undefined;
  switch (type) {
    case 'string':
      return { kind: 'primitive', type: 'string' };
    case 'number':
    case 'integer':
      return { kind: 'primitive', type: 'number' };
    case 'boolean':
      return { kind: 'primitive', type: 'boolean' };
    case 'null':
      return { kind: 'primitive', type: 'null' };
    case 'array':
      return jsonSchemaArray(schema);
    case 'object':
      return jsonSchemaObject(schema);
    default:
      return { kind: 'unknown' };
  }
}

function jsonSchemaComposite(schema: Record<string, unknown>): Record<string, unknown> | null {
  if (schema.anyOf) {
    const variants = (schema.anyOf as Record<string, unknown>[]).map(jsonSchemaToTypeDescriptor);
    return variants.length === 1 && variants[0] ? variants[0] : { kind: 'union', variants };
  }
  if (schema.oneOf) {
    const variants = (schema.oneOf as Record<string, unknown>[]).map(jsonSchemaToTypeDescriptor);
    return variants.length === 1 && variants[0] ? variants[0] : { kind: 'union', variants };
  }
  if (schema.enum) {
    return { kind: 'enum', values: schema.enum };
  }
  if ('const' in schema) {
    return { kind: 'literal', value: schema.const };
  }
  return null;
}

function jsonSchemaArray(schema: Record<string, unknown>): Record<string, unknown> {
  if (schema.items) {
    return {
      kind: 'array',
      element: jsonSchemaToTypeDescriptor(schema.items as Record<string, unknown>),
    };
  }
  if (schema.prefixItems) {
    return {
      kind: 'tuple',
      elements: (schema.prefixItems as Record<string, unknown>[]).map(jsonSchemaToTypeDescriptor),
    };
  }
  return { kind: 'array', element: { kind: 'unknown' } };
}

function jsonSchemaObject(schema: Record<string, unknown>): Record<string, unknown> {
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!properties) {
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      return {
        kind: 'record',
        value: jsonSchemaToTypeDescriptor(schema.additionalProperties as Record<string, unknown>),
      };
    }
    return { kind: 'record', value: { kind: 'unknown' } };
  }
  const required = new Set((schema.required as string[] | undefined) ?? []);
  const fields: Record<string, { type: Record<string, unknown>; optional: boolean }> = {};
  for (const [key, propSchema] of Object.entries(properties)) {
    fields[key] = {
      type: jsonSchemaToTypeDescriptor(propSchema),
      optional: !required.has(key),
    };
  }
  return { kind: 'object', fields };
}

function zodToBlockSchema(schema: z.ZodObject<z.ZodRawShape>): BlockSchema {
  const json = z.toJSONSchema(schema, {
    unrepresentable: 'any',
  });
  type JsonSchemaProps = Record<
    string,
    {
      type?: string;
      description?: string;
      enum?: Json[];
      default?: Exclude<Json, undefined>;
      format?: string;
      label?: string;
      showWhen?: {
        field: string;
        equals: string | number | boolean | ReadonlyArray<string | number | boolean>;
      };
    }
  >;
  const props =
    (
      json as {
        properties?: JsonSchemaProps;
      }
    ).properties ?? {};
  type PropType = 'string' | 'number' | 'boolean' | 'object' | 'array';
  const validTypes = new Set<PropType>(['string', 'number', 'boolean', 'object', 'array']);
  return {
    type: 'object',
    properties: Object.fromEntries(
      Object.entries(props).map(([k, v]) => [
        k,
        {
          type: (validTypes.has(v.type as PropType) ? v.type : 'string') as PropType,
          description: v.description,
          ...(v.enum
            ? {
                enum: v.enum,
              }
            : {}),
          ...(v.default === undefined
            ? {}
            : {
                default: v.default,
              }),
          ...(v.format ? { format: v.format } : {}),
          ...(v.label ? { label: v.label } : {}),
          ...(v.showWhen ? { showWhen: v.showWhen } : {}),
        },
      ])
    ),
    // A defaulted field is NOT required: the runtime fills the default, so
    // the editor must not flag it. zod's toJSONSchema lists defaulted fields
    // as required (output-type view), the wrong contract for a config form.
    required: (
      (
        json as {
          required?: string[];
        }
      ).required ?? []
    ).filter((key) => props[key]?.default === undefined),
  };
}
