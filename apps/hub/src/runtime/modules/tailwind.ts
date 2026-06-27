import TW_CUSTOM_THEME from '@brika/ui-kit/tailwind-theme.css' with { type: 'text' };
import TW_DEFAULT_THEME from 'tailwindcss/theme.css' with { type: 'text' };

type Compile = typeof import('tailwindcss').compile;

/** Extract candidate tokens from JS string literals. */
function extractCandidates(js: string): string[] {
  const tokens = new Set<string>();
  for (const m of js.matchAll(/"([^"\\]*)"/g)) {
    for (const t of m[1].split(/\s+/)) {
      if (t) {
        tokens.add(t);
      }
    }
  }
  for (const m of js.matchAll(/'([^'\\]*)'/g)) {
    for (const t of m[1].split(/\s+/)) {
      if (t) {
        tokens.add(t);
      }
    }
  }
  return [...tokens];
}

/**
 * Strip declarations the host app already provides AND extract the
 * `:root, :host { ... }` token block so the caller can rescope it.
 *
 * The host's Tailwind only emits CSS variables for utilities the host's
 * own source uses — a brick that uses `bg-slate-900` while the host
 * doesn't would resolve `var(--color-slate-900)` against nothing and
 * fall through to whatever the parent paints (white, in light mode).
 * So we keep the brick's tokens, but pin them to the brick's scope
 * element instead of leaking them onto `:root` globally.
 */
function stripThemeDeclarations(css: string): { css: string; tokens: string } {
  let tokens = '';
  const stripped = css
    // Tailwind banner comment
    .replace(/\/\*![\s\S]*?\*\/\n?/, '')
    // Bare `@layer properties;` declaration
    .replace(/@layer\s+properties\s*;\n?/, '')
    // `:root, :host { ... }` — capture the token body, drop the selector
    .replace(/:root\s*,\s*:host\s*\{([^}]*)\}\n?/, (_full, body: string) => {
      tokens = body.trim();
      return '';
    })
    // `@layer properties { @supports ... { ... } }` fallback block
    .replace(/@layer\s+properties\s*\{[\s\S]*?\}\s*\}\n?/, '');
  return { css: stripped, tokens };
}

/** Minify CSS — strips comments, collapses whitespace. */
function minifyCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/\s+/g, ' ') // collapse runs of whitespace to single spaces
    .replace(/ ?([{}:;,]) ?/g, '$1') // drop the single spaces left around punctuation
    .replaceAll(';}', '}') // drop trailing semicolons
    .trim();
}

/**
 * Lazy Tailwind compiler — compile-once / build-many.
 * Extracts candidates from JS string literals, then lets
 * Tailwind's `build()` resolve them against the theme.
 *
 * `@layer properties` fallbacks are stripped (the host app already
 * registers them). The token block from `:root, :host` is rescoped
 * onto the brick's scope element so brick-only colors (e.g.
 * `--color-slate-900` for a brick the host never uses) resolve
 * correctly inside the brick without leaking onto `:root`.
 */
export class TailwindCompiler {
  // The `compile` import is reused; the *design system* it returns is not. Its
  // `build()` accumulates candidates across calls, so a shared one would make
  // every module's CSS the running union of every module compiled before it
  // (across all plugins in a hub session). A fresh design system per call keeps
  // each module's CSS to its own classes. Parsing the theme is cheap (~3ms) and
  // the result is cached on disk, so this only runs on a cold compile.
  #compile: Promise<Compile> | null = null;
  readonly #theme = [TW_DEFAULT_THEME, TW_CUSTOM_THEME, '@tailwind utilities;'].join('\n');

  async compileCss(jsSource: string, scopeId?: string): Promise<string | undefined> {
    const candidates = extractCandidates(jsSource);
    if (candidates.length === 0) {
      return undefined;
    }

    this.#compile ??= import('tailwindcss').then((m) => m.compile);
    const compile = await this.#compile;
    const css = (await compile(this.#theme)).build(candidates);
    if (css.length === 0) {
      return undefined;
    }

    const { css: stripped, tokens } = stripThemeDeclarations(css);
    if (stripped.trim().length === 0 && tokens.length === 0) {
      return undefined;
    }

    // Wrap in @layer utilities so specificity matches the host app's Tailwind.
    // When a scopeId is provided, also wrap in @scope so rules only apply
    // inside the matching [data-brika-scope="<scopeId>"] container, and
    // pin the token block to `:scope` (the scope root) so the variables
    // cascade only into the brick's subtree.
    if (scopeId) {
      const scopedTokens = tokens ? `:scope { ${tokens} }` : '';
      const scopeBody = `${scopedTokens} ${stripped}`.trim();
      return minifyCss(
        `@layer utilities { @scope ([data-brika-scope="${scopeId}"]) { ${scopeBody} } }`
      );
    }
    // Unscoped fallback: re-attach the token block to `:root` so the
    // utilities still resolve their variables.
    const rootTokens = tokens ? `:root, :host { ${tokens} }` : '';
    return minifyCss(`@layer utilities { ${rootTokens} ${stripped} }`);
  }
}
