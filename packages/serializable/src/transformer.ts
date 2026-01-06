/**
 * Generic Transformer System
 *
 * Extensible serialization for custom types.
 * All custom types implement a common interface.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Transformer Interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transformer for a custom type.
 * Handles serialization/deserialization of non-JSON types.
 */
export interface Transformer<T, S = unknown> {
  /** Unique type name (used as marker in serialized data) */
  name: string;

  /** Check if a value is of this type */
  isApplicable(value: unknown): value is T;

  /** Serialize to JSON-compatible format */
  serialize(value: T): S | Promise<S>;

  /** Deserialize back to original type */
  deserialize(data: S): T | Promise<T>;

  /** Whether serialize/deserialize are async */
  isAsync?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Serialized Value Wrapper
// ─────────────────────────────────────────────────────────────────────────────

/** Marker for serialized custom types */
const TYPE_MARKER = '__brika_type__';

interface SerializedCustom<S = unknown> {
  [TYPE_MARKER]: string;
  data: S;
}

function isSerializedCustom(value: unknown): value is SerializedCustom {
  return (
    typeof value === 'object' &&
    value !== null &&
    TYPE_MARKER in value &&
    typeof (value as Record<string, unknown>)[TYPE_MARKER] === 'string'
  );
}

function wrapSerialized<S>(name: string, data: S): SerializedCustom<S> {
  return { [TYPE_MARKER]: name, data };
}

// ─────────────────────────────────────────────────────────────────────────────
// Transformer Registry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registry for custom type transformers.
 */
export class TransformerRegistry {
  readonly #transformers = new Map<string, Transformer<unknown>>();
  #hasAsync = false;

  /**
   * Register a custom transformer.
   */
  register<T, S>(transformer: Transformer<T, S>): this {
    this.#transformers.set(transformer.name, transformer as Transformer<unknown>);
    if (transformer.isAsync) {
      this.#hasAsync = true;
    }
    return this;
  }

  /**
   * Check if any async transformers are registered.
   */
  get hasAsyncTransformers(): boolean {
    return this.#hasAsync;
  }

  /**
   * Find transformer for a value.
   */
  findForValue(value: unknown): Transformer<unknown> | undefined {
    for (const transformer of this.#transformers.values()) {
      if (transformer.isApplicable(value)) {
        return transformer;
      }
    }
    return undefined;
  }

  /**
   * Find transformer by name.
   */
  findByName(name: string): Transformer<unknown> | undefined {
    return this.#transformers.get(name);
  }

  /**
   * Recursively serialize a value and all nested custom types.
   */
  async serialize(value: unknown): Promise<unknown> {
    // Handle null/undefined
    if (value === null || value === undefined) {
      return value;
    }

    // Check for custom type
    const transformer = this.findForValue(value);
    if (transformer) {
      const serialized = await Promise.resolve(transformer.serialize(value));
      return wrapSerialized(transformer.name, serialized);
    }

    // Handle Date (built-in special case)
    if (value instanceof Date) {
      return wrapSerialized('Date', value.toISOString());
    }

    // Handle Map
    if (value instanceof Map) {
      const entries: [unknown, unknown][] = [];
      for (const [k, v] of value) {
        entries.push([await this.serialize(k), await this.serialize(v)]);
      }
      return wrapSerialized('Map', entries);
    }

    // Handle Set
    if (value instanceof Set) {
      const items: unknown[] = [];
      for (const item of value) {
        items.push(await this.serialize(item));
      }
      return wrapSerialized('Set', items);
    }

    // Handle Array
    if (Array.isArray(value)) {
      return Promise.all(value.map((item) => this.serialize(item)));
    }

    // Handle plain object
    if (typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = await this.serialize(val);
      }
      return result;
    }

    // Primitives pass through
    return value;
  }

  /**
   * Recursively deserialize a value and all nested custom types.
   */
  async deserialize(value: unknown): Promise<unknown> {
    // Handle null/undefined
    if (value === null || value === undefined) {
      return value;
    }

    // Check for serialized custom type
    if (isSerializedCustom(value)) {
      const typeName = value[TYPE_MARKER];

      // Built-in types
      if (typeName === 'Date') {
        return new Date(value.data as string);
      }
      if (typeName === 'Map') {
        const entries = value.data as [unknown, unknown][];
        const map = new Map();
        for (const [k, v] of entries) {
          map.set(await this.deserialize(k), await this.deserialize(v));
        }
        return map;
      }
      if (typeName === 'Set') {
        const items = value.data as unknown[];
        const set = new Set();
        for (const item of items) {
          set.add(await this.deserialize(item));
        }
        return set;
      }

      // Custom transformer
      const transformer = this.findByName(typeName);
      if (transformer) {
        return Promise.resolve(transformer.deserialize(value.data));
      }

      // Unknown type - return as-is
      return value;
    }

    // Handle Array
    if (Array.isArray(value)) {
      return Promise.all(value.map((item) => this.deserialize(item)));
    }

    // Handle plain object
    if (typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = await this.deserialize(val);
      }
      return result;
    }

