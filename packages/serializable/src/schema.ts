/**
 * Serializable Schema
 *
 * Zod schema for validating that data is serializable.
 */

import { z } from 'zod';
import type { Serializable } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Serializable Zod Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Zod schema for validating serializable data.
 * Use this as a base for port schemas to ensure serializability.
 *
 * Note: This is a best-effort schema. Custom transformers may add
 * additional serializable types not covered here.
 */
export const SerializableSchema: z.ZodType<Serializable> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.date(),
    z.instanceof(Uint8Array),
    z.instanceof(Blob),
    z.map(SerializableSchema, SerializableSchema),
    z.set(SerializableSchema),
    z.array(SerializableSchema),
    z.record(z.string(), SerializableSchema),
  ])
);
