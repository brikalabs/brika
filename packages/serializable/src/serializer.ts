/**
 * Serializer
 *
 * Main serialization API using the generic transformer system.
 * Clean, extensible, and handles all custom types uniformly.
 */

import { defaultRegistry } from './transformer';

// ─────────────────────────────────────────────────────────────────────────────
// Re-export for extension
// ─────────────────────────────────────────────────────────────────────────────

export type { Transformer } from './transformer';
export { registerTransformer } from './transformer';

// ─────────────────────────────────────────────────────────────────────────────
// Serialize
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Serialize data to JSON string (async).
 * Supports ALL custom types including async ones like Blob.
 *
 * @param data - Data to serialize
 * @returns JSON string
 */
export async function serialize(data: unknown): Promise<string> {
  const prepared = await defaultRegistry.serialize(data);
  return JSON.stringify(prepared);
}

/**
 * Serialize data to JSON string (sync).
 * Faster but throws if data contains async types (Blob).
 *
 * @param data - Data to serialize
 * @returns JSON string
 */
export function serializeSync(data: unknown): string {
  const prepared = defaultRegistry.serializeSync(data);
  return JSON.stringify(prepared);
}

// ─────────────────────────────────────────────────────────────────────────────
// Deserialize
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deserialize JSON string back to original data (async).
 * Restores all custom types automatically.
 *
 * @param json - JSON string from serialize()
 * @returns Deserialized data with all types restored
 */
export async function deserialize<T = unknown>(json: string): Promise<T> {
  const parsed = JSON.parse(json);
  return (await defaultRegistry.deserialize(parsed)) as T;
}

/**
 * Deserialize JSON string back to original data (sync).
 * Throws if data contains async types.
 *
 * @param json - JSON string from serializeSync()
 * @returns Deserialized data with all types restored
 */
export function deserializeSync<T = unknown>(json: string): T {
  const parsed = JSON.parse(json);
  return defaultRegistry.deserializeSync(parsed) as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assert that data is serializable.
 * Throws if data contains non-serializable values.
 *
 * @param data - Data to check
 * @throws Error if data is not serializable
 */
export async function assertSerializable(data: unknown): Promise<void> {
  try {
    await serialize(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Data is not serializable: ${message}`);
  }
}

/**
 * Check if data is serializable without throwing.
 *
 * @param data - Data to check
 * @returns true if serializable, false otherwise
 */
export async function isSerializable(data: unknown): Promise<boolean> {
  try {
    await serialize(data);
    return true;
  } catch {
    return false;
  }
}
