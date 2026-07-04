/**
 * Cross-backend parity check for the weather plugin, run under `bun run` (not
 * `bun test`, whose runner cannot host the Bun backend's `Bun.build`). Compiles
 * with BOTH backends and reports: success, entry/chunk counts, stamps, bridge
 * rewiring, and that every Tailwind class from source survives in each output.
 *
 *   bun run packages/compiler/verify-parity.ts
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BunBundler } from './src/bundle/bun';
import { IsolateBundler } from './src/bundle/isolate';
import { readStamp } from './src/bundle/stamp';
import type { BundleResult } from './src/bundle/types';
import { OUTPUT_VERSION } from './src/output-version';

const pluginRoot = join(import.meta.dir, '../../plugins/weather');
const entrypoints = ['current', 'forecast', 'compact'].map((b) =>
  join(pluginRoot, `src/bricks/${b}.tsx`)
);

function sourceClasses(): Set<string> {
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
const allJs = (r: BundleResult) =>
  r.success ? [...r.entries.map((e) => e.js), ...r.chunks.map((c) => c.js)].join('\n') : '';

const bun = await new BunBundler(OUTPUT_VERSION).bundle({
  entrypoints,
  pluginRoot,
  sourceRoot: pluginRoot,
});
const iso = await new IsolateBundler(OUTPUT_VERSION).bundle({
  entrypoints,
  pluginRoot,
  sourceRoot: pluginRoot,
});

if (!bun.success || !iso.success) {
  console.log('❌ compile failed', {
    bun: bun.success ? 'ok' : bun.errors,
    iso: iso.success ? 'ok' : iso.errors,
  });
  process.exit(1);
}

const classes = [...sourceClasses()];
const [bunJs, isoJs] = [allJs(bun), allJs(iso)];
const check = (name: string, ok: boolean) => console.log(`  ${ok ? '✅' : '❌'} ${name}`);

console.log('\nweather plugin — Bun backend vs Isolate backend\n');
console.log(`  entries:  bun=${bun.entries.length}  iso=${iso.entries.length}`);
console.log(`  chunks:   bun=${bun.chunks.length}  iso=${iso.chunks.length}`);
console.log(
  `  bytes:    bun=${bunJs.length}  iso=${isoJs.length}  (differ: expected, different bundlers)\n`
);
check('both emit 3 entries', bun.entries.length === 3 && iso.entries.length === 3);
check(
  `bun stamped bun@${bun.version}`,
  bun.entries.every((e) => readStamp(e.js)?.backend === 'bun')
);
check(
  `iso stamped isolate@${iso.version}`,
  iso.entries.every((e) => readStamp(e.js)?.backend === 'isolate')
);
check(
  'both rewire bridged deps to globalThis.__brika',
  bunJs.includes('globalThis.__brika.') && isoJs.includes('globalThis.__brika.')
);
check(
  `all ${classes.length} source Tailwind classes survive in BUN`,
  classes.every((c) => bunJs.includes(c))
);
check(
  `all ${classes.length} source Tailwind classes survive in ISOLATE`,
  classes.every((c) => isoJs.includes(c))
);
console.log('');
