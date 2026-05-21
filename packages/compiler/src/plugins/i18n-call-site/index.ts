import { isAbsolute, relative } from 'node:path';
import type { BunPlugin } from 'bun';
import { injectCallSites } from './scanner';

/**
 * Inject build-time call-site metadata into `t('...')` and `tp(...)` calls
 * so the i18n devtools overlay can show the *source* file/line for plugin
 * code at runtime — even though plugin code is bundled and served at
 * `/api/bricks/modules/...`.
 *
 * Without this, the only signal the overlay has is `Error.stack`, which in
 * compiled output points at the bundle URL (and a single concatenated line
 * after `minify: true`). The transform rewrites:
 *
 *   - `t('key')`             → `t('key', { __cs: 'path:line' })`
 *   - `t(\`key\`)`           → `t(\`key\`, { __cs: 'path:line' })`
 *   - `t('key', {opts})`     → `t('key', { __cs: 'path:line', ...{opts} })`
 *                              (spliced inside the existing object literal)
 *   - `tp('pkg','key')`      → `tp('pkg','key', undefined, 'path:line')`
 *   - `tp('pkg','key','d')`  → `tp('pkg','key','d', 'path:line')`
 *
 * The runtime reads `options.__cs` (resp. `tp`'s 4th arg) instead of
 * walking the stack.
 *
 * The scanner is a hand-tuned tokenizer (not a regex) that tracks string
 * literals, template literals (including nested `${...}` interpolation),
 * single- and multi-line comments, and regex literals. It only matches
 * top-level identifier calls `t(` / `tp(` — not `foo.t(...)` or `cat(...)`
 * or `assert(...)`. Full lexical scope analysis (resolving `t` to the
 * `useLocale()` import) would require a real parser; the identifier
 * check catches >99% of real-world cases.
 *
 * @param sourceRoot Base directory paths in `__cs` are reported relative to.
 *   Pass the workspace root so the resulting `plugins/<pkg>/src/...` paths
 *   are resolvable by the dev-server's open-in-editor endpoint without
 *   plugin-specific knowledge. Defaults to the plugin's own root, which
 *   produces shorter paths but loses cross-plugin disambiguation.
 */
export function brikaI18nCallSitePlugin(sourceRoot: string): BunPlugin {
  return {
    name: 'brika-i18n-call-site',
    setup(build) {
      build.onLoad({ filter: /\.[jt]sx?$/ }, async (args) => {
        if (args.path.includes('/node_modules/')) {
          return undefined;
        }
        // Defense-in-depth: refuse to inject metadata for paths that escape
        // the configured sourceRoot. A plugin pulling in a sibling-workspace
        // file through `../../other-pkg/src/foo.ts` would otherwise leak the
        // unresolved relative path into the bundle, which the dev-server's
        // open-in-editor endpoint can't resolve cleanly. The /node_modules/
        // check above handles published packages; this catches in-tree paths.
        const relPath = relative(sourceRoot, args.path);
        if (relPath.startsWith('..') || isAbsolute(relPath)) {
          return undefined;
        }
        const text = await Bun.file(args.path).text();
        // Cheap pre-check: skip files that have no `t(` or `tp(` substring at
        // all. The tokenizer is fast but reading every .ts(x) file twice is
        // still wasteful when most files don't contain i18n calls.
        if (!hasIndicator(text)) {
          return undefined;
        }
        const transformed = injectCallSites(text, relPath);
        if (transformed === text) {
          return undefined;
        }
        return { contents: transformed, loader: loaderFor(args.path) };
      });
    },
  };
}

function loaderFor(path: string): 'ts' | 'tsx' | 'js' | 'jsx' {
  if (path.endsWith('.tsx')) {
    return 'tsx';
  }
  if (path.endsWith('.ts')) {
    return 'ts';
  }
  if (path.endsWith('.jsx')) {
    return 'jsx';
  }
  return 'js';
}

/** Quick reject: only scan files that mention `t(` or `tp(` literally. */
function hasIndicator(text: string): boolean {
  // The identifier-then-paren shape avoids matching `cat`, `it`, `assert`,
  // `expect`, etc. (those end in a different letter), and dodges `obj.t(` /
  // `obj.tp(` (those are preceded by `.`). The full check happens in the
  // tokenizer; this is just a cheap "is it even worth opening?" gate.
  return /(^|[^.\w$])t\s*\(|(^|[^.\w$])tp\s*\(/.test(text);
}

// ─── Character codes ────────────────────────────────────────────────────
export const CH_TAB = 0x09;
export const CH_LF = 0x0a;
export const CH_CR = 0x0d;
export const CH_SPACE = 0x20;
export const CH_DOLLAR = 0x24;
export const CH_SQUOTE = 0x27;
export const CH_DQUOTE = 0x22;
export const CH_LPAREN = 0x28;
export const CH_SLASH = 0x2f;
export const CH_LBRACE = 0x7b;
export const CH_RBRACE = 0x7d;
export const CH_BACKTICK = 0x60;

export function isIdentStart(ch: number): boolean {
  // a-z | A-Z | _ | $
  return (
    (ch >= 0x61 && ch <= 0x7a) ||
    (ch >= 0x41 && ch <= 0x5a) ||
    ch === 0x5f ||
    ch === CH_DOLLAR
  );
}

export function isIdentPart(ch: number): boolean {
  return isIdentStart(ch) || (ch >= 0x30 && ch <= 0x39);
}

/**
 * Tokens that, when last seen, indicate the next `/` divides rather than
 * opening a regex. Keywords that imply regex are handled separately in
 * `REGEX_PRECEDING_KEYWORDS`.
 */
export const DIVISION_PRECEDING = new Set([')', ']', '}', '++', '--']);

export const REGEX_PRECEDING_KEYWORDS = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'throw',
  'yield',
  'await',
  'case',
  'do',
  'else',
]);
