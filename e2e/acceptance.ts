#!/usr/bin/env bun
/**
 * npm publish/install acceptance e2e.
 *
 * Publishes the shipped Brika surface to a throwaway verdaccio registry exactly
 * as a real release would (`bun publish` rewrites `workspace:*` to concrete
 * ranges), then installs it into a clean consumer straight from that registry
 * and imports the SDK. This is the high-fidelity counterpart to the in-process
 * closure-install test: it exercises the real publish -> registry -> install
 * round-trip, so a misdeclared dependency, an unrewritten `workspace:*` range, or
 * a broken tarball fails here the way it would for an end user.
 *
 * Prereq: verdaccio reachable at $VERDACCIO_REGISTRY (default http://localhost:4873).
 * The gated `e2e-acceptance` workflow brings it up via e2e/docker-compose.yml.
 *
 *   docker compose -f e2e/docker-compose.yml up -d
 *   bun run e2e/acceptance.ts
 *   docker compose -f e2e/docker-compose.yml down -v
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';

const REGISTRY = (process.env.VERDACCIO_REGISTRY ?? 'http://localhost:4873').replace(/\/+$/, '');
const REGISTRY_HOST = REGISTRY.replace(/^https?:/, ''); // //localhost:4873
const REPO_ROOT = resolve(import.meta.dir, '..');

/** Publish order: closure leaves -> mid libs -> sdk -> scaffold -> sample plugins. */
const PUBLISH_ORDER = [
  'packages/errors',
  'packages/grants',
  'packages/ipc',
  'packages/serializable',
  'packages/flow',
  'packages/ui-kit',
  'packages/sdk',
  'packages/create-brika',
  'plugins/timer',
  'plugins/weather',
];

const CLOSURE = ['errors', 'flow', 'grants', 'ipc', 'serializable', 'ui-kit'];
const REACT_FREE_SUBPATHS = ['@brika/sdk/ctx', '@brika/sdk/sparks', '@brika/sdk/schema', '@brika/sdk/grants'];

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

async function waitForRegistry(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${REGISTRY}/-/ping`);
      if (res.ok) {
        return;
      }
    } catch {
      // not up yet
    }
    await Bun.sleep(1000);
  }
  throw new Error(`verdaccio not reachable at ${REGISTRY} within ${timeoutMs}ms`);
}

const tokenSchema = z.object({ token: z.string().min(1) }).loose();

/** Register a throwaway user and return its publish token. */
async function createToken(): Promise<string> {
  const user = 'brika-e2e';
  const res = await fetch(`${REGISTRY}/-/user/org.couchdb.user:${user}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: user, password: 'brika-e2e', email: 'e2e@brika.dev' }),
  });
  if (!res.ok && res.status !== 409) {
    throw new Error(`could not create verdaccio user: ${res.status} ${await res.text()}`);
  }
  return tokenSchema.parse(await res.json()).token;
}

async function main(): Promise<void> {
  console.log(`[e2e] verdaccio: ${REGISTRY}`);
  await waitForRegistry(60_000);
  const token = await createToken();

  const home = await mkdtemp(join(tmpdir(), 'brika-e2e-home-'));
  await Bun.write(
    join(home, '.npmrc'),
    `${REGISTRY_HOST}/:_authToken=${token}\n@brika:registry=${REGISTRY}/\nregistry=${REGISTRY}/\n`
  );
  const publishEnv = { HOME: home };

  // Build the artifact producers explicitly; publish with --ignore-scripts so the
  // prebuilt dist (sdk bin, create-brika) ships without re-running lifecycle hooks.
  console.log('[e2e] building artifact producers');
  run(['bun', 'run', '--filter', '@brika/sdk', 'build:bin']);
  run(['bun', 'run', '--filter', 'create-brika', 'build']);

  console.log('[e2e] publishing to verdaccio (bun publish rewrites workspace:*)');
  for (const relDir of PUBLISH_ORDER) {
    run(['bun', 'publish', '--registry', `${REGISTRY}/`, '--tolerate-republish', '--ignore-scripts'], {
      cwd: join(REPO_ROOT, relDir),
      env: publishEnv,
    });
  }

  // Clean consumer: install straight from verdaccio, no workspace, no overrides.
  const consumer = await mkdtemp(join(tmpdir(), 'brika-e2e-consumer-'));
  await Bun.write(join(consumer, '.npmrc'), `@brika:registry=${REGISTRY}/\nregistry=${REGISTRY}/\n`);
  await Bun.write(
    join(consumer, 'package.json'),
    `${JSON.stringify({ name: 'brika-e2e-consumer', version: '0.0.0', private: true }, null, 2)}\n`
  );

  console.log('[e2e] installing @brika/sdk + plugins from verdaccio (bun add)');
  run(['bun', 'add', '@brika/sdk', '@brika/plugin-timer', '@brika/plugin-weather'], {
    cwd: consumer,
  });

  // Assert the SDK closure + the plugins resolved from the registry.
  const { existsSync } = await import('node:fs');
  const missing = ['sdk', ...CLOSURE, 'plugin-timer', 'plugin-weather'].filter(
    (n) => !existsSync(join(consumer, 'node_modules', '@brika', n))
  );
  if (missing.length > 0) {
    throw new Error(`[e2e] FAIL: not installed from registry: ${missing.join(', ')}`);
  }

  console.log('[e2e] importing react-free SDK subpaths from the installed package');
  const script = `${REACT_FREE_SUBPATHS.map((s) => `await import(${JSON.stringify(s)});`).join(' ')} console.log('IMPORT-OK');`;
  const imported = Bun.spawnSync(['bun', '-e', script], { cwd: consumer, stdout: 'pipe', stderr: 'pipe' });
  const stderr = imported.stderr.toString();
  if (imported.exitCode !== 0 || !imported.stdout.toString().includes('IMPORT-OK')) {
    throw new Error(`[e2e] FAIL: SDK import failed:\n${stderr}`);
  }

  await rm(home, { recursive: true, force: true });
  await rm(consumer, { recursive: true, force: true });
  console.log('[e2e] PASS: publish -> registry -> install -> import round-trip succeeded.');
}

await main();
