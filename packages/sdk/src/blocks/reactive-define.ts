/**
 * Reactive Block Definition
 *
 * Type-safe defineBlock with Zod-typed inputs/outputs.
 * All subscriptions via .to() and .on() are automatically cleaned up when the block stops.
 */

import type { Serializable } from '@brika/serializable';
import { z } from 'zod';
import { log } from '../api/logging';
import { getContext } from '../context';
import type { Json } from '../types';
import {
  type BlockContext,
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
  emit(portId: string, data: Serializable): void;
}

/** Running block instance */
export interface BlockInstance {
  /** Push data to an input port */
  pushInput(portId: string, data: Serializable): void;
  /** Stop the block and clean up */
  stop(): void;
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
 *   name: "Comfort Index",
 *   category: "sensors",
 *   icon: "thermometer",
 *   color: "#10b981",
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

export function defineReactiveBlock<
  TInputs extends Record<string, InputDef<z.ZodType | GenericRef<string>>>,
  TOutputs extends Record<string, OutputDef<OutputDefSchema>>,
  TConfig extends z.ZodObject<z.ZodRawShape>,
>(
  spec: ReactiveBlockSpec<TInputs, TOutputs, TConfig>,
  setup: BlockSetup<TInputs, TOutputs, TConfig>
): CompiledReactiveBlock {
  const configJsonSchema = zodToBlockSchema(spec.config);

  // Get TypeScript-like type name from schema (not resolving passthrough/resolved)
  const getBaseTypeName = (schema: OutputDefSchema): string => {
    if (schema && typeof schema === 'object' && '__type' in schema) {
      if (schema.__type === 'generic') return `generic<${schema.__generic}>`;
      // Don't resolve passthrough here - it will be resolved later
      if (schema.__type === 'passthrough') return `__passthrough:${schema.__passthrough}`;
      // Resolved types use $resolve:source:configField format for UI type inference
      if (schema.__type === 'resolved') {
        return `$resolve:${schema.__source}:${schema.__configField}`;
      }
    }
    return zodToTypeName(schema);
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
      return (schema as GenericRef | PassthroughRef | ResolvedRef)._schema;
    }
    return schema;
  };

  // Build input map for passthrough resolution
  const inputMap = new Map<string, { typeName: string; jsonSchema?: Record<string, unknown> }>();
  for (const [id, def] of Object.entries(spec.inputs)) {
    inputMap.set(id, {
      typeName: getBaseTypeName(def.schema),
      jsonSchema: getJsonSchema(def.schema),
    });
  }

  // Convert input definitions to BlockPort[]
  const inputs: BlockPort[] = Object.entries(spec.inputs).map(([id, def]) => ({
    id,
    name: def.meta.name,
    direction: 'input' as const,
    typeName: getBaseTypeName(def.schema),
    jsonSchema: getJsonSchema(def.schema),
  }));

  // Convert output definitions to BlockPort[] - resolve passthrough to input type
  const outputs: BlockPort[] = Object.entries(spec.outputs).map(([id, def]) => {
    const baseTypeName = getBaseTypeName(def.schema);

    // If it's a passthrough, resolve to the linked input's type
    if (baseTypeName.startsWith('__passthrough:')) {
      const inputId = baseTypeName.replace('__passthrough:', '');
      const linkedInput = inputMap.get(inputId);
      if (linkedInput) {
        return {
          id,
          name: def.meta.name,
          direction: 'output' as const,
          typeName: linkedInput.typeName,
          jsonSchema: linkedInput.jsonSchema,
        };
      }
    }

    return {
      id,
      name: def.meta.name,
      direction: 'output' as const,
      typeName: baseTypeName,
      jsonSchema: getJsonSchema(def.schema),
    };
  });

  // Create the block definition
  const blockDef: CompiledReactiveBlock = {
    id: spec.id,
    inputs,
    outputs,
    schema: configJsonSchema,

    // Start function - creates reactive context and runs setup
    start(ctx: BlockRuntimeContext): BlockInstance {
      // Create cleanup registry
      const cleanup = new CleanupRegistry();

      // setTimeout wrapper with auto-cleanup
      const setTimeoutWrapper = (fn: () => void, ms: number): Cleanup => {
        const id = setTimeout(fn, ms);
        const cancel = () => clearTimeout(id);
        cleanup.register(cancel);
        return cancel;
      };

      // Create flows for each input
      const flows = new Map<string, FlowImpl<unknown>>();
      for (const id of Object.keys(spec.inputs)) {
        flows.set(id, createFlow<unknown>(setTimeoutWrapper, cleanup));
      }

      // Create emitters for each output
      const outputEmitters = {} as Record<string, Emitter<unknown>>;
      for (const [id, def] of Object.entries(spec.outputs)) {
        outputEmitters[id] = createEmitter<unknown>(id, getRuntimeSchema(def.schema), ctx.emit);
      }

      // Parse and validate config
      const configResult = spec.config.safeParse(ctx.config);
      if (!configResult.success) {
        log.error(`Config validation failed: ${configResult.error.message}`);
      }
      const config = configResult.success ? configResult.data : ({} as z.infer<TConfig>);

      // Build input flows object
      const inputFlows = Object.fromEntries([...flows.entries()].map(([id, flow]) => [id, flow]));

      // start() function for creating flows from values/sources/factories
      const start = <T>(input: T | Source<T> | Factory<T>): Flow<T> => {
        return createFlowFromInput(input, setTimeoutWrapper, cleanup) as unknown as Flow<T>;
      };

      const reactiveCtx = {
        blockId: ctx.blockId,
        workflowId: ctx.workflowId,
        inputs: inputFlows,
        outputs: outputEmitters,
        config,
        start,
        get context() {
          return this;
        },
      } as unknown as BlockContext<TInputs, TOutputs, TConfig>;

      // Call setup function
      setup(reactiveCtx);

      // Return instance handle
      return {
        pushInput(portId: string, data: Serializable): void {
          // Validate in dev mode
          if (process.env.NODE_ENV !== 'production') {
            const inputDef = spec.inputs[portId];
            if (inputDef) {
              const runtimeSchema = getRuntimeSchema(inputDef.schema);
              const result = runtimeSchema.safeParse(data);
              if (!result.success) {
                log.warn(`Input validation failed for "${portId}": ${result.error.message}`);
              }
            }
          }

          // Push to flow
          const flow = flows.get(portId);
          if (flow) {
            flow.push(data);
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

// ─────────────────────────────────────────────────────────────────────────────
// Type Guard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a value is a CompiledReactiveBlock
 */
export function isCompiledReactiveBlock(value: unknown): value is CompiledReactiveBlock {
  if (typeof value !== 'object' || value === null) return false;
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

function zodToBlockSchema(schema: z.ZodObject<z.ZodRawShape>): BlockSchema {
  const json = z.toJSONSchema(schema, { unrepresentable: 'any' });
  type JsonSchemaProps = Record<
    string,
    { type?: string; description?: string; enum?: Json[]; default?: Json }
  >;
  const props = (json as { properties?: JsonSchemaProps }).properties ?? {};
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
          ...(v.enum ? { enum: v.enum } : {}),
          ...(v.default === undefined ? {} : { default: v.default }),
        },
      ])
    ),
    required: (json as { required?: string[] }).required ?? [],
  };
}
