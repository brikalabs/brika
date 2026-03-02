import TW_CUSTOM_THEME from '@brika/ui-kit/tailwind-theme.css' with { type: 'text' };
import TW_DEFAULT_THEME from 'tailwindcss/theme.css' with { type: 'text' };

type Build = (candidates: string[]) => string;

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
 * Strip theme declarations that the host app already provides.
 * Removes `:root, :host { ... }`, `@layer properties` (both the bare
 * declaration and the @supports fallback block), and the Tailwind banner.
 * Keeps utility class rules, @property, @keyframes.
 */
function stripThemeDeclarations(css: string): string {
  return (
    css
      // Tailwind banner comment
      .replace(/\/\*![\s\S]*?\*\/\n?/, '')
      // Bare `@layer properties;` declaration
      .replace(/@layer\s+properties\s*;\n?/, '')
      // `:root, :host { ... }` block (theme variables — host provides these)
      .replace(/:root\s*,\s*:host\s*\{[^}]*\}\n?/, '')
      // `@layer properties { @supports ... { ... } }` fallback block
      .replace(/@layer\s+properties\s*\{[\s\S]*?\}\s*\}\n?/, '')
  );
}

/** Minify CSS — strips comments, collapses whitespace. */
function minifyCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/\s*([{}:;,])\s*/g, '$1') // collapse around punctuation
    .replace(/\s+/g, ' ') // collapse runs of whitespace
    .replace(/;}/g, '}') // drop trailing semicolons
    .trim();
}

/**
 * Lazy Tailwind compiler — compile-once / build-many.
 * Extracts candidates from JS string literals, then lets
 * Tailwind's `build()` resolve them against the theme.
 *
 * Theme variables (`:root`) and `@layer properties` fallbacks are stripped —
 * the host app already provides them. Only utility rules, `@property`, and
 * `@keyframes` are emitted, keeping the output small and conflict-free.
 */
export class TailwindCompiler {
  #build: Promise<Build> | null = null;

  async compileCss(jsSource: string, scopeId?: string): Promise<string | undefined> {
    this.#build ??= this.#init();
    const build = await this.#build;

    const candidates = extractCandidates(jsSource);
    if (candidates.length === 0) {
      return undefined;
    }

    const css = build(candidates);
    if (css.length === 0) {
      return undefined;
    }

    const stripped = stripThemeDeclarations(css);
    if (stripped.trim().length === 0) {
      return undefined;
    }

    // Wrap in @layer utilities so specificity matches the host app's Tailwind.
    // When a scopeId is provided, also wrap in @scope so rules only apply
    // inside the matching [data-brika-scope="<scopeId>"] container.
    const scopeRule = scopeId
      ? `@scope ([data-brika-scope="${scopeId}"]) { ${stripped} }`
      : stripped;
    return minifyCss(`@layer utilities { ${scopeRule} }`);
  }

  async #init(): Promise<Build> {
    const { compile } = await import('tailwindcss');
    const compiled = await compile(
      [TW_DEFAULT_THEME, TW_CUSTOM_THEME, '@tailwind utilities;'].join('\n')
    );
    return (candidates) => compiled.build(candidates);
  }
}
