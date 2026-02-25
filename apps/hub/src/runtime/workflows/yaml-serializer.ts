/**
 * YAML Serialization/Deserialization
 *
 * Handles converting between Workflow objects and YAML format.
 * Includes schema validation and connection parsing.
 */
import { parsePortRef } from '@brika/workflow';
import { parse as parseYAML, stringify as stringifyYAML } from 'yaml';
import { z } from 'zod';
import type { BlockConnection, Workflow, WorkflowBlock } from './types';

const PositionSchema = z
  .object({ x: z.number(), y: z.number() })
  .transform((pos) => ({ x: Math.round(pos.x), y: Math.round(pos.y) }));

const nonEmptyRecord = <T extends z.ZodTypeAny>(schema: T) =>
  z.optional(schema).transform((val) => (val && Object.keys(val).length > 0 ? val : undefined));

const YAML_OPTIONS = {
  indent: 2,
  lineWidth: 0,
  defaultKeyType: 'PLAIN',
  defaultStringType: 'PLAIN',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// YAML Schemas
// ─────────────────────────────────────────────────────────────────────────────

const YAMLBlockSchema = z.object({
  id: z.string(),
  type: z.string(),
  position: z.optional(PositionSchema),
  config: nonEmptyRecord(z.record(z.string(), z.unknown())),
  inputs: nonEmptyRecord(z.record(z.string(), z.string())),
  outputs: nonEmptyRecord(z.record(z.string(), z.string())),
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
type YAMLWorkflow = z.output<typeof YAMLWorkflowSchema>;

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
      if (!result.success) return null;

      const { workspace, blocks: yamlBlocks = [] } = result.data;
      const blocks: WorkflowBlock[] = yamlBlocks.map((block) => ({
        id: block.id,
        type: block.type,
        position: block.position,
        config: block.config as Record<string, unknown> | undefined,
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
  static toYAML(workflow: Workflow, getPluginInfo: (blockType: string) => { id: string; version: string } | null): string {
    const inputs = new Map<string, Record<string, string>>();
    const outputs = new Map<string, Record<string, string>>();

    // Build connection maps
    for (const conn of workflow.connections ?? []) {
      if (!conn.fromPort || !conn.toPort) continue;

      if (!outputs.has(conn.from)) outputs.set(conn.from, {});
      outputs.get(conn.from)![conn.fromPort] = `${conn.to}:${conn.toPort}`;

      if (!inputs.has(conn.to)) inputs.set(conn.to, {});
      inputs.get(conn.to)![conn.toPort] = `${conn.from}:${conn.fromPort}`;
    }

    // Build plugins list from block registry
    const plugins: Record<string, string> = {};
    for (const block of workflow.blocks) {
      const pluginInfo = getPluginInfo(block.type);
      if (!pluginInfo || plugins[pluginInfo.id]) continue;
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

  static #buildConnections(blocks: YAMLBlock[]): BlockConnection[] {
    const connections: BlockConnection[] = [];
    const seen = new Set<string>();

    for (const block of blocks) {
      YAMLSerializer.#parseOutputConnections(block, connections, seen);
      YAMLSerializer.#parseInputConnections(block, connections, seen);
    }

    return connections;
  }

  static #parseOutputConnections(
    block: YAMLBlock,
    connections: BlockConnection[],
    seen: Set<string>
  ): void {
    if (!block.outputs) return;

    for (const [fromPort, ref] of Object.entries(block.outputs)) {
      try {
        const { blockId: to, portId: toPort } = parsePortRef(ref as `${string}:${string}`);
        const key = `${block.id}:${fromPort}->${to}:${toPort}`;
        if (seen.has(key)) continue;

        seen.add(key);
        connections.push({ from: block.id, fromPort, to, toPort });
      } catch {
        // Skip invalid port references
      }
    }
  }

  static #parseInputConnections(
    block: YAMLBlock,
    connections: BlockConnection[],
    seen: Set<string>
  ): void {
    if (!block.inputs) return;

    for (const [toPort, ref] of Object.entries(block.inputs)) {
      try {
        const { blockId: from, portId: fromPort } = parsePortRef(ref as `${string}:${string}`);
        const key = `${from}:${fromPort}->${block.id}:${toPort}`;
        if (seen.has(key)) continue;

        seen.add(key);
        connections.push({ from, fromPort, to: block.id, toPort });
      } catch {
        // Skip invalid port references
      }
    }
  }
}
