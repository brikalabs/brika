/**
 * `brika build` — generate the plugin manifest from source.
 *
 * Reads the plugin's block, brick, page, and spark definitions, lowers their
 * `meta` (and brick zod `config`) into the matching `package.json` arrays the
 * hub reads, and writes them back. `--check` compares instead of writing and
 * exits non-zero on drift, so CI can guarantee the manifest matches the source.
 *
 * Only kinds that have definitions in source are managed: if no files of a kind
 * are found, the existing array is left untouched (with a warning) rather than
 * wiped, so a plugin that has not adopted `meta` yet is never damaged.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { defineCommand } from '@brika/cli';
import { type GeneratedManifest, generateEntry, generateManifest } from '@brika/compiler';
import { PluginPackageSchema } from '@brika/schema';
import pc from 'picocolors';

async function readFileOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

/** Recursively sort object keys so two manifests compare regardless of key order. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries.map(([k, v]) => [k, canonical(v)]));
  }
  return value;
}

function sameArray(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

/** Read the `id` of a manifest entry, or undefined if it has none. */
function entryId(entry: unknown): string | undefined {
  if (entry !== null && typeof entry === 'object') {
    const id = Object.entries(entry).find(([k]) => k === 'id')?.[1];
    return typeof id === 'string' ? id : undefined;
  }
  return undefined;
}

/**
 * Order generated entries to match the committed manifest so a no-op build
 * produces no diff: existing ids keep their position, new ids are appended in
 * id order, removed ids drop out.
 */
function preserveOrder<T extends { id: string }>(generated: readonly T[], existing: unknown): T[] {
  const order = (Array.isArray(existing) ? existing : []).map(entryId);
  const rank = new Map(order.filter((id) => id !== undefined).map((id, i) => [id, i]));
  const fallback = Number.MAX_SAFE_INTEGER;
  return [...generated].sort((a, b) => {
    const ra = rank.get(a.id) ?? fallback;
    const rb = rank.get(b.id) ?? fallback;
    return ra === rb ? a.id.localeCompare(b.id) : ra - rb;
  });
}

