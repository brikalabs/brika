import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validatePlugin } from '../validate';

const STUB_TSX = 'export default function Stub() { return null; }\n';

describe('validatePlugin', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'brika-validate-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  // ── 1. Empty metadata ─────────────────────────────────────────────

  test('empty metadata returns ok with no diagnostics', async () => {
    const result = await validatePlugin(root, {});
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  test('explicit empty arrays return ok with no diagnostics', async () => {
    const result = await validatePlugin(root, { bricks: [], pages: [] });
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  // ── 2. Brick declared AND source exists ────────────────────────────

  test('declared brick with existing source file passes', async () => {
    await mkdir(join(root, 'src', 'bricks'), { recursive: true });
    await writeFile(join(root, 'src', 'bricks', 'thermostat.tsx'), STUB_TSX);

    const result = await validatePlugin(root, {
      bricks: [{ id: 'thermostat' }],
    });

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  // ── 3. Brick declared but source missing ───────────────────────────

  test('declared brick with missing source file produces error', async () => {
    await mkdir(join(root, 'src', 'bricks'), { recursive: true });

    const result = await validatePlugin(root, {
      bricks: [{ id: 'thermostat' }],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].level).toBe('error');
    expect(result.diagnostics[0].message).toContain('thermostat');
    expect(result.diagnostics[0].message).toContain('not found');
    expect(result.diagnostics[0].file).toBe(join(root, 'src', 'bricks', 'thermostat.tsx'));
  });

  // ── 4. Brick ID with unsafe characters ─────────────────────────────

  test('brick ID containing "/" is rejected', async () => {
    const result = await validatePlugin(root, {
      bricks: [{ id: '../escape' }],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].level).toBe('error');
    expect(result.diagnostics[0].message).toContain('unsafe characters');
  });

  test('brick ID containing forward slash is rejected', async () => {
    const result = await validatePlugin(root, {
      bricks: [{ id: 'foo/bar' }],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0].level).toBe('error');
    expect(result.diagnostics[0].message).toContain('unsafe characters');
  });

  test('brick ID containing backslash is rejected', async () => {
    const result = await validatePlugin(root, {
      bricks: [{ id: 'foo\\bar' }],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0].level).toBe('error');
    expect(result.diagnostics[0].message).toContain('unsafe characters');
  });

  test('brick ID containing ".." is rejected', async () => {
    const result = await validatePlugin(root, {
      bricks: [{ id: 'a..b' }],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0].level).toBe('error');
    expect(result.diagnostics[0].message).toContain('unsafe characters');
  });

  test('empty brick ID is rejected', async () => {
    const result = await validatePlugin(root, {
      bricks: [{ id: '' }],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0].level).toBe('error');
    expect(result.diagnostics[0].message).toContain('unsafe characters');
  });

  // ── 5. Page declared AND source exists ─────────────────────────────

  test('declared page with existing source file passes', async () => {
    await mkdir(join(root, 'src', 'pages'), { recursive: true });
    await writeFile(join(root, 'src', 'pages', 'settings.tsx'), STUB_TSX);

    const result = await validatePlugin(root, {
      pages: [{ id: 'settings' }],
    });

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  // ── 6. Page declared but source missing ────────────────────────────

  test('declared page with missing source file produces error', async () => {
    await mkdir(join(root, 'src', 'pages'), { recursive: true });

    const result = await validatePlugin(root, {
      pages: [{ id: 'settings' }],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].level).toBe('error');
    expect(result.diagnostics[0].message).toContain('settings');
    expect(result.diagnostics[0].message).toContain('not found');
    expect(result.diagnostics[0].file).toBe(join(root, 'src', 'pages', 'settings.tsx'));
  });

  // ── 7. Page ID with unsafe characters ──────────────────────────────

  test('page ID containing "/" is rejected', async () => {
    const result = await validatePlugin(root, {
      pages: [{ id: 'foo/bar' }],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0].level).toBe('error');
    expect(result.diagnostics[0].message).toContain('Page ID');
    expect(result.diagnostics[0].message).toContain('unsafe characters');
  });

  test('page ID containing backslash is rejected', async () => {
    const result = await validatePlugin(root, {
      pages: [{ id: 'foo\\bar' }],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0].level).toBe('error');
    expect(result.diagnostics[0].message).toContain('unsafe characters');
  });

  test('page ID containing ".." is rejected', async () => {
    const result = await validatePlugin(root, {
      pages: [{ id: '..' }],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0].level).toBe('error');
    expect(result.diagnostics[0].message).toContain('unsafe characters');
  });

  test('empty page ID is rejected', async () => {
    const result = await validatePlugin(root, {
      pages: [{ id: '' }],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0].level).toBe('error');
    expect(result.diagnostics[0].message).toContain('unsafe characters');
  });

  // ── 8. Undeclared brick file on disk ───────────────────────────────

  test('undeclared brick file on disk produces warning', async () => {
    await mkdir(join(root, 'src', 'bricks'), { recursive: true });
    await writeFile(join(root, 'src', 'bricks', 'orphan.tsx'), STUB_TSX);

    const result = await validatePlugin(root, { bricks: [] });

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].level).toBe('warning');
    expect(result.diagnostics[0].message).toContain('orphan');
    expect(result.diagnostics[0].message).toContain('not declared');
    expect(result.diagnostics[0].file).toBe(join(root, 'src', 'bricks', 'orphan.tsx'));
  });

  // ── 9. Undeclared page file on disk ────────────────────────────────

  test('undeclared page file on disk produces warning', async () => {
    await mkdir(join(root, 'src', 'pages'), { recursive: true });
    await writeFile(join(root, 'src', 'pages', 'orphan.tsx'), STUB_TSX);

    const result = await validatePlugin(root, { pages: [] });

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].level).toBe('warning');
    expect(result.diagnostics[0].message).toContain('orphan');
    expect(result.diagnostics[0].message).toContain('not declared');
    expect(result.diagnostics[0].file).toBe(join(root, 'src', 'pages', 'orphan.tsx'));
  });

  // ── 10. Mix of declared + undeclared bricks/pages ──────────────────

  test('mix of declared and undeclared bricks and pages', async () => {
    await mkdir(join(root, 'src', 'bricks'), { recursive: true });
    await mkdir(join(root, 'src', 'pages'), { recursive: true });

    // Declared and present
    await writeFile(join(root, 'src', 'bricks', 'light.tsx'), STUB_TSX);
    await writeFile(join(root, 'src', 'pages', 'home.tsx'), STUB_TSX);

    // Undeclared extras on disk
    await writeFile(join(root, 'src', 'bricks', 'extra-brick.tsx'), STUB_TSX);
    await writeFile(join(root, 'src', 'pages', 'extra-page.tsx'), STUB_TSX);

    const result = await validatePlugin(root, {
      bricks: [{ id: 'light' }],
      pages: [{ id: 'home' }],
    });

    expect(result.ok).toBe(true);

    const warnings = result.diagnostics.filter((d) => d.level === 'warning');
    expect(warnings).toHaveLength(2);

    const warningMessages = warnings.map((w) => w.message);
    expect(warningMessages.some((m) => m.includes('extra-brick'))).toBe(true);
    expect(warningMessages.some((m) => m.includes('extra-page'))).toBe(true);
  });

  // ── 11. No src/bricks or src/pages directories ─────────────────────

  test('missing src/bricks and src/pages directories do not cause errors', async () => {
    // root exists but has no src/ subdirectory at all
    const result = await validatePlugin(root, { bricks: [], pages: [] });

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  test('metadata with undefined bricks/pages and no directories on disk', async () => {
    const result = await validatePlugin(root, {});

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  // ── 12. Both errors and warnings combined → ok: false ──────────────

  test('errors and warnings combined yields ok false', async () => {
    await mkdir(join(root, 'src', 'bricks'), { recursive: true });
    await mkdir(join(root, 'src', 'pages'), { recursive: true });

    // Undeclared file on disk (warning)
    await writeFile(join(root, 'src', 'bricks', 'orphan.tsx'), STUB_TSX);

    // Declared brick with missing source (error)
    // Declared page with missing source (error)
    const result = await validatePlugin(root, {
      bricks: [{ id: 'missing-brick' }],
      pages: [{ id: 'missing-page' }],
    });

    expect(result.ok).toBe(false);

    const errors = result.diagnostics.filter((d) => d.level === 'error');
    const warnings = result.diagnostics.filter((d) => d.level === 'warning');

    expect(errors.length).toBeGreaterThanOrEqual(2);
    expect(warnings.length).toBeGreaterThanOrEqual(1);

    expect(errors.some((e) => e.message.includes('missing-brick'))).toBe(true);
    expect(errors.some((e) => e.message.includes('missing-page'))).toBe(true);
    expect(warnings.some((w) => w.message.includes('orphan'))).toBe(true);
  });

  // ── Additional edge cases ──────────────────────────────────────────

  test('multiple bricks all present produce no diagnostics', async () => {
    await mkdir(join(root, 'src', 'bricks'), { recursive: true });
    await writeFile(join(root, 'src', 'bricks', 'light.tsx'), STUB_TSX);
    await writeFile(join(root, 'src', 'bricks', 'switch.tsx'), STUB_TSX);
    await writeFile(join(root, 'src', 'bricks', 'thermostat.tsx'), STUB_TSX);

    const result = await validatePlugin(root, {
      bricks: [{ id: 'light' }, { id: 'switch' }, { id: 'thermostat' }],
    });

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  test('multiple unsafe brick IDs each produce their own error', async () => {
    const result = await validatePlugin(root, {
      bricks: [{ id: '' }, { id: 'a/b' }, { id: 'c\\d' }],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toHaveLength(3);
    expect(result.diagnostics.every((d) => d.level === 'error')).toBe(true);
  });

  test('unsafe brick ID skips file existence check', async () => {
    // Even if the file somehow existed, the unsafe ID should be rejected
    // without a `file` property on the diagnostic
    const result = await validatePlugin(root, {
      bricks: [{ id: '../escape' }],
    });

    expect(result.diagnostics[0].file).toBeUndefined();
  });

  test('unsafe page ID skips file existence check', async () => {
    const result = await validatePlugin(root, {
      pages: [{ id: '../escape' }],
    });

    expect(result.diagnostics[0].file).toBeUndefined();
  });

  test('declared brick file is not flagged as undeclared', async () => {
    await mkdir(join(root, 'src', 'bricks'), { recursive: true });
    await writeFile(join(root, 'src', 'bricks', 'light.tsx'), STUB_TSX);

    const result = await validatePlugin(root, {
      bricks: [{ id: 'light' }],
    });

    expect(result.diagnostics.filter((d) => d.level === 'warning')).toHaveLength(0);
  });

  test('declared page file is not flagged as undeclared', async () => {
    await mkdir(join(root, 'src', 'pages'), { recursive: true });
    await writeFile(join(root, 'src', 'pages', 'home.tsx'), STUB_TSX);

    const result = await validatePlugin(root, {
      pages: [{ id: 'home' }],
    });

    expect(result.diagnostics.filter((d) => d.level === 'warning')).toHaveLength(0);
  });
});
