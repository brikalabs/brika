/**
 * Real-condition test: boots the gate Worker in workerd (via `wrangler dev`) and
 * compiles REAL repo plugins + a broken one, asserting accept/reject. No Bun in
 * the compile path - it runs in the actual Cloudflare runtime.
 *
 * The worker imports the BUILT `../dist/v8/index.js`, so run via `bun run test:cf`
 * (which builds first). Running this file directly needs a prior `bun run build`.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PORT = 8797;
const PLUGINS = join(import.meta.dir, '../../../plugins');

if (!existsSync(join(import.meta.dir, '../dist/v8/index.js'))) {
  console.error(
    'dist/v8 not built - run `bun run build` (or use `bun run test:cf`, which builds first).'
  );
  process.exit(1);
}
const ENTRY = /^src\/(bricks|pages)\/[^_/]+\.tsx$/;
const PARTIAL = /\.(brick|node|view)\.tsx$/;

function collect(plugin: string) {
  const src = join(PLUGINS, plugin, 'src');
  const sources: Record<string, string> = {};
  for (const rel of readdirSync(src, { recursive: true }).map(String)) {
    if (/\.(tsx?|jsx?)$/.test(rel)) sources[`src/${rel}`] = readFileSync(join(src, rel), 'utf8');
  }
  // Include package.json so the gate can read the capability manifest from it.
  sources['package.json'] = readFileSync(join(PLUGINS, plugin, 'package.json'), 'utf8');
  const entrypoints = Object.keys(sources).filter((p) => ENTRY.test(p) && !PARTIAL.test(p));
  return { sources, entrypoints };
}

const cases = [
  { name: 'weather  (real: tailwind, i18n)', ...collect('weather'), expect: 'accept' as const },
  { name: 'spotify  (real: actions)', ...collect('spotify'), expect: 'accept' as const },
  { name: 'matter   (real: actions, pages)', ...collect('matter'), expect: 'accept' as const },
  {
    name: 'broken   (syntax error)',
    sources: { 'src/bricks/bad.tsx': 'export default function( {\n' },
    entrypoints: ['src/bricks/bad.tsx'],
    expect: 'reject' as const,
  },
];

const wrangler = Bun.spawn(['bunx', 'wrangler', 'dev', '--port', String(PORT), '--local'], {
  cwd: join(import.meta.dir),
  stdout: 'pipe',
  stderr: 'pipe',
});

async function waitUp(): Promise<boolean> {
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/`);
      if (r.ok) {
        const j = (await r.json()) as { runtime: string };
        console.log(`worker up in ${j.runtime}\n`);
        return j.runtime === 'workerd';
      }
    } catch {}
    await Bun.sleep(1000);
  }
  return false;
}

let failures = 0;
try {
  if (!(await waitUp())) throw new Error('worker did not start in workerd');
  for (const c of cases) {
    const res = await fetch(`http://localhost:${PORT}/`, {
      method: 'POST',
      body: JSON.stringify({ sources: c.sources, entrypoints: c.entrypoints }),
    });
    const body = (await res.json()) as {
      runtime: string;
      result: { ok: boolean; entries?: number; chunks?: number; bridged?: boolean; error?: string };
      logs: Array<{ event: string; meta?: unknown }>;
    };
    const got = body.result.ok ? 'accept' : 'reject';
    const pass = got === c.expect && body.runtime === 'workerd';
    if (!pass) failures++;
    console.log(`${pass ? '✅' : '❌'} ${c.name}  [${body.runtime}]`);
    console.log(
      `     entrypoints=${c.entrypoints.length} -> ${got}` +
        (body.result.ok
          ? `  entries=${body.result.entries} chunks=${body.result.chunks} bridged=${body.result.bridged}`
          : `  error="${body.result.error?.slice(0, 90)}"`)
    );
    console.log(
      `     logs: ${body.logs.map((l) => `${l.event}${JSON.stringify(l.meta)}`).join('  ')}`
    );
  }
} finally {
  // Await shutdown before exiting: process.exit() without this tears Bun down
  // before wrangler propagates SIGTERM to its child workerd, orphaning a process
  // that keeps holding the port (the stale/flaky-run symptom).
  wrangler.kill('SIGTERM');
  await wrangler.exited;
}

console.log(
  `\n${failures === 0 ? '✅ ALL PASSED' : `❌ ${failures} FAILED`} (real workerd runtime)`
);
process.exit(failures === 0 ? 0 : 1);
