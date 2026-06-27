/**
 * Small JSON state files (version state, etag cache, metrics history, board
 * order) all want the same thing: a crash-safe write and a validate-on-read.
 * This collapses the hand-rolled temp+rename+chmod that was copy-pasted across
 * those stores into one primitive plus a typed wrapper.
 *
 * Atomicity: writes go to `${path}.tmp` then `rename()` over the target, which
 * is atomic on POSIX and on NTFS for the same volume, so a power loss never
 * leaves a half-written file.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { z } from 'zod';

export interface JsonWriteOptions {
  /** File mode on creation. Defaults to 0o600 (owner-only); machine state isn't world-readable. */
  readonly mode?: number;
  /** Pretty-print with 2-space indent (default) for hand-inspectable files; false for compact. */
  readonly pretty?: boolean;
}

/** Crash-safe JSON write: serialize, write to a temp sibling, then atomic rename. */
export function writeJsonAtomic(
  path: string,
  value: unknown,
  options: JsonWriteOptions = {}
): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  const body = (options.pretty ?? true) ? JSON.stringify(value, null, 2) : JSON.stringify(value);
  writeFileSync(tmp, body, { encoding: 'utf8', mode: options.mode ?? 0o600 });
  renameSync(tmp, path);
}

export interface JsonStateFileOptions<T> extends JsonWriteOptions {
  /** Schema the on-disk JSON is validated against; an invalid file reads as `null`. */
  readonly schema: z.ZodType<T>;
}

/**
 * A single JSON file holding one validated value. `load()` returns `null` for a
 * missing or malformed/invalid file (the caller decides the default), `persist()`
 * writes atomically, and `mutate()` re-reads before applying so independent
 * holders of the same path don't clobber each other.
 */
export class JsonStateFile<T> {
  readonly #path: string;
  readonly #schema: z.ZodType<T>;
  readonly #write: JsonWriteOptions;

  constructor(path: string, options: JsonStateFileOptions<T>) {
    this.#path = path;
    this.#schema = options.schema;
    this.#write = { mode: options.mode, pretty: options.pretty };
  }

  /** Read + validate. `null` when the file is missing, not JSON, or fails the schema. */
  load(): T | null {
    let raw: string;
    try {
      raw = readFileSync(this.#path, 'utf8');
    } catch {
      return null;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    const result = this.#schema.safeParse(parsed);
    return result.success ? result.data : null;
  }

  persist(value: T): void {
    writeJsonAtomic(this.#path, value, this.#write);
  }

  /** Re-read (concurrent-safe), apply `fn`, persist, and return the new value. */
  mutate(fn: (current: T | null) => T): T {
    const next = fn(this.load());
    this.persist(next);
    return next;
  }
}
