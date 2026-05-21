import { z } from 'zod';

// ─── Schemas ────────────────────────────────────────────────────────────────

/**
 * The compiler-injected `__cs` value: `'path/to/file.tsx:42'`. The colon
 * separator may be missing for unusual cases (synthetic frames). We accept
 * the bare path then default the line to `0`.
 */
const BuildTimeCallSiteValueSchema = z.string().min(1);

/**
 * The options bag the compiler may attach to a `t(...)` call. Only the
 * `__cs` key is meaningful here — everything else is opaque pass-through.
 */
const OptionsWithCallSiteSchema = z
  .object({
    __cs: BuildTimeCallSiteValueSchema.optional(),
  })
  .catchall(z.unknown());

export interface CallSite {
  readonly file: string;
  readonly line: number;
}

export interface TakeCallSiteResult {
  /** Parsed call site, or `null` if no `__cs` was attached. */
  readonly site: CallSite | null;
  /** Args with `__cs` stripped from the options bag (untouched if no opts). */
  readonly args: unknown[];
}

/**
 * Parse the compiler-injected `__cs` field on `t()` options, returning the
 * call site plus the args with `__cs` stripped (so i18next doesn't warn about
 * an unknown option). The returned `args` is a fresh array — callers spread
 * it back into the original `t.apply(...)` invocation.
 *
 * Falls back to `{ site: null, args }` when no options object is present or
 * `__cs` isn't a string.
 */
export function takeBuildTimeCallSite(args: readonly unknown[]): TakeCallSiteResult {
  if (args.length < 2) {
    return { site: null, args: [...args] };
  }
  const candidate = args[1];
  if (candidate === null || typeof candidate !== 'object') {
    return { site: null, args: [...args] };
  }
  const parsed = OptionsWithCallSiteSchema.safeParse(candidate);
  if (!parsed.success || parsed.data.__cs === undefined) {
    return { site: null, args: [...args] };
  }
  const raw = parsed.data.__cs;
  const colonIdx = raw.lastIndexOf(':');
  const file = colonIdx >= 0 ? raw.slice(0, colonIdx) : raw;
  const lineStr = colonIdx >= 0 ? raw.slice(colonIdx + 1) : '';
  const parsedLine = Number.parseInt(lineStr, 10);
  const line = Number.isNaN(parsedLine) ? 0 : parsedLine;

  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    if (k !== '__cs') {
      cleaned[k] = v;
    }
  }
  const nextArgs = [...args];
  nextArgs[1] = cleaned;
  return { site: { file, line }, args: nextArgs };
}

// ─── t() options key extraction ─────────────────────────────────────────────

const OptionsWithNsSchema = z
  .object({
    ns: z.union([z.string(), z.array(z.string())]).optional(),
  })
  .catchall(z.unknown());

/**
 * Extract the qualified key (`ns:key.path`) from a `t()` argument tuple.
 * Returns `null` for empty or non-string keys.
 *
 * When the key is already qualified, we return it as-is. Otherwise we look
 * at the options bag's `ns` field — i18next allows a string or string[].
 * Array form takes the first element so the value remains stable across
 * calls; we don't synthesise a "best-match" across multiple namespaces.
 */
export function extractQualifiedKey(args: readonly unknown[]): string | null {
  const first = args[0];
  if (typeof first !== 'string' || first.length === 0) {
    return null;
  }
  if (first.includes(':')) {
    return first;
  }
  const second = args[1];
  if (second === null || typeof second !== 'object') {
    return first;
  }
  const parsed = OptionsWithNsSchema.safeParse(second);
  if (!parsed.success || parsed.data.ns === undefined) {
    return first;
  }
  const nsValue = parsed.data.ns;
  if (typeof nsValue === 'string') {
    return `${nsValue}:${first}`;
  }
  const head = nsValue[0];
  return typeof head === 'string' ? `${head}:${first}` : first;
}
