import { cpSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'tsup';

const SRC = 'src';
const DIST = 'dist';

function componentEntries(): Record<string, string> {
  const out: Record<string, string> = {};
  const componentsDir = join(SRC, 'components');
  for (const name of readdirSync(componentsDir)) {
    const full = join(componentsDir, name);
    if (!statSync(full).isDirectory()) {
      continue;
    }
    // Emit at `dist/components/<name>/index.js` — folder layout, matches
    // what `tsc --emitDeclarationOnly` produces for the .d.ts files. If
    // these diverged (flat .js, folder .d.ts) the barrel `export * from
    // './components/button'` wouldn't find types: TS sees `button.js`,
    // infers types should be at `button.d.ts`, doesn't find them, and
    // skips the `button/index.d.ts` fallback.
    out[`components/${name}/index`] = join(full, 'index.ts');
  }
  return out;
}

function primitiveEntries(): Record<string, string> {
  const out: Record<string, string> = { 'primitives/index': join(SRC, 'primitives/index.ts') };
  const primitivesDir = join(SRC, 'primitives');
  for (const file of readdirSync(primitivesDir)) {
    if (!file.endsWith('.ts') || file === 'index.ts') {
      continue;
    }
    const full = join(primitivesDir, file);
    if (!statSync(full).isFile()) {
      continue;
    }
    const stem = file.replace(/\.ts$/, '');
    out[`primitives/${stem}`] = full;
  }
  return out;
}

const COMPONENT_ENTRY_NAMES = new Set(Object.keys(componentEntries()));

export default defineConfig({
  entry: {
    index: join(SRC, 'index.ts'),
    tailwind: join(SRC, 'tailwind.ts'),
    'themes/index': join(SRC, 'themes/index.ts'),
    'tokens/index': join(SRC, 'tokens/index.ts'),
    ...primitiveEntries(),
    ...componentEntries(),
  },
  format: ['esm'],
  target: 'es2022',
  // DTS is emitted by `tsc --emitDeclarationOnly` (see package.json `build`
  // script) — it scales better than tsup's worker for many-entry libraries
  // and outputs at the source layout (`dist/components/<name>/index.d.ts`)
  // which the package.json `exports` map references.
  dts: false,
  splitting: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ['react', 'react-dom', 'tailwindcss', 'tailwindcss/plugin'],
  loader: {
    '.json': 'json',
  },
  esbuildOptions(options, { format: _format }) {
    options.banner = {
      // Stamped on every chunk. Server-only entries don't exist yet; if any
      // appear, exclude them with a per-entry banner instead of the global
      // `esbuildOptions` hook (tsup's `banner` config supports per-format
      // values but not per-entry; we'd need to switch to two separate
      // `defineConfig` calls).
      js: "'use client';",
    };
    options.legalComments = 'none';
  },
  outExtension() {
    return { js: '.js' };
  },
  onSuccess: async () => {
    // 1. Copy hand-authored CSS so `@brika/clay/styles` resolves and
    //    `tailwind.js`'s runtime `readFileSync('styles/components.css')`
    //    finds the file at the same relative path it had under `src/`.
    mkdirSync(join(DIST, 'styles'), { recursive: true });
    cpSync(join(SRC, 'styles'), join(DIST, 'styles'), { recursive: true });
    // 2. Copy theme preset JSON next to the bundled `themes.js` so the
    //    `with { type: 'json' }` static imports keep resolving for any
    //    consumer that prefers the source path (the json is also inlined
    //    into themes.js, but presets/ stays useful for tooling).
    mkdirSync(join(DIST, 'themes', 'presets'), { recursive: true });
    cpSync(join(SRC, 'themes', 'presets'), join(DIST, 'themes', 'presets'), {
      recursive: true,
    });
    // Sanity log: how many component entries shipped.
    console.log(`[clay] copied styles + ${COMPONENT_ENTRY_NAMES.size} components`);
  },
});
