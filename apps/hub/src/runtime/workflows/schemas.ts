/**
 * Shared Zod schemas for workflow validation.
 */
import { z } from 'zod';

export const PositionSchema = z
  .object({
    x: z.number(),
    y: z.number(),
  })
  .transform((pos) => ({
    x: Math.round(pos.x),
    y: Math.round(pos.y),
  }));

export const nonEmptyRecord = <T extends z.ZodTypeAny>(schema: T) =>
  z.optional(schema).transform((val) => (val && Object.keys(val).length > 0 ? val : undefined));
