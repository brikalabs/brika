import { beforeAll, describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IsolateBundler } from './isolate';
import { readStamp } from './stamp';
import type { BundleResult } from './types';

// Real plugin from the repo, compiled by the isolate backend (pure rollup +
// sucrase, the Cloudflare-capable path). The Bun backend delegates to
// `Bun.build`, which the `bun test` runner cannot host; cross-backend parity is
// verified in `verify-parity.ts` (run under `bun run`, as the hub does).
const pluginRoot = join(import.meta.dir, '../../../../plugins/weather');
const bricks = ['current', 'forecast', 'compact'];
const entrypoints = bricks.map((b) => join(pluginRoot, `src/bricks/${b}.tsx`));

let iso: BundleResult;
beforeAll(async () => {
  iso = await new IsolateBundler().bundle({ entrypoints, pluginRoot, sourceRoot: pluginRoot });
  if (!iso.success) {
    throw new Error(`isolate compile failed: ${iso.errors.join(', ')}`);
  }
});

/** Every `className` token used anywhere in the plugin's brick sources. */
function sourceClassTokens(): Set<string> {
  const tokens = new Set<string>();
  const dir = join(pluginRoot, 'src/bricks');
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.tsx')) {
      continue;
    }
    for (const m of readFileSync(join(dir, file), 'utf8').matchAll(/className=["']([^"']+)["']/g)) {
      for (const t of (m[1] ?? '').split(/\s+/)) {
        if (t) {
          tokens.add(t);
        }
      }
    }
  }
  return tokens;
}

const allJs = (r: BundleResult): string =>
  r.success ? [...r.entries.map((e) => e.js), ...r.chunks.map((c) => c.js)].join('\n') : '';

describe('IsolateBundler compiles the weather plugin (Cloudflare-capable path)', () => {
  test('emits 3 entries, each stamped isolate@<version>', () => {
    if (!iso.success) {
      return;
    }
    expect(iso.entries).toHaveLength(3);
    for (const e of iso.entries) {
      expect(readStamp(e.js)).toEqual({ backend: 'isolate', version: iso.version });
    }
  });

  test('splits shared brick code into a chunk', () => {
    if (!iso.success) {
      return;
    }
    expect(iso.chunks.length).toBeGreaterThanOrEqual(1);
    for (const c of iso.chunks) {
      expect(c.name.startsWith('_brika_chunk_')).toBe(true);
    }
  });

  test('rewires bridged deps to globalThis.__brika, not bare imports', () => {
    const js = allJs(iso);
    expect(js).toContain('globalThis.__brika.');
    expect(js).not.toMatch(/from\s*['"](?:react|react\/jsx-runtime|lucide-react)['"]/);
  });

  test('preserves every Tailwind class from source', () => {
    const classes = sourceClassTokens();
    expect(classes.size).toBeGreaterThan(10);
    const js = allJs(iso);
    expect([...classes].filter((c) => !js.includes(c))).toEqual([]);
  });
});
