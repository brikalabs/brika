/**
 * Common Zod schemas used across multiple packages
 */
import { z } from 'zod';

/**
 * Schema for 2D position coordinates.
 * Automatically rounds x and y to integers.
 */
export const PositionSchema = z
  .object({
    x: z.number(),
    y: z.number(),
  })
  .transform((pos) => ({
    x: Math.round(pos.x),
    y: Math.round(pos.y),
  }));

/**
 * Helper to transform empty records to undefined.
 * Useful for optional configuration objects where an empty object should be treated as undefined.
 */
export const nonEmptyRecord = <T extends z.ZodTypeAny>(schema: T) =>
  z.optional(schema).transform((val) => (val && Object.keys(val).length > 0 ? val : undefined));
