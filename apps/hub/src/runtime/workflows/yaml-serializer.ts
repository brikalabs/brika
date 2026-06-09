/**
 * YAML Serialization/Deserialization
 *
 * Handles converting between Workflow objects and YAML format.
 * Includes schema validation and connection parsing.
 */
import { parsePortRef } from '@brika/workflow';
import { parse as parseYAML, stringify as stringifyYAML } from 'yaml';
import { z } from 'zod';
import type { Json } from '@/types';
import { nonEmptyRecord, PositionSchema } from './schemas';
import type { BlockConnection, Workflow, WorkflowBlock } from './types';

const YAML_OPTIONS = {
  indent: 2,
  lineWidth: 0,
  defaultKeyType: 'PLAIN',
  defaultStringType: 'PLAIN',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// YAML Schemas
// ─────────────────────────────────────────────────────────────────────────────

const jsonValue: z.ZodType<Json> = z.any();

/**
 * A port may reference one peer (`"block:port"`) or many (an array), enabling
 * fan-out (one output to several inputs) and fan-in (several outputs into one
 * input). A single ref is kept as a plain string so simple workflows stay terse.
 */
const PortRefValue = z.union([z.string(), z.array(z.string())]);

const YAMLBlockSchema = z.object({
  id: z.string(),
  type: z.string(),
  position: z.optional(PositionSchema),
  config: nonEmptyRecord(z.record(z.string(), jsonValue)),
  inputs: nonEmptyRecord(z.record(z.string(), PortRefValue)),
  outputs: nonEmptyRecord(z.record(z.string(), PortRefValue)),
});

const YAMLWorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.optional(z.string()),
  enabled: z.boolean(),
});

const YAMLWorkflowSchema = z.object({
  version: z.optional(z.string()),
  workspace: YAMLWorkspaceSchema,
  plugins: z.optional(z.record(z.string(), z.string())),
  blocks: z.optional(z.array(YAMLBlockSchema)),
});

type YAMLBlock = z.infer<typeof YAMLBlockSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Serializer
// ─────────────────────────────────────────────────────────────────────────────

export class YAMLSerializer {
  /**
   * Parse YAML string and convert to Workflow object.
   * Returns null if validation fails.
   */
  static fromYAML(yamlString: string): Workflow | null {
    try {
      const yaml = parseYAML(yamlString);
      const result = YAMLWorkflowSchema.safeParse(yaml);
      if (!result.success) {
        return null;
      }

      const { workspace, blocks: yamlBlocks = [] } = result.data;
      const blocks: WorkflowBlock[] = yamlBlocks.map((block) => ({
        id: block.id,
        type: block.type,
        position: block.position,
        config: block.config,
      }));

      return {
        id: workspace.id,
        name: workspace.name ?? workspace.id,
        description: workspace.description,
        enabled: workspace.enabled,
        blocks,
        connections: YAMLSerializer.#buildConnections(yamlBlocks),
      };
    } catch {
      return null;
    }
  }

  /**
   * Convert Workflow object to YAML string.
   */
  static toYAML(
    workflow: Workflow,
    getPluginInfo: (blockType: string) => {
      id: string;
      version: string;
    } | null
  ): string {
    const { inputs, outputs } = YAMLSerializer.#buildConnectionMaps(workflow.connections ?? []);

    // Build plugins list from block registry
    const plugins: Record<string, string> = {};
    for (const block of workflow.blocks) {
      const pluginInfo = getPluginInfo(block.type);
      if (!pluginInfo || plugins[pluginInfo.id]) {
        continue;
      }
      plugins[pluginInfo.id] = pluginInfo.version;
    }

    // Build and validate YAML structure
    const yamlWorkflow = YAMLWorkflowSchema.parse({
      version: '1',
      workspace: {
        id: workflow.id,
        name: workflow.name ?? workflow.id,
        description: workflow.description,
        enabled: workflow.enabled,
      },
      blocks: workflow.blocks.map((block) => ({
        id: block.id,
        type: block.type,
        position: block.position,
        config: block.config,
        inputs: inputs.get(block.id),
        outputs: outputs.get(block.id),
      })),
      plugins: Object.keys(plugins).length > 0 ? plugins : undefined,
    });

    return stringifyYAML(yamlWorkflow, YAML_OPTIONS);
  }

