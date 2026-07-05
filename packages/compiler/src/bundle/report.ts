/**
 * Plugin report derived at compile time, entirely from the in-memory sources
 * (pure JS, edge-safe - no Bun, no module execution):
 *   - `manifest`: the capability arrays the plugin ships in its package.json
 *     (bricks / blocks / pages / sparks / tools / actions, each with metadata).
 *     These are lowered by `brika build` on the author's machine, so here we
 *     just read them.
 *   - `actions`: server actions re-discovered by scanning for
 *     `@brika/sdk/actions` imports. `brika build` writes the same entries into
 *     the package.json `actions[]` array (same scan, same hash), so a registry
 *     can compare the declared list against this independent re-derivation.
 *
 * Re-deriving the other manifest metadata from scratch needs to evaluate each
 * module (`generateManifest` -> `Bun.build`), which is Bun-only; that stays a
 * `brika build`-time step, which is why the result is baked into package.json.
 */
import { actionExports, computeActionId } from './action-scan';

/** One server action: an export of a file that imports `@brika/sdk/actions`. */
export interface ActionEntry {
  /** The RPC id the runtime dispatches on, matching the server build. */
  readonly id: string;
  /** Source path (the sources-map key), relative to the plugin root. */
  readonly file: string;
  /** Exported action name (`default` for a default export). */
  readonly name: string;
}

/**
 * Capability arrays as declared in the plugin's package.json. Entries are the
 * `@brika/schema` shapes (GeneratedBrick, ...) but kept as `unknown` so the gate
 * stays free of the schema/zod dependency; a caller validates against the schema.
 */
export interface PluginManifest {
  readonly bricks: readonly unknown[];
  readonly blocks: readonly unknown[];
  readonly pages: readonly unknown[];
  readonly sparks: readonly unknown[];
  readonly tools: readonly unknown[];
  readonly actions: readonly unknown[];
}

export interface PluginReport {
  readonly manifest: PluginManifest;
  readonly actions: readonly ActionEntry[];
}

const ACTION_MODULE = '@brika/sdk/actions';
// Only .ts/.tsx: the authoritative server-actions build (actions-server) footers
// only 'ts'/'tsx' loaders, so a `.jsx`/`.js` "action" file is never registered.
const TS_SOURCE = /\.tsx?$/;
// Test files are never reachable from the plugin entry, so their exports never
// register; skipping them keeps this scan aligned with `brika build`.
const TEST_SOURCE = /\.(test|spec)\.tsx?$/;

/**
 * List a plugin's server actions: every export of a file that value-imports
 * `@brika/sdk/actions` (see `actionExports`). A malformed file is skipped, not
 * thrown, so a broken *unreachable* action file never crashes the caller. Action
 * ids are hashed in parallel. Pure JS, edge-safe.
 */
export function scanActions(sources: ReadonlyMap<string, string>): Promise<ActionEntry[]> {
  const pending: { file: string; name: string }[] = [];
  for (const [file, code] of sources) {
    if (!TS_SOURCE.test(file) || TEST_SOURCE.test(file) || !code.includes(ACTION_MODULE)) {
      continue;
    }
    const names = actionExports(code, file.endsWith('x'));
    if (names) {
      for (const name of names) {
        pending.push({ file, name });
      }
    }
  }
  return Promise.all(
    pending.map(async (p) => ({
      id: await computeActionId(p.file, p.name),
      file: p.file,
      name: p.name,
    }))
  );
}

/** Read the capability arrays from the plugin's package.json in the sources. */
export function readManifest(sources: ReadonlyMap<string, string>): PluginManifest {
  const empty: PluginManifest = {
    bricks: [],
    blocks: [],
    pages: [],
    sparks: [],
    tools: [],
    actions: [],
  };
  const pkg = sources.get('package.json');
  if (pkg === undefined) {
    return empty;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(pkg);
  } catch {
    return empty;
  }
  if (raw === null || typeof raw !== 'object') {
    return empty;
  }
  const rec = raw as Record<string, unknown>;
  const arr = (key: string): readonly unknown[] => {
    const value = rec[key];
    return Array.isArray(value) ? value : [];
  };
  return {
    bricks: arr('bricks'),
    blocks: arr('blocks'),
    pages: arr('pages'),
    sparks: arr('sparks'),
    tools: arr('tools'),
    actions: arr('actions'),
  };
}

/** The full compile-time report: package.json capabilities + discovered actions. */
export async function buildReport(sources: ReadonlyMap<string, string>): Promise<PluginReport> {
  return { manifest: readManifest(sources), actions: await scanActions(sources) };
}
