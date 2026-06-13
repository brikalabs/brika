#!/usr/bin/env bun
/**
 * npm publish/install acceptance e2e (Bun-only, no Docker required).
 *
 * Publishes the shipped Brika surface to a throwaway verdaccio registry exactly
 * as a real release would (`bun publish` rewrites `workspace:*` to concrete
 * ranges), then exercises two real consumer paths against that registry:
 *
 *   1. CONSUMER ROUND-TRIP: a clean dir `bun add`s @brika/sdk + plugins straight
 *      from the registry and imports the SDK. Catches a misdeclared dependency,
 *      an unrewritten `workspace:*` range, or a broken tarball.
 *   2. HUB LOAD: a real headless hub installs @brika/plugin-timer from the
 *      registry through its own install path and we assert the plugin loaded and
 *      registered a block. Catches host-integration regressions the import test
 *      cannot (the compiler externalizing @brika/sdk to host globals, block
 *      registration, plugin compile/load).
 *
 * Verdaccio runs as a plain process via `bunx` (it is just an npm package), so
 * this needs no Docker daemon and runs anywhere Bun runs. Set VERDACCIO_REGISTRY
 * to reuse an already-running registry instead of spawning one.
 *
 *   bun run e2e/acceptance.ts
 */

import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { discoverPublishOrder } from '../scripts/release-libs';

const REPO_ROOT = resolve(import.meta.dir, '..');
const VERDACCIO_PORT = 4873;
const REGISTRY = (process.env.VERDACCIO_REGISTRY ?? `http://localhost:${VERDACCIO_PORT}`).replace(
  /\/$/,
  ''
);
const REGISTRY_HOST = REGISTRY.replace(/^https?:/, ''); // //localhost:4873
const HUB_PORT = 3999;
const HUB_URL = `http://127.0.0.1:${HUB_PORT}`;

const CLOSURE = ['errors', 'flow', 'grants', 'ipc', 'serializable', 'ui-kit'];
const REACT_FREE_SUBPATHS = ['@brika/sdk/ctx', '@brika/sdk/sparks', '@brika/sdk/schema', '@brika/sdk/grants'];

/** Plugin used for the hub-load assertion: grant-free, so it installs ENABLED. */
const HUB_PLUGIN = '@brika/plugin-timer';

type Cleanup = Array<() => void | Promise<void>>;

function run(cmd: string[], opts: { cwd?: string; env?: Record<string, string> } = {}): void {
  const proc = Bun.spawnSync(cmd, {
    cwd: opts.cwd ?? REPO_ROOT,
    env: { ...process.env, ...opts.env },
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if (proc.exitCode !== 0) {
    throw new Error(`Command failed (${proc.exitCode}): ${cmd.join(' ')}`);
  }
}

async function ping(url: string): Promise<boolean> {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

async function waitFor(check: () => Promise<boolean>, what: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) {
      return;
    }
    await Bun.sleep(1000);
  }
  throw new Error(`${what} not ready within ${timeoutMs}ms`);
}

/** GET + zod-parse; null on any network/HTTP/parse failure, so it is safe to poll. */
async function fetchJson<T>(url: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, init);
    return res.ok ? schema.parse(await res.json()) : null;
  } catch {
    return null;
  }
}

/** Best-effort text body of an endpoint, for failure diagnostics only. */
async function dump(url: string, init?: RequestInit): Promise<string> {
  try {
    return await (await fetch(url, init)).text();
  } catch {
    return '<unreachable>';
  }
}

/** Start verdaccio via bunx (temp storage) unless one is already serving REGISTRY. */
async function startVerdaccio(cleanup: Cleanup): Promise<void> {
  if (await ping(`${REGISTRY}/-/ping`)) {
    console.log(`[e2e] reusing verdaccio at ${REGISTRY}`);
    return;
  }
  const dir = await mkdtemp(join(tmpdir(), 'brika-e2e-verdaccio-'));
  cleanup.push(() => rm(dir, { recursive: true, force: true }));
  const template = await readFile(join(REPO_ROOT, 'e2e/verdaccio.config.yaml'), 'utf8');
  const configPath = join(dir, 'config.yaml');
  await writeFile(configPath, template.replaceAll('/verdaccio/storage', join(dir, 'storage')));

  console.log('[e2e] starting verdaccio (bunx, no docker)');
  const proc = Bun.spawn(['bunx', 'verdaccio@6', '--config', configPath, '--listen', String(VERDACCIO_PORT)], {
    cwd: REPO_ROOT,
    stdout: 'ignore',
    stderr: 'ignore',
  });
  cleanup.push(() => proc.kill());
  await waitFor(() => ping(`${REGISTRY}/-/ping`), 'verdaccio', 90_000);
}