  static #buildConnectionMaps(connections: BlockConnection[]): {
    inputs: Map<string, Record<string, string | string[]>>;
    outputs: Map<string, Record<string, string | string[]>>;
  } {
    const inputs = new Map<string, Record<string, string | string[]>>();
    const outputs = new Map<string, Record<string, string | string[]>>();

    for (const conn of connections) {
      if (!conn.fromPort || !conn.toPort) {
        continue;
      }
      YAMLSerializer.#addPortRef(outputs, conn.from, conn.fromPort, `${conn.to}:${conn.toPort}`);
      YAMLSerializer.#addPortRef(inputs, conn.to, conn.toPort, `${conn.from}:${conn.fromPort}`);
    }

    return {
      inputs,
      outputs,
    };
  }

  /**
   * Record a peer ref on a port. The first ref stays a plain string; additional
   * distinct refs promote the entry to an array (fan-out / fan-in).
   */
  static #addPortRef(
    map: Map<string, Record<string, string | string[]>>,
    blockId: string,
    port: string,
    ref: string
  ): void {
    if (!map.has(blockId)) {
      map.set(blockId, {});
    }
    const entry = map.get(blockId);
    if (!entry) {
      return;
    }
    const existing = entry[port];
    if (existing === undefined) {
      entry[port] = ref;
    } else if (Array.isArray(existing)) {
      if (!existing.includes(ref)) {
        existing.push(ref);
      }
    } else if (existing !== ref) {
      entry[port] = [existing, ref];
    }
  }

  static #buildConnections(blocks: YAMLBlock[]): BlockConnection[] {
    const connections: BlockConnection[] = [];
    const seen = new Set<string>();

    for (const block of blocks) {
      YAMLSerializer.#parseOutputConnections(block, connections, seen);
      YAMLSerializer.#parseInputConnections(block, connections, seen);
    }

    return connections;
  }

  /** Normalize a port's YAML value (one ref or many) to an array of refs. */
  static #toRefs(value: string | string[]): string[] {
    return Array.isArray(value) ? value : [value];
  }

  static #parseOutputConnections(
    block: YAMLBlock,
    connections: BlockConnection[],
    seen: Set<string>
  ): void {
    if (!block.outputs) {
      return;
    }

    for (const [fromPort, refValue] of Object.entries(block.outputs)) {
      for (const ref of YAMLSerializer.#toRefs(refValue)) {
        try {
          const { blockId: to, portId: toPort } = parsePortRef(ref as `${string}:${string}`);
          const key = `${block.id}:${fromPort}->${to}:${toPort}`;
          if (seen.has(key)) {
            continue;
          }

          seen.add(key);
          connections.push({
            from: block.id,
            fromPort,
            to,
            toPort,
          });
        } catch {
          // Skip invalid port references
        }
      }
    }
  }

  static #parseInputConnections(
    block: YAMLBlock,
    connections: BlockConnection[],
    seen: Set<string>
  ): void {
    if (!block.inputs) {
      return;
    }

    for (const [toPort, refValue] of Object.entries(block.inputs)) {
      for (const ref of YAMLSerializer.#toRefs(refValue)) {
        try {
          const { blockId: from, portId: fromPort } = parsePortRef(ref as `${string}:${string}`);
          const key = `${from}:${fromPort}->${block.id}:${toPort}`;
          if (seen.has(key)) {
            continue;
          }

          seen.add(key);
          connections.push({
            from,
            fromPort,
            to: block.id,
            toPort,
          });
        } catch {
          // Skip invalid port references
        }
      }
    }
  }
}
