import { describe, expect, test } from 'bun:test';
import { compilePluginGate } from './gate';

// The gate is the isolate (rollup) path, which the `bun test` runner can host
// (unlike `Bun.build`). It compiles from an in-memory source map, exactly as a
// Cloudflare Worker would after untarring an uploaded plugin.
describe('compilePluginGate (publish-time compile gate)', () => {
  test('accepts a plugin that compiles, bundling its relative graph', async () => {
    const sources = new Map([
      [
        'src/bricks/a.tsx',
        `import { label } from '../util';\nexport const A = () => <div className="flex p-4">{label}</div>;`,
      ],
      ['src/util.ts', 'export const label = "hi";'],
    ]);
    const r = await compilePluginGate({ sources, entrypoints: ['src/bricks/a.tsx'] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.entries).toHaveLength(1);
      // react's JSX runtime is bridged to the host global, not bundled.
      expect(r.entries[0]?.js).toContain('globalThis.__brika.');
    }
  });

  test('rejects a syntax error, naming the offending file', async () => {
    const sources = new Map([['src/bricks/bad.tsx', 'export default function( {\n']]);
    const r = await compilePluginGate({ sources, entrypoints: ['src/bricks/bad.tsx'] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('bad.tsx');
    }
  });

  test('rejects when an entrypoint is missing from the sources', async () => {
    const r = await compilePluginGate({ sources: new Map(), entrypoints: ['src/bricks/nope.tsx'] });
    expect(r.ok).toBe(false);
  });

  test('accepts a plugin with no browser entrypoints (server-only / tools-only)', async () => {
    // No bricks/pages to compile is valid; the gate must not reject it (rollup
    // throws on an empty input, so IsolateBundler short-circuits).
    const r = await compilePluginGate({
      sources: new Map([['src/tools.ts', 'export const t = 1;']]),
      entrypoints: [],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.entries).toEqual([]);
      expect(r.chunks).toEqual([]);
    }
  });

  test('emits start + accept/reject logs for observability', async () => {
    const events: string[] = [];
    const log = (e: string) => events.push(e);
    await compilePluginGate({
      sources: new Map([['src/bricks/a.tsx', 'export const A = 1;']]),
      entrypoints: ['src/bricks/a.tsx'],
      log,
    });
    expect(events).toEqual(['gate:start', 'gate:accept']);

    events.length = 0;
    await compilePluginGate({
      sources: new Map([['src/bricks/b.tsx', 'export default function( {\n']]),
      entrypoints: ['src/bricks/b.tsx'],
      log,
    });
    expect(events).toEqual(['gate:start', 'gate:reject']);
  });

  test('reports capabilities from package.json + discovered actions', async () => {
    const sources = new Map([
      [
        'package.json',
        JSON.stringify({
          bricks: [{ id: 'a', name: 'Brick A' }],
          sparks: [{ id: 's' }],
        }),
      ],
      ['src/bricks/a.tsx', "import { run } from '../actions';\nexport const A = () => run;"],
      [
        'src/actions.ts',
        "import { defineAction } from '@brika/sdk/actions';\nexport const run = defineAction(async () => {});\nexport default defineAction(async () => {});",
      ],
    ]);
    const r = await compilePluginGate({ sources, entrypoints: ['src/bricks/a.tsx'] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      // capabilities read straight from package.json (with metadata)
      expect(r.report.manifest.bricks).toHaveLength(1);
      expect(r.report.manifest.sparks).toHaveLength(1);
      // both exports of the action file are listed (incl. `default`), each with an id
      const names = r.report.actions.map((a) => a.name).sort();
      expect(names).toEqual(['default', 'run']);
      expect(r.report.actions[0]?.actionId).toMatch(/^[0-9a-f]{12}$/);
      expect(r.report.actions.every((a) => a.file === 'src/actions.ts')).toBe(true);
    }
  });

  test('stamps the injected version', async () => {
    const sources = new Map([['src/bricks/a.tsx', 'export const A = 1;']]);
    const r = await compilePluginGate({
      sources,
      entrypoints: ['src/bricks/a.tsx'],
      version: 'deploy-9',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.entries[0]?.js).toContain('@brika-bundle:isolate@deploy-9');
    }
  });
});