/** Find the index of the `]` that closes the `[` at openIdx, respecting strings. */
function findArrayEnd(raw: string, openIdx: number): number {
  let depth = 0;
  let inStr = false;
  let escaped = false;
  for (let i = openIdx; i < raw.length; i += 1) {
    const ch = raw[i];
    if (inStr) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inStr = false;
      }
    } else if (ch === '"') {
      inStr = true;
    } else if (ch === '[') {
      depth += 1;
    } else if (ch === ']') {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * Replace the value of a top-level array key in raw package.json text without
 * touching any other formatting. Returns null if the key is absent.
 */
function replaceTopLevelArray(raw: string, key: string, arr: readonly unknown[]): string | null {
  const marker = `\n  "${key}":`;
  const keyIdx = raw.indexOf(marker);
  if (keyIdx === -1) {
    return null;
  }
  const open = raw.indexOf('[', keyIdx + marker.length);
  const close = open === -1 ? -1 : findArrayEnd(raw, open);
  if (open === -1 || close === -1) {
    return null;
  }
  const serialized = JSON.stringify(arr, null, 2)
    .split('\n')
    .map((line, i) => (i === 0 ? line : `  ${line}`))
    .join('\n');
  return raw.slice(0, open) + serialized + raw.slice(close + 1);
}

interface KindPlan {
  /** True when source produced entries and the array should be (re)written. */
  managed: boolean;
  /** True when the committed array differs from the generated one. */
  drifted: boolean;
  generated: unknown[];
}

/** Decide whether a manifest kind is managed and whether it drifted. */
function planKind(generated: unknown[], existing: unknown): KindPlan {
  if (generated.length === 0) {
    return { managed: false, drifted: false, generated };
  }
  return { managed: true, drifted: !sameArray(existing, generated), generated };
}

function printDiagnostics(result: GeneratedManifest): void {
  for (const d of result.diagnostics) {
    const tag = d.level === 'error' ? pc.red('error') : pc.yellow('warn');
    const where = d.file ? pc.dim(` (${d.file})`) : '';
    process.stderr.write(`  ${tag} ${d.message}${where}\n`);
  }
}

type Plans = Record<string, KindPlan>;

/** Warn (without failing) about kinds present in package.json but absent from source. */
function warnUnmanaged(plans: Plans, pkg: Record<string, unknown>): void {
  for (const [kind, plan] of Object.entries(plans)) {
    if (!plan.managed && arrayLength(pkg[kind]) > 0) {
      process.stderr.write(
        `  ${pc.yellow('warn')} no ${kind} found in source; leaving package.json ${kind} untouched\n`
      );
    }
  }
}

/** The package.json with managed arrays swapped in, for schema validation. */
function buildCandidate(pkg: Record<string, unknown>, plans: Plans): Record<string, unknown> {
  const candidate: Record<string, unknown> = { ...pkg };
  for (const [kind, plan] of Object.entries(plans)) {
    if (plan.managed) {
      candidate[kind] = plan.generated;
    }
  }
  return candidate;
}

/** Print schema issues and return true when the candidate is invalid. */
function reportInvalid(candidate: Record<string, unknown>): boolean {
  const parsed = PluginPackageSchema.safeParse(candidate);
  if (parsed.success) {
    return false;
  }
  process.stderr.write(pc.red('\nGenerated manifest is invalid:\n'));
  for (const issue of parsed.error.issues) {
    process.stderr.write(`  ${pc.red('error')} ${issue.path.join('.')}: ${issue.message}\n`);
  }
  return true;
}

/** Surgically apply drifted arrays to raw text, or report the first missing key. */
function applyArrayDrift(
  raw: string,
  driftedEntries: Array<[string, KindPlan]>
): { text: string } | { missing: string } {
  let next = raw;
  for (const [kind, plan] of driftedEntries) {
    const replaced = replaceTopLevelArray(next, kind, plan.generated);
    if (replaced === null) {
      return { missing: kind };
    }
    next = replaced;
  }
  return { text: next };
}

export default defineCommand({
  name: 'build',
  description:
    'Generate the plugin manifest (blocks/bricks/pages/sparks) in package.json from source',
  details:
    "Lowers each capability's `meta` (and brick zod `config`) into the package.json " +
    'arrays the hub reads. Use --check in CI to fail when the committed manifest is out of date.',
  options: {
    check: {
      type: 'boolean',
      description: 'Compare only; exit non-zero if package.json is out of date (CI gate)',
    },
    dir: {
      type: 'string',
      description: 'Plugin directory (default: current directory)',
    },
  },
  examples: ['brika build', 'brika build --check', 'brika build --dir plugins/timer'],
  async handler({ values }) {
    const root = resolve(values.dir ?? process.cwd());
    const result = await generateManifest(root);
    printDiagnostics(result);
    if (!result.ok) {
      process.stderr.write(pc.red('\nbrika build failed: fix the errors above.\n'));
      process.exitCode = 1;
      return;
    }

    const pkgPath = join(root, 'package.json');
    const raw = await readFile(pkgPath, 'utf8');
    const pkg: Record<string, unknown> = JSON.parse(raw);

    const plans = {
      blocks: planKind(preserveOrder(result.blocks, pkg.blocks), pkg.blocks),
      bricks: planKind(preserveOrder(result.bricks, pkg.bricks), pkg.bricks),
      pages: planKind(preserveOrder(result.pages, pkg.pages), pkg.pages),
      sparks: planKind(preserveOrder(result.sparks, pkg.sparks), pkg.sparks),
    };

    warnUnmanaged(plans, pkg);

    // Validate against the same schema the hub enforces, so a bad meta (invalid
    // category/color) fails locally instead of at install time.
    if (reportInvalid(buildCandidate(pkg, plans))) {
      process.exitCode = 1;
      return;
    }

    const driftedEntries = Object.entries(plans).filter(([, p]) => p.drifted);

    // The generated entry is opt-in: a plugin adopts it by pointing
    // package.json "main" at src/_generated/entry.ts (replacing a hand barrel).
    const managesEntry = typeof pkg.main === 'string' && pkg.main.endsWith('_generated/entry.ts');
    const entryPath = join(root, 'src', '_generated', 'entry.ts');
    const entryContent = managesEntry ? await generateEntry(root) : null;
    const entryDrifted =
      entryContent !== null && entryContent !== (await readFileOrNull(entryPath));

    const drifted = [...driftedEntries.map(([k]) => k), ...(entryDrifted ? ['entry'] : [])];

    if (values.check) {
      if (drifted.length === 0) {
        process.stdout.write(`${pc.green('✓')} plugin is up to date\n`);
        return;
      }
      process.stderr.write(
        `${pc.red('✗')} plugin is out of date (${drifted.join(', ')}). Run ${pc.bold('brika build')}.\n`
      );
      process.exitCode = 1;
      return;
    }

    if (drifted.length === 0) {
      process.stdout.write(`${pc.green('✓')} plugin already up to date\n`);
      return;
    }

    const applied = applyArrayDrift(raw, driftedEntries);
    if ('missing' in applied) {
      process.stderr.write(
        `  ${pc.red('error')} could not locate "${applied.missing}" in package.json; add ${pc.bold(`"${applied.missing}": []`)} and re-run\n`
      );
      process.exitCode = 1;
      return;
    }
    if (applied.text !== raw) {
      await writeFile(pkgPath, applied.text);
    }
    if (entryDrifted && entryContent !== null) {
      await mkdir(dirname(entryPath), { recursive: true });
      await writeFile(entryPath, entryContent);
    }
    process.stdout.write(`${pc.green('✓')} updated ${drifted.join(', ')}\n`);
  },
});