const tokenSchema = z.object({ token: z.string().min(1) }).loose();

/**
 * Register a throwaway user and return its publish token. The username is unique
 * per run so registration always succeeds with a fresh token (201 + token),
 * which also works against a reused VERDACCIO_REGISTRY (no token-less 409 path).
 */
async function createToken(): Promise<string> {
  const user = `brika-e2e-${Date.now()}`;
  const res = await fetch(`${REGISTRY}/-/user/org.couchdb.user:${user}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: user, password: 'brika-e2e', email: 'e2e@brika.dev' }),
  });
  if (!res.ok) {
    throw new Error(`could not create verdaccio user: ${res.status} ${await res.text()}`);
  }
  return tokenSchema.parse(await res.json()).token;
}

/** Publish the shipped surface to verdaccio (bun publish rewrites workspace:*). */
async function publishAll(cleanup: Cleanup): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), 'brika-e2e-home-'));
  cleanup.push(() => rm(home, { recursive: true, force: true }));
  const token = await createToken();
  await Bun.write(
    join(home, '.npmrc'),
    `${REGISTRY_HOST}/:_authToken=${token}\n@brika:registry=${REGISTRY}/\nregistry=${REGISTRY}/\n`
  );

  console.log('[e2e] building artifact producers');
  run(['bun', 'run', '--filter', '@brika/sdk', 'build:bin']);
  run(['bun', 'run', '--filter', 'create-brika', 'build']);

  // Reuse the same derived publish order as the real release (no duplicate list).
  // bun publish rewrites workspace:* and only uploads each package's own files, so
  // publishing the full set is cheap even for heavy plugins (their deps are not
  // fetched at publish time).
  console.log('[e2e] publishing to verdaccio');
  for (const pkg of await discoverPublishOrder()) {
    run(['bun', 'publish', '--registry', `${REGISTRY}/`, '--tolerate-republish', '--ignore-scripts'], {
      cwd: join(REPO_ROOT, pkg.relDir),
      env: { HOME: home },
    });
  }
}

/** Phase 1: a clean Bun consumer installs + imports the SDK straight from the registry. */
async function consumerRoundTrip(cleanup: Cleanup): Promise<void> {
  const consumer = await mkdtemp(join(tmpdir(), 'brika-e2e-consumer-'));
  cleanup.push(() => rm(consumer, { recursive: true, force: true }));
  await Bun.write(join(consumer, '.npmrc'), `@brika:registry=${REGISTRY}/\nregistry=${REGISTRY}/\n`);
  await Bun.write(
    join(consumer, 'package.json'),
    `${JSON.stringify({ name: 'brika-e2e-consumer', version: '0.0.0', private: true }, null, 2)}\n`
  );

  console.log('[e2e] consumer: bun add @brika/sdk + plugins from verdaccio');
  run(['bun', 'add', '@brika/sdk', '@brika/plugin-timer', '@brika/plugin-weather'], { cwd: consumer });

  const missing = ['sdk', ...CLOSURE, 'plugin-timer', 'plugin-weather'].filter(
    (n) => !existsSync(join(consumer, 'node_modules', '@brika', n))
  );
  if (missing.length > 0) {
    throw new Error(`[e2e] FAIL: not installed from registry: ${missing.join(', ')}`);
  }

  const imports = REACT_FREE_SUBPATHS.map((s) => `await import(${JSON.stringify(s)});`).join(' ');
  const script = `${imports} console.log('IMPORT-OK');`;
  const imported = Bun.spawnSync(['bun', '-e', script], { cwd: consumer, stdout: 'pipe', stderr: 'pipe' });
  if (imported.exitCode !== 0 || !imported.stdout.toString().includes('IMPORT-OK')) {
    throw new Error(`[e2e] FAIL: SDK import failed:\n${imported.stderr.toString()}`);
  }
  console.log('[e2e] consumer round-trip OK');
}

const pluginSchema = z.object({ name: z.string(), status: z.string().optional() }).loose();
const blockSchema = z
  .object({ id: z.string().optional(), pluginId: z.string().optional(), typeId: z.string().optional() })
  .loose();

const ssePhaseSchema = z.object({ phase: z.string().optional() }).loose();

/** Parse one SSE `data:` line; returns true at the terminal `complete`, throws on `error`. */
function installFrameComplete(line: string): boolean {
  if (!line.startsWith('data:')) {
    return false;
  }
  const phase = ssePhaseSchema.parse(JSON.parse(line.slice(5).trim())).phase;
  if (phase === 'error') {
    throw new Error(`[e2e] FAIL: hub install errored: ${line}`);
  }
  return phase === 'complete';
}

/** Consume the install SSE stream until it completes or errors. */
async function drainInstallStream(res: Response): Promise<void> {
  if (!res.body) {
    throw new Error(`install returned no stream (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split('\n');
    // Keep the trailing partial line in the buffer until the next read completes it.
    buffer = done ? '' : (lines.pop() ?? '');
    for (const line of lines) {
      if (installFrameComplete(line)) {
        return;
      }
    }
    if (done) {
      return;
    }
  }
}

/** Phase 2: a real headless hub installs the plugin from the registry and loads it. */
async function hubLoad(cleanup: Cleanup): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), 'brika-e2e-hub-'));
  cleanup.push(() => rm(home, { recursive: true, force: true }));

  console.log('[e2e] booting headless hub');
  const hub = Bun.spawn(['bun', 'run', 'apps/hub/src/main.ts'], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      BRIKA_HOME: home,
      BRIKA_PORT: String(HUB_PORT),
      BRIKA_HOST: '127.0.0.1',
      BRIKA_SECRETS_BACKEND: 'file',
      // The hub's plugin-install child inherits this and fetches from verdaccio.
      npm_config_registry: `${REGISTRY}/`,
    },
    stdout: 'ignore',
    stderr: 'ignore',
  });
  cleanup.push(() => hub.kill());

  await waitFor(
    async () =>
      (await fetchJson(`${HUB_URL}/api/health`, z.object({ ready: z.boolean() }).loose()))?.ready === true,
    'hub',
    60_000
  );

  const token = (await readFile(join(home, 'cli-token'), 'utf8')).trim();
  const auth = { Authorization: `Bearer ${token}` };

  console.log(`[e2e] installing ${HUB_PLUGIN} into the hub from verdaccio`);
  const installRes = await fetch(`${HUB_URL}/api/registry/install`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ package: HUB_PLUGIN }),
  });
  if (!installRes.ok) {
    throw new Error(`[e2e] FAIL: install request rejected: ${installRes.status} ${await installRes.text()}`);
  }
  await drainInstallStream(installRes);

  // The plugin loads + compiles shortly after install completes; poll for it.
  await waitFor(
    async () =>
      ((await fetchJson(`${HUB_URL}/api/plugins`, z.array(pluginSchema), { headers: auth })) ?? []).some(
        (p) => p.name === HUB_PLUGIN
      ),
    `${HUB_PLUGIN} in /api/plugins`,
    30_000
  );

  // Blocks register via the ModuleCompiler shortly after the plugin appears, so poll.
  const matchesTimer = (b: z.infer<typeof blockSchema>): boolean =>
    b.pluginId === HUB_PLUGIN ||
    (b.typeId ?? '').includes('plugin-timer') ||
    b.id === 'timer' ||
    b.id === 'countdown';

  let blockCount = 0;
  await waitFor(
    async () => {
      const blocks =
        (await fetchJson(`${HUB_URL}/api/blocks`, z.array(blockSchema), { headers: auth })) ?? [];
      blockCount = blocks.filter(matchesTimer).length;
      return blockCount > 0;
    },
    `${HUB_PLUGIN} blocks`,
    30_000
  ).catch(async () => {
    const plugins = await dump(`${HUB_URL}/api/plugins`, { headers: auth });
    const blocks = await dump(`${HUB_URL}/api/blocks`, { headers: auth });
    throw new Error(
      `[e2e] FAIL: ${HUB_PLUGIN} registered no blocks.\n/api/plugins=${plugins}\n/api/blocks=${blocks}`
    );
  });
  console.log(`[e2e] hub load OK (${HUB_PLUGIN} loaded, ${blockCount} block(s) registered)`);
}

async function main(): Promise<void> {
  console.log(`[e2e] registry: ${REGISTRY}`);
  const cleanup: Cleanup = [];
  try {
    await startVerdaccio(cleanup);
    await publishAll(cleanup);
    await consumerRoundTrip(cleanup);
    await hubLoad(cleanup);
    console.log('[e2e] PASS: publish -> registry -> consumer install + hub load all succeeded.');
  } finally {
    for (const fn of cleanup.toReversed()) {
      try {
        await fn();
      } catch {
        // best-effort teardown
      }
    }
  }
}

await main();
