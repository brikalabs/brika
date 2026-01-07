/**
 * Block Registry
 *
 * Central registry for block definitions received from plugins.
 * Provides block metadata to UI and validates block configs.
 */

import type { BlockDefinition } from '@brika/sdk';
import type { BlockSummary } from '@brika/shared';
import { inject, singleton } from '@brika/shared';
import { LogRouter } from '@/runtime/logs/log-router';

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
  private readonly logs = inject(LogRouter);

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
      this.logs.warn('block.duplicate', {
        type: fullType,
        existing: this.#blocks.get(fullType)?.pluginId ?? null,
        new: pluginId,
      });
    }

    // Set the full type on the definition
    this.#blocks.set(fullType, { ...block, type: fullType, pluginId });
    this.logs.info('block.registered', {
      type: fullType,
      plugin: pluginId,
      inputs: block.inputs?.length ?? 0,
      outputs: block.outputs?.length ?? 0,
    });

    // Notify listeners
    for (const listener of this.#onRegisterListeners) {
      try {
        listener(fullType);
      } catch (e) {
        this.logs.error('block.register.listener.error', { type: fullType, error: String(e) });
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
      this.logs.info('blocks.unregistered', { plugin: pluginId, count });
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
        inputs: b.inputs.map((p) => ({ id: p.id, typeName: p.typeName })),
        outputs: b.outputs.map((p) => ({ id: p.id, typeName: p.typeName })),
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

    // Check required fields
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in config)) {
          errors.push(`Missing required field: ${field}`);
        }
      }
    }

    // Basic type validation
    if (schema.properties) {
      for (const [key, prop] of Object.entries(schema.properties)) {
        if (key in config) {
          const value = config[key];
          if (!validateType(value, prop.type)) {
            errors.push(`Field "${key}" should be ${prop.type}`);
          }
        }
      }
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
