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

const REEXPORT_RE = /^(\s*)export\s+\{([^}]+)\}\s+from\s+(['"][^'"]+['"]);?\s*$/gm;

function rewriteBarrelReexports(text: string): string {
  return text.replaceAll(REEXPORT_RE, (_full, indent: string, names: string, source: string) => {
    const parts = names
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)
      .map((n) => {
        const [orig, alias] = n.split(/\s+as\s+/).map((s) => s.trim());
        return { orig, alias: alias ?? orig };
      });
    // Skip `default` re-exports — the bundler-friendly rewrite for those
    // varies across runtimes, and barrel files rarely re-export default
    // through this pattern.
    if (parts.some((p) => p.orig === 'default')) {
      return _full;
    }
    const importPart = parts.map((p) => `${p.orig} as __re_${p.alias}`).join(', ');
    const exportPart = parts.map((p) => `export const ${p.alias} = __re_${p.alias};`).join(' ');
    return `${indent}import { ${importPart} } from ${source}; ${exportPart}`;
  });
}
