/**
 * Reactive Block Definition
 *
 * Type-safe defineBlock with Zod-typed inputs/outputs.
 * All subscriptions via .to() and .on() are automatically cleaned up when the block stops.
 */

import { z } from 'zod';
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
  type InputDef,
  isSource,
  type OutputDef,
  type ReactiveBlockSpec,
  type Serializable,
  type Source,
  zodToJsonSchema,
} from './reactive';
import type { BlockHandlers, BlockPort, BlockSchema, CompiledBlock } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Block Instance Storage
// ─────────────────────────────────────────────────────────────────────────────

interface BlockInstanceData {
  flows: Map<string, FlowImpl<unknown>>;
  cleanup: CleanupRegistry;
}

const blockInstances = new Map<string, BlockInstanceData>();

function getInstanceKey(workflowId: string, blockId: string): string {
  return `${workflowId}:${blockId}`;
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
 *     tick: output(z.number(), { name: "Tick" }),
 *   },
 *
 *   config: z.object({
 *     minTemp: z.number().default(18),
 *     maxTemp: z.number().default(26),
 *   }),
 *
 * }, ({ inputs, outputs, config, start, log }) => {
 *   // All subscriptions are automatically cleaned up!
 *
 *   // Route input to output
 *   inputs.temperature.to(outputs.display);
 *
 *   // Transform and route
 *   combine(inputs.temperature, inputs.humidity)
 *     .pipe(map(([temp, hum]) => ({
 *       score: Math.round(100 - Math.abs(temp - 22) * 5),
 *       label: temp > 26 ? "Hot" : "Good",
 *     })))
 *     .to(outputs.comfort);
 *
 *   // Conditional routing
 *   inputs.temperature.on(temp => {
 *     if (temp > config.maxTemp) {
 *       outputs.alert.emit(`Too hot: ${temp}°C`);
 *     }
 *   });
 *
 *   // Start from source
 *   start(interval(1000)).to(outputs.tick);
 *
 *   log("info", "Block initialized");
 * });
 * ```
 */
export function defineReactiveBlock<
  TInputs extends Record<string, InputDef<z.ZodType>>,
  TOutputs extends Record<string, OutputDef<z.ZodType>>,
  TConfig extends z.ZodObject<z.ZodRawShape>,
>(
  spec: ReactiveBlockSpec<TInputs, TOutputs, TConfig>,
  setup: BlockSetup<TInputs, TOutputs, TConfig>
): CompiledBlock {
  // Convert config to JSON Schema
  const configJsonSchema = zodToBlockSchema(spec.config);

  // Convert input definitions to BlockPort[] with JSON Schema
  const inputs: BlockPort[] = Object.entries(spec.inputs).map(([id, def]) => ({
    id,
    direction: 'input' as const,
    nameKey: def.meta.name,
    descriptionKey: def.meta.description,
    jsonSchema: zodToJsonSchema(def.schema),
  }));

  // Convert output definitions to BlockPort[] with JSON Schema
  const outputs: BlockPort[] = Object.entries(spec.outputs).map(([id, def]) => ({
    id,
    direction: 'output' as const,
    nameKey: def.meta.name,
    descriptionKey: def.meta.description,
    jsonSchema: zodToJsonSchema(def.schema),
  }));

  // Create block handlers that bridge to reactive API
  const handlers: BlockHandlers = {
    onStart(ctx) {
      const instanceKey = getInstanceKey(ctx.workflowId, ctx.blockId);

      // Create cleanup registry for this block instance
      const cleanup = new CleanupRegistry();

      // setTimeout wrapper that registers cleanup
      const setTimeoutWrapper = (fn: () => void, ms: number): Cleanup => {
        const id = setTimeout(fn, ms);
        const cancel = () => clearTimeout(id);
        cleanup.register(cancel);
        return cancel;
      };

      // Create flows for each input with auto-cleanup
      const flows = new Map<string, FlowImpl<unknown>>();
      for (const id of Object.keys(spec.inputs)) {
        flows.set(id, createFlow<unknown>(setTimeoutWrapper, cleanup));
      }

      // Create emitters for each output
      const outputEmitters = {} as Record<string, Emitter<unknown>>;
      for (const [id, def] of Object.entries(spec.outputs)) {
        outputEmitters[id] = createEmitter<unknown>(id, def.schema, (portId, value) => {
          ctx.emit(portId, value);
        });
      }

      // Parse config
      const configResult = spec.config.safeParse(ctx.config);
      if (!configResult.success) {
        ctx.log('error', `Config validation failed: ${configResult.error.message}`);
        return;
      }

      // Build input flows object
      const inputFlows = Object.fromEntries([...flows.entries()].map(([id, flow]) => [id, flow]));

      // start() function for creating flows from values/sources/factories
      const start = <T>(input: T | Source<T> | Factory<T>): Flow<T> => {
        return createFlowFromInput(input, setTimeoutWrapper, cleanup) as unknown as Flow<T>;
      };

      // Build reactive context
      const reactiveCtx = {
        blockId: ctx.blockId,
        workflowId: ctx.workflowId,
        inputs: inputFlows,
        outputs: outputEmitters,
        config: configResult.data,
        start,
        log: ctx.log,
        callTool: ctx.callTool,
      } as unknown as BlockContext<TInputs, TOutputs, TConfig>;

      // Call setup function
      setup(reactiveCtx);

      // Store instance data for onInput/onStop
      blockInstances.set(instanceKey, { flows, cleanup });
    },

    onInput(portId, data, ctx) {
      const instanceKey = getInstanceKey(ctx.workflowId, ctx.blockId);
      const instance = blockInstances.get(instanceKey);
      if (!instance) return;

      // Validate input data against schema (dev mode)
      if (process.env.NODE_ENV !== 'production') {
        const inputDef = spec.inputs[portId];
        if (inputDef) {
          const result = inputDef.schema.safeParse(data);
          if (!result.success) {
            ctx.log('warn', `Input validation failed for "${portId}": ${result.error.message}`);
          }
        }
      }

      // Push data to the appropriate flow
      const flow = instance.flows.get(portId);
      if (flow) {
        flow._push(data);
      }
    },

    onStop(ctx) {
      const instanceKey = getInstanceKey(ctx.workflowId, ctx.blockId);
      const instance = blockInstances.get(instanceKey);
      if (!instance) return;

      // Clean up all subscriptions automatically
      instance.cleanup.cleanup();

      // Clear all flows
      for (const flow of instance.flows.values()) {
        flow._clear();
      }

      // Remove instance
      blockInstances.delete(instanceKey);
    },
  };

  return {
    id: spec.id,
    name: spec.name ?? spec.id,
    description: spec.description ?? '',
    category: spec.category ?? 'logic',
    icon: spec.icon ?? 'box',
    color: spec.color ?? '#6b7280',
    inputs,
    outputs,
    schema: configJsonSchema,
    handlers,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────

function zodToBlockSchema(schema: z.ZodObject<z.ZodRawShape>): BlockSchema {
  const json = z.toJSONSchema(schema, { unrepresentable: 'any' });
  const props =
    (json as { properties?: Record<string, { type?: string; description?: string }> }).properties ??
    {};
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
        },
      ])
    ),
    required: (json as { required?: string[] }).required ?? [],
  };
}
