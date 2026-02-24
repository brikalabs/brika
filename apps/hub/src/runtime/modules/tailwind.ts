import TW_CUSTOM_THEME from '@brika/ui-kit/tailwind-theme.css' with { type: 'text' };
import TW_DEFAULT_THEME from 'tailwindcss/theme.css' with { type: 'text' };

type Build = (candidates: string[]) => string;

/** Extract candidate tokens from JS string literals. */
function extractCandidates(js: string): string[] {
  const tokens = new Set<string>();
  for (const m of js.matchAll(/"([^"\\]*)"/g)) {
    for (const t of m[1].split(/\s+/)) if (t) tokens.add(t);
  }
  for (const m of js.matchAll(/'([^'\\]*)'/g)) {
    for (const t of m[1].split(/\s+/)) if (t) tokens.add(t);
  }
  return [...tokens];
}

/**
 * Lazy Tailwind compiler — compile-once / build-many.
 * Extracts candidates from JS string literals, then lets
 * Tailwind's `build()` resolve them against the theme.
 */
export class TailwindCompiler {
  #build: Promise<Build> | null = null;

  async compileCss(jsSource: string): Promise<string | undefined> {
    this.#build ??= this.#init();
    const build = await this.#build;

    const candidates = extractCandidates(jsSource);
    if (candidates.length === 0) return undefined;

    const css = build(candidates);
    return css.length > 0 ? css : undefined;
  }

  async #init(): Promise<Build> {
    const { compile } = await import('tailwindcss');
    const compiled = await compile(
      [TW_DEFAULT_THEME, TW_CUSTOM_THEME, '@tailwind utilities;'].join('\n')
    );
    return (candidates) => compiled.build(candidates);
  }
}
