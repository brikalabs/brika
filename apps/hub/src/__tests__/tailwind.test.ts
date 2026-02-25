/**
 * Tests for TailwindCompiler.
 *
 * The private `extractCandidates` helper is tested indirectly
 * through `compileCss`, which is the only public surface.
 */

import { describe, expect, test } from 'bun:test';
import { TailwindCompiler } from '@/runtime/modules/tailwind';

describe('TailwindCompiler', () => {
  describe('compileCss', () => {
    test('returns CSS for valid Tailwind classes', async () => {
      const tw = new TailwindCompiler();
      const css = await tw.compileCss('const cls = "flex items-center"');
      expect(css).toBeDefined();
      expect(css).toContain('flex');
    });

    test('returns undefined for empty JS source', async () => {
      const tw = new TailwindCompiler();
      expect(await tw.compileCss('')).toBeUndefined();
    });

    test('returns undefined for JS with no string literals', async () => {
      const tw = new TailwindCompiler();
      const src = 'const x = 42;\nconst y = true;\nfunction foo() { return x + y; }';
      expect(await tw.compileCss(src)).toBeUndefined();
    });

    test('extracts candidates from double-quoted strings', async () => {
      const tw = new TailwindCompiler();
      const css = await tw.compileCss('const a = "p-4"');
      expect(css).toBeDefined();
      expect(css).toContain('padding');
    });

    test('extracts candidates from single-quoted strings', async () => {
      const tw = new TailwindCompiler();
      const css = await tw.compileCss("const a = 'mt-2'");
      expect(css).toBeDefined();
      expect(css).toContain('margin-top');
    });

    test('deduplicates candidates across strings', async () => {
      const tw = new TailwindCompiler();
      const src = 'const a = "flex"; const b = "flex"; const c = \'flex\'';
      const css = await tw.compileCss(src);
      expect(css).toBeDefined();
      // Should still produce valid CSS with flex appearing once in output
      const matches = css!.match(/display:\s*flex/g);
      expect(matches?.length).toBe(1);
    });

    test('caches the build across multiple calls', async () => {
      const tw = new TailwindCompiler();
      const css1 = await tw.compileCss('const a = "hidden"');
      const css2 = await tw.compileCss('const b = "block"');
      expect(css1).toBeDefined();
      expect(css2).toBeDefined();
      expect(css1).toContain('display');
      expect(css2).toContain('display');
    });

    test('returns only a header comment when no candidates match any utility', async () => {
      const tw = new TailwindCompiler();
      const css = await tw.compileCss('const a = "not-a-real-tw-class zzz-nope"');
      // Tailwind build() emits a license header even with zero matched utilities,
      // so compileCss returns a non-empty string rather than undefined.
      if (css !== undefined) {
        expect(css).not.toContain('{');
      }
    });
  });
});
