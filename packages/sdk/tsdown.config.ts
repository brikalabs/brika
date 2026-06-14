import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsdown';

/**
 * Publish bundle for the PUBLIC @brika/sdk. Entries are derived from the
 * package's own `exports`, so adding/removing a public subpath needs no change
 * here. Runtime deps (zod) and peers (react, lucide-react, @brika/testing) are
 * auto-externalized by tsdown; the PRIVATE closure lives in devDependencies, so
 * tsdown bundles it inline. The dts tsconfig sits one level up (packages/) so
 * tsgo's rootDir spans the closure source it must inline.
 */
const pkg: { exports: Record<string, unknown> } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8')
);

const entry = Object.fromEntries(
  Object.entries(pkg.exports).flatMap(([key, target]) =>
    typeof target === 'string' &&
    target.startsWith('./src/') &&
    target.endsWith('.ts') &&
    !key.startsWith('./internal/')
      ? [[key === '.' ? 'index' : key.slice(2), target.slice(2)]]
      : []
  )
);

export default defineConfig({
  entry,
  format: 'esm',
  minify: true,
  sourcemap: false,
  outDir: 'dist/pkg',
  outExtensions: () => ({ js: '.js' }),
  dts: { tsgo: true, tsconfig: '../tsconfig.sdk-dts.json' },
});
