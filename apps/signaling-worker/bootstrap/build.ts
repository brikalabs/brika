#!/usr/bin/env bun
/**
 * Build the bootstrap shell that the Worker serves at every UI path.
 *
 * Output layout (`apps/signaling-worker/public/`):
 *   index.html      — splash + spinner + <script type=module src=/bootstrap-XXX.js>
 *   bootstrap-XXX.js — the bundled bootstrap (cache-busted by content hash)
 *
 * The build is intentionally minimal — no Vite, no React. The bootstrap is
 * the smallest piece of code that can open the WebRTC bridge to the hub and
 * dynamic-import the actual app. Everything else (the app, all its chunks,
 * CSS, fonts) lives on the hub and is delivered through the bridge.
 */
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const HERE = import.meta.dir;
const ROOT = join(HERE, '..');
const PUBLIC_DIR = join(ROOT, 'public');

async function buildBootstrap(): Promise<string> {
  const result = await Bun.build({
    entrypoints: [join(HERE, 'bootstrap.ts')],
    outdir: PUBLIC_DIR,
    target: 'browser',
    format: 'esm',
    minify: true,
    naming: '[dir]/bootstrap-[hash].[ext]',
    sourcemap: 'none',
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
  const built = result.outputs.find((o) => o.path.endsWith('.js'));
  if (!built) {
    console.error('Bootstrap build produced no JS output');
    process.exit(1);
  }
  return `/${built.path.split('/').pop()}`;
}

/**
 * Build the Service Worker as `sw.js` at the root of `public/`. The path is
 * fixed (not content-hashed) because browsers identify a SW registration by
 * its script URL — changing the URL would orphan the previous SW and require
 * a full re-registration cycle from every existing client.
 *
 * The SW itself is small and its content is content-hashed by the browser's
 * `update on every navigation` logic; cache invalidation isn't a problem.
 */
async function buildServiceWorker(): Promise<void> {
  const result = await Bun.build({
    entrypoints: [join(HERE, 'sw.ts')],
    outdir: PUBLIC_DIR,
    target: 'browser',
    format: 'esm',
    minify: true,
    naming: '[dir]/sw.[ext]',
    sourcemap: 'none',
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  if (existsSync(PUBLIC_DIR)) {
    // Wipe stale outputs so a previous build's hashed file doesn't linger.
    for (const entry of await readdir(PUBLIC_DIR)) {
      await rm(join(PUBLIC_DIR, entry), { recursive: true, force: true });
    }
  } else {
    await mkdir(PUBLIC_DIR, { recursive: true });
  }

  const bootstrapHref = await buildBootstrap();
  await buildServiceWorker();

  const html = await readFile(join(HERE, 'index.html'), 'utf8');
  const rewritten = html.replace('./bootstrap.js', bootstrapHref);
  await writeFile(join(PUBLIC_DIR, 'index.html'), rewritten);

  console.log(`Bootstrap built → ${PUBLIC_DIR}`);
  console.log(`  index.html`);
  console.log(`  ${bootstrapHref.slice(1)}`);
  console.log(`  sw.js`);
}

await main();