    // Primitives pass through
    return value;
  }

  /**
   * Sync serialize (only works if no async transformers match).
   */
  serializeSync(value: unknown): unknown {
    // Handle null/undefined
    if (value === null || value === undefined) {
      return value;
    }

    // Check for custom type
    const transformer = this.findForValue(value);
    if (transformer) {
      if (transformer.isAsync) {
        throw new Error(`Cannot sync serialize async type: ${transformer.name}`);
      }
      const serialized = transformer.serialize(value);
      return wrapSerialized(transformer.name, serialized);
    }

    // Handle Date
    if (value instanceof Date) {
      return wrapSerialized('Date', value.toISOString());
    }

    // Handle Map
    if (value instanceof Map) {
      const entries: [unknown, unknown][] = [];
      for (const [k, v] of value) {
        entries.push([this.serializeSync(k), this.serializeSync(v)]);
      }
      return wrapSerialized('Map', entries);
    }

    // Handle Set
    if (value instanceof Set) {
      const items: unknown[] = [];
      for (const item of value) {
        items.push(this.serializeSync(item));
      }
      return wrapSerialized('Set', items);
    }

    // Handle Array
    if (Array.isArray(value)) {
      return value.map((item) => this.serializeSync(item));
    }

    // Handle plain object
    if (typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = this.serializeSync(val);
      }
      return result;
    }

    // Primitives pass through
    return value;
  }

  /**
   * Sync deserialize.
   */
  deserializeSync(value: unknown): unknown {
    // Handle null/undefined
    if (value === null || value === undefined) {
      return value;
    }

    // Check for serialized custom type
    if (isSerializedCustom(value)) {
      const typeName = value[TYPE_MARKER];

      // Built-in types
      if (typeName === 'Date') {
        return new Date(value.data as string);
      }
      if (typeName === 'Map') {
        const entries = value.data as [unknown, unknown][];
        const map = new Map();
        for (const [k, v] of entries) {
          map.set(this.deserializeSync(k), this.deserializeSync(v));
        }
        return map;
      }
      if (typeName === 'Set') {
        const items = value.data as unknown[];
        const set = new Set();
        for (const item of items) {
          set.add(this.deserializeSync(item));
        }
        return set;
      }

      // Custom transformer
      const transformer = this.findByName(typeName);
      if (transformer) {
        if (transformer.isAsync) {
          throw new Error(`Cannot sync deserialize async type: ${typeName}`);
        }
        return transformer.deserialize(value.data);
      }

      // Unknown type - return as-is
      return value;
    }

    // Handle Array
    if (Array.isArray(value)) {
      return value.map((item) => this.deserializeSync(item));
    }

    // Handle plain object
    if (typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = this.deserializeSync(val);
      }
      return result;
    }

    // Primitives pass through
    return value;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Built-in Transformers
// ─────────────────────────────────────────────────────────────────────────────

/** Uint8Array transformer */
export const Uint8ArrayTransformer: Transformer<Uint8Array, string> = {
  name: 'Uint8Array',
  isApplicable: (v): v is Uint8Array => v instanceof Uint8Array && !Buffer.isBuffer(v),
  serialize: (v) => Buffer.from(v).toString('base64'),
  deserialize: (data) => new Uint8Array(Buffer.from(data, 'base64')),
};

/** Buffer transformer */
export const BufferTransformer: Transformer<Buffer, string> = {
  name: 'Buffer',
  isApplicable: (v): v is Buffer => Buffer.isBuffer(v),
  serialize: (v) => v.toString('base64'),
  deserialize: (data) => Buffer.from(data, 'base64'),
};

/** Blob transformer (async) */
export const BlobTransformer: Transformer<Blob, { data: string; type: string }> = {
  name: 'Blob',
  isAsync: true,
  isApplicable: (v): v is Blob => v instanceof Blob,
  serialize: async (v) => {
    const buffer = await v.arrayBuffer();
    return {
      data: Buffer.from(buffer).toString('base64'),
      type: v.type,
    };
  },
  deserialize: (data) => {
    const buffer = Buffer.from(data.data, 'base64');
    return new Blob([buffer], { type: data.type });
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Default Registry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default transformer registry with built-in types.
 */
export const defaultRegistry = new TransformerRegistry()
  .register(Uint8ArrayTransformer)
  .register(BufferTransformer)
  .register(BlobTransformer);

/**
 * Register a custom transformer globally.
 */
export function registerTransformer<T, S>(transformer: Transformer<T, S>): void {
  defaultRegistry.register(transformer);
}
