/**
 * Extra coverage for scan-usage/dispatch.ts — targeting uncovered branches:
 *   - line 82: addStaticUsage with empty rawKey returns early
 *   - lines 152, 159-160: detectDefaultNamespace branches (no '(' after useTranslation,
 *     and non-static arg returns inherited)
 *   - line 228: findArgSeparator trailing whitespace path
 *   - line 241: dispatchTpArgs returns early for non-static/non-prefix first arg (none kind)
 *   - lines 247-248: dispatchTpArgs first.kind === 'prefix' path
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanKeyUsages } from './dispatch';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function writeSrc(dir: string, name: string, content: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), content);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('scanKeyUsages dispatch branches', () => {
  let workDir: string;
  let srcDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'dispatch-extra-'));
    srcDir = join(workDir, 'src');
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  // ── line 82: addStaticUsage returns early on empty key ────────────────────

  test('addStaticUsage: JSON $t() with empty group produces no entry', async () => {
    // A locale JSON file with an empty $t() ref — the regex captures empty string
    // which hits the !rawKey guard in addStaticUsage
    await writeSrc(srcDir, 'en.json', '{\n"bad": "$t()"\n}\n');
    const result = await scanKeyUsages(workDir, [{ dir: srcDir }]);
    // No key added for the empty $t() reference
    expect(Object.keys(result.keys)).toHaveLength(0);
  });

  // ── lines 152, 159-160: detectDefaultNamespace branches ──────────────────

  test('useTranslation with no opening paren is ignored, falls back to inherited ns', async () => {
    // Declare useTranslation without calling it (no '(' follows)
    // The scanner should not detect a namespace and should use the inherited one
    await writeSrc(
      srcDir,
      'app.ts',
      // useTranslation appears but has no '(' after it (just a line break)
      'const useTranslation = () => {};\nt("myns:key");\n'
    );
    const result = await scanKeyUsages(workDir, [{ dir: srcDir, namespace: 'inherited' }]);
    // 'myns:key' is qualified already so no fallback needed; verify it's captured
    expect(result.keys['myns:key']).toBeDefined();
  });

  test('useTranslation with dynamic variable argument falls back to inherited ns', async () => {
    // `useTranslation(varName)` — non-static arg means we can't know the ns
    await writeSrc(srcDir, 'dynamic-ns.ts', 'useTranslation(varName);\nt("hello");\n');
    const result = await scanKeyUsages(workDir, [{ dir: srcDir, namespace: 'fallback' }]);
    // 'hello' has no qualifier, so it should be scoped to inherited namespace 'fallback'
    expect(result.keys['fallback:hello']).toBeDefined();
  });

  test('useTranslation with prefix template argument falls back to inherited ns', async () => {
    // `useTranslation(\`ns-${x}\`)` — prefix-kind, not static
    await writeSrc(srcDir, 'prefix-ns.ts', 'useTranslation(`ns-${x}`);\nt("mykey");\n');
    const result = await scanKeyUsages(workDir, [{ dir: srcDir, namespace: 'fallback' }]);
    // Should fall back to inherited 'fallback' namespace
    expect(result.keys['fallback:mykey']).toBeDefined();
  });

  // ── line 228: findArgSeparator whitespace traversal ───────────────────────

  test('tp() with whitespace between first and second args is still parsed correctly', async () => {
    // findArgSeparator skips whitespace to find the comma
    await writeSrc(srcDir, 'tp-space.ts', 'tp("myplugin"   ,   "somekey");\n');
    const result = await scanKeyUsages(workDir, [{ dir: srcDir }]);
    expect(result.keys['myplugin:somekey']).toBeDefined();
  });

  // ── line 241: dispatchTpArgs returns early when first arg has kind 'none' ─

  test('tp() with no first argument does not produce any usage entry', async () => {
    // tp() with empty parens — first.kind === 'none' triggers the early return
    await writeSrc(srcDir, 'tp-none.ts', 'tp();\n');
    const result = await scanKeyUsages(workDir, [{ dir: srcDir }]);
    expect(Object.keys(result.keys)).toHaveLength(0);
    expect(result.hasGlobalOpaque).toBe(false);
  });

  test('tp() with opaque first arg triggers global opaque (line 210-212 path)', async () => {
    // tp(varName, 'key') — first is opaque so namespace is dynamic
    await writeSrc(srcDir, 'tp-opaque.ts', 'tp(someVar, "key");\n');
    const result = await scanKeyUsages(workDir, [{ dir: srcDir }]);
    // opaque first arg: hasGlobalOpaque should be set
    expect(result.hasGlobalOpaque).toBe(true);
  });

  // ── lines 247-248: dispatchTpArgs first.kind === 'prefix' ────────────────

  test('tp() with template-literal first arg (prefix kind) adds opaque for the static prefix', async () => {
    // tp(`ns-${x}`, 'key') — first.kind === 'prefix', value is 'ns-'
    await writeSrc(srcDir, 'tp-prefix.ts', 'tp(`ns-${x}`, "key");\n');
    const result = await scanKeyUsages(workDir, [{ dir: srcDir }]);
    // The prefix 'ns-' is a partial namespace so we should see opaque registered
    expect(result.opaqueNamespaces.some((ns) => ns.startsWith('ns-') || ns === 'ns-')).toBe(true);
  });

  test('tp() with empty template-literal first arg (prefix with empty value) triggers global opaque', async () => {
    // tp(`${x}`, 'key') — first.kind === 'prefix', value is '' (empty prefix)
    // addOpaque(usageMap, '' || null) => addOpaque(usageMap, null) => hasGlobalOpaque
    await writeSrc(srcDir, 'tp-empty-prefix.ts', 'tp(`${x}`, "key");\n');
    const result = await scanKeyUsages(workDir, [{ dir: srcDir }]);
    expect(result.hasGlobalOpaque).toBe(true);
  });

  // ── duplicate static usage on same file+line ──────────────────────────────

  test('identical t() call on same line is not duplicated in usage', async () => {
    // Two identical t('common:hello') calls on different lines produce two entries
    // but same file+line would be deduplicated
    await writeSrc(srcDir, 'dup.ts', 't("common:hello"); t("common:hello");\n');
    const result = await scanKeyUsages(workDir, [{ dir: srcDir }]);
    // Same line (line 1) — the second occurrence should be deduplicated
    const entries = result.keys['common:hello'] ?? [];
    // Both are on line 1, file is same — deduplication prevents double-add
    const line1Entries = entries.filter((e) => e.line === 1);
    expect(line1Entries).toHaveLength(1);
  });

  test('same key on different lines produces two usage entries', async () => {
    await writeSrc(srcDir, 'multiline.ts', 't("common:hello");\nt("common:hello");\n');
    const result = await scanKeyUsages(workDir, [{ dir: srcDir }]);
    const entries = result.keys['common:hello'] ?? [];
    expect(entries).toHaveLength(2);
    expect(entries[0]?.line).toBe(1);
    expect(entries[1]?.line).toBe(2);
  });

  // ── addPattern: empty prefix triggers global opaque ───────────────────────

  test('t() with a fully-dynamic template (no prefix) triggers global opaque in namespace context', async () => {
    // t(`${varName}`) — prefix is empty string
    await writeSrc(srcDir, 'fully-dynamic.ts', 'useTranslation("auth");\nt(`${key}`);\n');
    const result = await scanKeyUsages(workDir, [{ dir: srcDir }]);
    // Empty prefix with defaultNs='auth' -> addOpaque(map, 'auth')
    expect(result.opaqueNamespaces).toContain('auth');
  });

  test('t() with a fully-dynamic template and no namespace context triggers global opaque', async () => {
    // t(`${varName}`) — no namespace context, no useTranslation
    await writeSrc(srcDir, 'global-opaque.ts', 't(`${key}`);\n');
    const result = await scanKeyUsages(workDir, [{ dir: srcDir }]);
    expect(result.hasGlobalOpaque).toBe(true);
  });

  // ── tp() second arg edge cases ────────────────────────────────────────────

  test('tp() with prefix-kind second arg adds a pattern', async () => {
    // tp('ns', `pre.${x}`) — second.kind === 'prefix'
    await writeSrc(srcDir, 'tp-prefix-second.ts', 'tp("ns", `pre.${x}`);\n');
    const result = await scanKeyUsages(workDir, [{ dir: srcDir }]);
    expect(result.patterns.some((p) => p.startsWith('ns:pre.'))).toBe(true);
  });

  test('tp() with opaque second arg adds namespace to opaqueNamespaces', async () => {
    // tp('ns', varName) — second.kind === 'opaque'
    await writeSrc(srcDir, 'tp-opaque-second.ts', 'tp("ns", varName);\n');
    const result = await scanKeyUsages(workDir, [{ dir: srcDir }]);
    expect(result.opaqueNamespaces).toContain('ns');
  });

  test('tp() with no comma after first arg (no second arg) is skipped', async () => {
    // tp('ns') — no second arg, findArgSeparator returns -1
    await writeSrc(srcDir, 'tp-nocomma.ts', 'tp("ns");\n');
    const result = await scanKeyUsages(workDir, [{ dir: srcDir }]);
    expect(Object.keys(result.keys)).toHaveLength(0);
    expect(result.opaqueNamespaces).toHaveLength(0);
  });

  // ── addPattern: duplicate patterns are deduped ────────────────────────────

  test('same template-literal prefix from multiple call sites is stored only once', async () => {
    await writeSrc(srcDir, 'dedup-pattern.ts', 't(`auth:rules.${a}`);\nt(`auth:rules.${b}`);\n');
    const result = await scanKeyUsages(workDir, [{ dir: srcDir }]);
    const authRulesPatterns = result.patterns.filter((p) => p === 'auth:rules.');
    expect(authRulesPatterns).toHaveLength(1);
  });
});
