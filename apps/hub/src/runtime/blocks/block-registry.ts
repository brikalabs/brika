/**
 * Block Registry
 *
 * Central registry for block definitions received from plugins.
 */

import { inject, singleton } from '@brika/di';
import { arePortTypesCompatible } from '@brika/plugin';
import type { BlockDefinition } from '@brika/sdk';

/** Runtime block info (includes ports from running plugin) */
export interface BlockSummary {
  /** Full block ID (e.g., "@brika/blocks-builtin:condition") */
  id: string;
  /** Display name */
  name?: string;
  /** Block description */
  description?: string;
  /** Block category */
  category?: 'trigger' | 'flow' | 'action' | 'transform';
  /** Lucide icon name */
  icon?: string;
  /** Hex color */
  color?: string;
  /** Input ports */
  inputs?: Array<{ id: string; name: string; typeName?: string }>;
  /** Output ports */
  outputs?: Array<{ id: string; name: string; typeName?: string }>;
}

import { Logger } from '@/runtime/logs/log-router';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PluginInfo {
  id: string;
  version: string;
  name?: string;
  description?: string;
  author?: string;
  icon?: string;
  homepage?: string;
}

interface RegisteredBlock extends BlockDefinition {
  pluginId: string;
  name?: string;
  description?: string;
  category?: string;
  icon?: string;
  color?: string;
}

type ValidationResult = { valid: boolean; errors?: string[] };

// ─────────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────────

@singleton()
export class BlockRegistry {
  private readonly logs = inject(Logger).withSource('registry');
  readonly #blocks = new Map<string, RegisteredBlock>();
  readonly #plugins = new Map<string, PluginInfo>();
  readonly #listeners = new Set<(type: string) => void>();

  get size(): number {
    return this.#blocks.size;
  }

  onBlockRegistered(listener: (type: string) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  register(block: BlockDefinition, plugin: PluginInfo): void {
    const type = `${plugin.id}:${block.id}`;

    if (this.#blocks.has(type)) {
      this.logs.warn('Duplicate block registration', { type, plugin: plugin.id });
    }

    this.#plugins.set(plugin.id, plugin);
    this.#blocks.set(type, { ...block, type, pluginId: plugin.id });

    this.logs.info('Block registered', { type, plugin: plugin.id, version: plugin.version });
    this.#notifyListeners(type);
  }

  unregisterPlugin(pluginId: string): number {
    let count = 0;
    for (const [type, block] of this.#blocks) {
      if (block.pluginId === pluginId) {
        this.#blocks.delete(type);
        count++;
      }
    }
    if (count > 0) {
      this.#plugins.delete(pluginId);
      this.logs.info('Plugin unregistered', { plugin: pluginId, blocks: count });
    }
    return count;
  }

  get(type: string): RegisteredBlock | undefined {
    return this.#blocks.get(type);
  }

  has(type: string): boolean {
    return this.#blocks.has(type);
  }

  list(): BlockDefinition[] {
    return [...this.#blocks.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  listByPlugin(pluginId: string): BlockDefinition[] {
    return [...this.#blocks.values()].filter((b) => b.pluginId === pluginId);
  }

  listByOwner(pluginId: string): BlockSummary[] {
    return [...this.#blocks.values()]
      .filter((b) => b.pluginId === pluginId)
      .map((b) => ({
        id: b.type ?? `${b.pluginId}:${b.id}`,
        name: b.name,
        description: b.description,
        category: b.category as BlockSummary['category'],
        icon: b.icon,
        color: b.color,
        inputs: b.inputs.map((p) => ({ id: p.id, name: p.name, typeName: p.typeName })),
        outputs: b.outputs.map((p) => ({ id: p.id, name: p.name, typeName: p.typeName })),
      }));
  }

  listByCategory(): Record<string, BlockDefinition[]> {
    const result: Record<string, BlockDefinition[]> = {};
    for (const block of this.#blocks.values()) {
      const category = block.category ?? 'other';
      result[category] ??= [];
      result[category].push(block);
    }
    return result;
  }

  getProvider(type: string): string | undefined {
    return this.#blocks.get(type)?.pluginId;
  }

  getPluginInfo(type: string): PluginInfo | undefined {
    const pluginId = this.getProvider(type);
    return pluginId ? this.#plugins.get(pluginId) : undefined;
  }

  getPlugins(): PluginInfo[] {
    return [...this.#plugins.values()];
  }

  validateConfig(type: string, config: Record<string, unknown>): ValidationResult {
    const block = this.#blocks.get(type);
    if (!block) return { valid: false, errors: [`Unknown block type: ${type}`] };

    const errors: string[] = [];
    const { schema } = block;

    // Validate required fields
    for (const field of schema.required ?? []) {
      if (!(field in config)) errors.push(`Missing required field: ${field}`);
    }

    // Validate property types
    for (const [key, prop] of Object.entries(schema.properties ?? {})) {
      if (key in config && !this.#isValidType(config[key], prop.type)) {
        errors.push(`Field "${key}" should be ${prop.type}`);
      }
    }

    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }

  validateConnections(
    blocks: Array<{ id: string; type: string }>,
    connections: Array<{ from: string; fromPort?: string; to: string; toPort?: string }>
  ): ValidationResult {
    const errors: string[] = [];
    const blockMap = new Map(blocks.map((b) => [b.id, b]));

    for (const conn of connections) {
      this.#validateSingleConnection(conn, blockMap, errors);
    }

    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }

  #validateSingleConnection(
    conn: { from: string; fromPort?: string; to: string; toPort?: string },
    blockMap: Map<string, { id: string; type: string }>,
    errors: string[]
  ): void {
    const fromBlock = blockMap.get(conn.from);
    const toBlock = blockMap.get(conn.to);

    if (!fromBlock) {
      errors.push(`Unknown source block: ${conn.from}`);
      return;
    }
    if (!toBlock) {
      errors.push(`Unknown target block: ${conn.to}`);
      return;
    }

    const fromDef = this.get(fromBlock.type);
    const toDef = this.get(toBlock.type);

    if (!fromDef) {
      errors.push(`Unknown block type: ${fromBlock.type}`);
      return;
    }
    if (!toDef) {
      errors.push(`Unknown block type: ${toBlock.type}`);
      return;
    }

    const fromPortId = conn.fromPort ?? 'out';
    const toPortId = conn.toPort ?? 'in';

    const fromPort = fromDef.outputs.find((p) => p.id === fromPortId);
    const toPort = toDef.inputs.find((p) => p.id === toPortId);

    if (!fromPort) {
      errors.push(`Block "${fromBlock.id}" has no output port "${fromPortId}"`);
      return;
    }
    if (!toPort) {
      errors.push(`Block "${toBlock.id}" has no input port "${toPortId}"`);
      return;
    }

    if (!arePortTypesCompatible(fromPort.typeName, toPort.typeName)) {
      errors.push(
        `Type mismatch: ${fromBlock.id}.${fromPortId} (${fromPort.typeName}) → ${toBlock.id}.${toPortId} (${toPort.typeName})`
      );
    }
  }

  #notifyListeners(type: string): void {
    for (const listener of this.#listeners) {
      try {
        listener(type);
      } catch (error) {
        this.logs.error('Listener failed', { type }, { error });
      }
    }
  }

  #isValidType(value: unknown, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number';
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      default:
        return true;
    }
  }
}
