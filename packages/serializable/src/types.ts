/**
 * Serializable Type
 *
 * Union of all types that can be serialized/deserialized.
 * Includes standard JSON types plus extended types.
 */

/**
 * Serializable value - any value that can be serialized and deserialized.
 * Includes:
 * - Primitives: null, boolean, number, string
 * - Date
 * - Binary: Uint8Array, Blob
 * - Collections: Map, Set, Array
 * - Objects: plain objects with serializable values
 */
export type Serializable =
  | null
  | boolean
  | number
  | string
  | Date
  | Uint8Array
  | Blob
  | Map<Serializable, Serializable>
  | Set<Serializable>
  | Serializable[]
  | {
      [key: string]: Serializable;
    };
