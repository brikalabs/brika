/**
 * Core Primitives
 *
 * Minimal shared types used across contracts.
 */

import { z } from 'zod';

/** JSON-serializable value */
export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [k: string]: Json | undefined }
  | undefined;

/**
 * Zod schema for JSON values.
 * Uses z.unknown() at runtime since Bun's IPC serialization handles JSON correctly.
 */
export const Json = z.unknown() as z.ZodType<Json>;

/** Record of JSON values (for args, vars, etc.) */
export const JsonRecord = z.record(z.string(), z.unknown()) as z.ZodType<Record<string, Json>>;
