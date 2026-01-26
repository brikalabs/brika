/**
 * Block Registry
 *
 * Central registry for block definitions received from plugins.
 * Provides block metadata to UI and validates block configs.
 */

import type { BlockDefinition } from '@brika/sdk';
import type { BlockSummary } from '@brika/shared';
import { arePortTypesCompatible, inject, singleton } from '@brika/shared';
import { Logger } from '@/runtime/logs/log-router';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Block with provider info and package.json metadata */
interface RegisteredBlock extends BlockDefinition {
  pluginId: string;
  // From package.json
  name?: string;
  description?: string;
  category?: string;
  icon?: string;
  color?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────────

@singleton()
export class BlockRegistry {
  private readonly logs = inject(Logger).withSource('registry');

  /** Block definitions by type */
  readonly #blocks = new Map<string, RegisteredBlock>();

  /** Listeners called when a block is registered */
  readonly #onRegisterListeners = new Set<(type: string) => void>();

  /**
   * Get number of registered blocks
   */
  get size(): number {
    return this.#blocks.size;
  }

  /**
   * Subscribe to block registration events
   */
  onBlockRegistered(listener: (type: string) => void): () => void {
    this.#onRegisterListeners.add(listener);
    return () => this.#onRegisterListeners.delete(listener);
  }

  /**
   * Register a block definition from a plugin
   * The full type will be `pluginId:blockId` (e.g., "blocks-builtin:condition")
   */
  register(block: BlockDefinition, pluginId: string): void {
    // Create full qualified type: pluginId:blockId
    const fullType = `${pluginId}:${block.id}`;

    if (this.#blocks.has(fullType)) {
      this.logs.warn('Duplicate block registration detected', {
        blockType: fullType,
        existingPlugin: this.#blocks.get(fullType)?.pluginId ?? null,
        newPlugin: pluginId,
      });
    }

    // Set the full type on the definition
    this.#blocks.set(fullType, { ...block, type: fullType, pluginId });
    this.logs.info('Block registered successfully', {
      blockType: fullType,
      pluginId: pluginId,
      inputCount: block.inputs?.length ?? 0,
      outputCount: block.outputs?.length ?? 0,
    });

    // Notify listeners
    for (const listener of this.#onRegisterListeners) {
      try {
        listener(fullType);
      } catch (e) {
        this.logs.error(
          'Block registration listener failed',
          {
            blockType: fullType,
          },
          { error: e }
        );
      }
    }
  }

  /**
   * Unregister all blocks from a plugin
   */
  unregisterPlugin(pluginId: string): number {
    let count = 0;
    for (const [type, block] of this.#blocks) {
      if (block.pluginId === pluginId) {
        this.#blocks.delete(type);
        count++;
      }
    }
    if (count > 0) {
      this.logs.info('Blocks unregistered from plugin', {
        pluginId: pluginId,
        count: count,
      });
    }
    return count;
  }

  /**
   * Get a block definition by type
   */
  get(type: string): RegisteredBlock | undefined {
    return this.#blocks.get(type);
  }

  /**
   * Check if a block type exists
   */
  has(type: string): boolean {
    return this.#blocks.has(type);
  }

