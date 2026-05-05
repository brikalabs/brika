import type { BunPlugin } from 'bun';

/**
 * Re-export rewrite plugin — workaround for a Bun bundler bug.
 *
 * Bun aggressively optimizes "barrel" re-export files (an `index.js` that
 * does only `export { X } from './x'`) when the upstream package declares
 * `"sideEffects": false`. The optimization can drop the implementation
 * file even when a transitively-bundled module is calling the function.
 *
 * Concrete failure: recharts' `state/selectors/axisSelectors.js` calls
 * `getNiceTickValues(...)` which is re-exported through
 * `util/scale/index.js`. With `sideEffects: false`, Bun emits the call
 * site but never bundles `util/scale/getNiceTickValues.js`. Runtime then
 * blows up with `ReferenceError: <minified-name> is not defined`.
 *
 * Workaround: rewrite every `export { A, B } from './x'` re-export
 * inside `node_modules` into the equivalent
 *   `import { A as __re_A, B as __re_B } from './x';
 *    export const A = __re_A; export const B = __re_B;`
 * form. Bun's barrel optimizer doesn't recognise this pattern, so it
 * keeps the implementation in the bundle.
 *
 * `Bun.build`'s documented `ignoreDCEAnnotations: true` should bypass
 * `sideEffects` annotations but doesn't take effect against the barrel
 * optimizer as of Bun 1.3.13. Remove this plugin once that's fixed.
 */
export function brikaForceSideEffectsPlugin(): BunPlugin {
  return {
    name: 'brika-force-side-effects',
    setup(build) {
      build.onLoad({ filter: /\/node_modules\/.+\.(?:m?js|cjs)$/ }, async (args) => {
        const text = await Bun.file(args.path).text();
        // Quick pre-filter: skip files with no re-exports
        if (!text.includes('export {') && !text.includes('export*')) {
          return undefined;
        }
        const rewritten = rewriteBarrelReexports(text);
        if (rewritten === text) {
          return undefined;
        }
        return { contents: rewritten, loader: 'js' };
      });
    },
  };
}

/**
 * Per-line regex (no `m`/`g` flags). Bounded by `\n`-free character
 * classes so the engine can never backtrack across line boundaries.
 * Both `[^}\n]` and `[^'"\n]` are negated single-character classes,
 * which keeps the quantifiers linear.
 */
const REEXPORT_LINE_RE = /^(\s*)export\s+\{([^}\n]+)\}\s+from\s+(['"][^'"\n]+['"]);?\s*$/;

function rewriteBarrelReexports(text: string): string {
  // Operating per-line keeps every regex match bounded by line length,
  // sidestepping the catastrophic-backtracking concern that file-wide
  // regexes raise (Sonar S5852). Most node_modules barrel files are
  // small (<200 lines), so the overhead is trivial.
  const lines = text.split('\n');
  let changed = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line?.includes('export ')) {
      continue;
    }
    const match = REEXPORT_LINE_RE.exec(line);
    if (!match) {
      continue;
    }
    const [, indent, names, source] = match;
    const rewritten = rewriteOne(indent ?? '', names ?? '', source ?? '');
    if (rewritten !== line) {
      lines[i] = rewritten;
      changed = true;
    }
  }
  return changed ? lines.join('\n') : text;
}

function rewriteOne(indent: string, names: string, source: string): string {
  const parts: { orig: string; alias: string }[] = [];
  for (const raw of names.split(',')) {
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }
    // `Foo as Bar` → ['Foo', 'Bar']; `Foo` → ['Foo']. Splitting on the
    // literal ` as ` is safe because identifiers can't contain spaces.
    const aliasIdx = trimmed.indexOf(' as ');
    const orig = aliasIdx === -1 ? trimmed : trimmed.slice(0, aliasIdx).trim();
    const alias = aliasIdx === -1 ? orig : trimmed.slice(aliasIdx + 4).trim();
    parts.push({ orig, alias });
  }
  // Skip `default` re-exports — the bundler-friendly rewrite for those
  // varies across runtimes, and barrel files rarely re-export default
  // through this pattern.
  if (parts.some((p) => p.orig === 'default')) {
    return `${indent}export { ${names} } from ${source};`;
  }
  const importPart = parts.map((p) => `${p.orig} as __re_${p.alias}`).join(', ');
  const exportPart = parts.map((p) => `export const ${p.alias} = __re_${p.alias};`).join(' ');
  return `${indent}import { ${importPart} } from ${source}; ${exportPart}`;
}