  /**
   * Get all registered block definitions
   */
  list(): BlockDefinition[] {
    return [...this.#blocks.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  /**
   * Get blocks registered by a specific plugin
   */
  listByPlugin(pluginId: string): BlockDefinition[] {
    return [...this.#blocks.values()].filter((b) => b.pluginId === pluginId);
  }

  /**
   * Get blocks by owner (alias for listByPlugin) returning BlockSummary
   */
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

  /**
   * Get blocks grouped by category
   */
  listByCategory(): Record<string, BlockDefinition[]> {
    const result: Record<string, BlockDefinition[]> = {};
    for (const block of this.#blocks.values()) {
      const category = block.category || 'other';
      if (!result[category]) result[category] = [];
      result[category].push(block);
    }
    return result;
  }

  /**
   * Get the plugin ID that provides a block
   */
  getProvider(type: string): string | undefined {
    return this.#blocks.get(type)?.pluginId;
  }

  /**
   * Validate block config against its schema
   */
  validateConfig(
    type: string,
    config: Record<string, unknown>
  ): { valid: boolean; errors?: string[] } {
    const block = this.#blocks.get(type);
    if (!block) {
      return { valid: false, errors: [`Unknown block type: ${type}`] };
    }

    const errors: string[] = [];
    const schema = block.schema;

    this.validateRequiredFields(schema, config, errors);
    this.validatePropertyTypes(schema, config, errors);

    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }

  /**
   * Validate required fields in config
   */
  private validateRequiredFields(
    schema: { required?: string[] },
    config: Record<string, unknown>,
    errors: string[]
  ): void {
    if (!schema.required) return;

    for (const field of schema.required) {
      if (!(field in config)) {
        errors.push(`Missing required field: ${field}`);
      }
    }
  }

  /**
   * Validate property types in config
   */
  private validatePropertyTypes(
    schema: { properties?: Record<string, { type: string }> },
    config: Record<string, unknown>,
    errors: string[]
  ): void {
    if (!schema.properties) return;

    for (const [key, prop] of Object.entries(schema.properties)) {
      if (key in config) {
        const value = config[key];
        if (!validateType(value, prop.type)) {
          errors.push(`Field "${key}" should be ${prop.type}`);
        }
      }
    }
  }

  /**
   * Validate a single connection for block existence and type definitions
   */
  private validateConnectionBlocks(
    conn: { from: string; to: string },
    blockMap: Map<string, { id: string; type: string }>,
    errors: string[]
  ): {
    sourceBlock?: { id: string; type: string };
    targetBlock?: { id: string; type: string };
    sourceDef?: BlockDefinition;
    targetDef?: BlockDefinition;
  } {
    const sourceBlock = blockMap.get(conn.from);
    const targetBlock = blockMap.get(conn.to);

    if (!sourceBlock) {
      errors.push(`Connection references unknown source block: ${conn.from}`);
      return {};
    }
    if (!targetBlock) {
      errors.push(`Connection references unknown target block: ${conn.to}`);
      return {};
    }

    const sourceDef = this.get(sourceBlock.type);
    const targetDef = this.get(targetBlock.type);

    if (!sourceDef) {
      errors.push(`Unknown block type: ${sourceBlock.type}`);
      return { sourceBlock, targetBlock };
    }
    if (!targetDef) {
      errors.push(`Unknown block type: ${targetBlock.type}`);
      return { sourceBlock, targetBlock, sourceDef };
    }

    return { sourceBlock, targetBlock, sourceDef, targetDef };
  }

  /**
   * Validate connection ports existence and type compatibility
   */
  private validateConnectionPorts(
    conn: { from: string; fromPort?: string; to: string; toPort?: string },
    sourceBlock: { id: string; type: string },
    targetBlock: { id: string; type: string },
    sourceDef: BlockDefinition,
    targetDef: BlockDefinition,
    errors: string[]
  ): void {
    const sourcePort = sourceDef.outputs.find((p) => p.id === (conn.fromPort || 'out'));
    const targetPort = targetDef.inputs.find((p) => p.id === (conn.toPort || 'in'));

    if (!sourcePort) {
      errors.push(
        `Block "${sourceBlock.id}" (${sourceBlock.type}) has no output port "${conn.fromPort || 'out'}"`
      );
      return;
    }
    if (!targetPort) {
      errors.push(
        `Block "${targetBlock.id}" (${targetBlock.type}) has no input port "${conn.toPort || 'in'}"`
      );
      return;
    }

    // Check type compatibility
    if (!arePortTypesCompatible(sourcePort.typeName, targetPort.typeName)) {
      errors.push(
        `Type mismatch: ${sourceBlock.id}.${conn.fromPort || 'out'} (${sourcePort.typeName || 'unknown'}) → ${targetBlock.id}.${conn.toPort || 'in'} (${targetPort.typeName || 'unknown'})`
      );
    }
  }

  /**
   * Validate workflow connections for type compatibility
   */
  validateConnections(
    blocks: Array<{ id: string; type: string }>,
    connections: Array<{ from: string; fromPort?: string; to: string; toPort?: string }>
  ): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const blockMap = new Map(blocks.map((b) => [b.id, b]));

    for (const conn of connections) {
      const { sourceBlock, targetBlock, sourceDef, targetDef } = this.validateConnectionBlocks(
        conn,
        blockMap,
        errors
      );

      if (!sourceBlock || !targetBlock || !sourceDef || !targetDef) {
        continue;
      }

      this.validateConnectionPorts(conn, sourceBlock, targetBlock, sourceDef, targetDef, errors);
    }

    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function validateType(value: unknown, expectedType: string): boolean {
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
