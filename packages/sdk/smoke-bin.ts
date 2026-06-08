/**
 * Packed-tarball smoke test for the `brika` author CLI.
 *
 * Proves the published @brika/sdk gives a plugin a WORKING, self-contained
 * `brika` bin when the plugin depends on ONLY @brika/sdk. It packs the SDK
 * (plus its workspace runtime-dep closure, since those aren't on npm yet),
 * installs the tarballs into a throwaway fixture plugin (so the SDK's
 * devDependencies, @brika/compiler / @brika/cli / @brika/schema, are NOT
 * present), and runs `brika build`/`verify` from the plugin's node_modules.
 *
 * If the bin were not bundled (toolchain inlined) this fails with
 * "cannot find @brika/compiler", which is exactly the regression this guards:
 * a missing build step, `files` not shipping dist/bin, or a non-self-contained bin.
 *
 * Run: `bun run smoke:bin` (also wired into CI).
 */

import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const sdkDir = import.meta.dir;
const packagesDir = dirname(sdkDir);

function fail(message: string): never {
  console.error(`\n✗ smoke: ${message}\n`);
  process.exit(1);
}

/** Spawn a command, capture combined output, and return { code, output }. */
async function run(
  cmd: string[],
  cwd: string,
  env?: Record<string, string>
): Promise<{ code: number; output: string }> {
  const proc = Bun.spawn(cmd, {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, ...env },
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, output: `${stdout}${stderr}` };
}

type Manifest = { name: string; dependencies?: Record<string, string> };

/** Map every workspace package name to its directory. */
async function workspaceIndex(): Promise<Map<string, string>> {
  const index = new Map<string, string>();
  for (const entry of await readdir(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const dir = join(packagesDir, entry.name);
    const pkgPath = join(dir, 'package.json');
    if (!(await Bun.file(pkgPath).exists())) {
      continue;
    }
    const pkg: Manifest = await Bun.file(pkgPath).json();
    index.set(pkg.name, dir);
  }
  return index;
}

/**
 * Walk @brika/sdk's `workspace:` dependency closure. These siblings aren't on
 * npm, so the fixture must install them from local tarballs to mimic what the
 * registry will serve once @brika/sdk is published.
 */
async function workspaceDepClosure(
  start: string,
  index: Map<string, string>
): Promise<Set<string>> {
  const closure = new Set<string>();
  const queue = [start];
  while (queue.length > 0) {
    const name = queue.pop();
    if (!name) {
      continue;
    }
    const dir = index.get(name);
    if (!dir) {
      continue;
    }
    const pkg: Manifest = await Bun.file(join(dir, 'package.json')).json();
    for (const [dep, spec] of Object.entries(pkg.dependencies ?? {})) {
      if (spec.startsWith('workspace:') && index.has(dep) && !closure.has(dep)) {
        closure.add(dep);
        queue.push(dep);
      }
    }
  }
  return closure;
}

/** Pack a workspace package into `dest` and return its tarball path. */
async function pack(dir: string, dest: string): Promise<string> {
  const before = new Set(await readdir(dest));
  const result = await run(['bun', 'pm', 'pack', '--destination', dest], dir);
  if (result.code !== 0) {
    fail(`pack failed for ${dir}:\n${result.output}`);
  }
  const produced = (await readdir(dest)).find((f) => f.endsWith('.tgz') && !before.has(f));
  if (!produced) {
    fail(`no .tgz produced by pack for ${dir}`);
  }
  return join(dest, produced);
}

const sdkVersion: string = (await Bun.file(join(sdkDir, 'package.json')).json()).version;

// 1. Build the bin so the tarball ships a fresh dist/bin/brika.js.
console.log('• building bin');
if ((await run(['bun', 'run', 'build:bin'], sdkDir)).code !== 0) {
  fail('build:bin failed');
}

const work = await mkdtemp(join(tmpdir(), 'brika-smoke-'));
try {
  const tarDir = join(work, 'tarballs');
  await mkdir(tarDir, { recursive: true });

  // 2. Pack @brika/sdk plus its workspace runtime-dep closure.
  console.log('• packing @brika/sdk and its workspace deps');
  const index = await workspaceIndex();
  const sdkTarball = await pack(sdkDir, tarDir);
  const overrides: Record<string, string> = {};
  for (const dep of await workspaceDepClosure('@brika/sdk', index)) {
    const depDir = index.get(dep);
    if (!depDir) {
      fail(`workspace dep ${dep} has no directory`);
    }
    overrides[dep] = `file:${await pack(depDir, tarDir)}`;
  }

  // 3. A throwaway fixture plugin that depends on ONLY @brika/sdk. The closure
  //    deps go through `overrides` so they resolve to the packed tarballs the
  //    way the registry would once they're published alongside @brika/sdk.
  console.log('• scaffolding fixture plugin');
  const pluginDir = join(work, 'plugin');
  await mkdir(join(pluginDir, 'src'), { recursive: true });
  await writeFile(join(pluginDir, 'src', 'index.ts'), 'export {};\n');
  await writeFile(join(pluginDir, 'icon.svg'), '<svg></svg>\n');
  await writeFile(
    join(pluginDir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'brika-plugin-smoke',
        version: '1.0.0',
        type: 'module',
        main: './src/index.ts',
        engines: { brika: `^${sdkVersion}` },
        $schema: 'https://schema.brika.dev/plugin.schema.json',
        keywords: ['brika', 'brika-plugin'],
        icon: './icon.svg',
        files: ['src', 'icon.svg'],
        dependencies: { '@brika/sdk': `file:${sdkTarball}` },
        overrides,
      },
      null,
      2
    )}\n`
  );

  // 4. Install the tarballs (the SDK's devDependencies are NOT installed).
  console.log('• installing the tarballs');
  const install = await run(['bun', 'install'], pluginDir);
  if (install.code !== 0) {
    fail(`install failed:\n${install.output}`);
  }

  // 5. The bin must resolve and run the gate verbs self-contained.
  console.log('• running brika build --check (exercises the bundled compiler)');
  const build = await run(['bun', 'node_modules/.bin/brika', 'build', '--check'], pluginDir);
  if (build.code !== 0) {
    fail(`brika build --check failed (bin not self-contained?):\n${build.output}`);
  }

  console.log('• running brika verify');
  const verify = await run(['bun', 'node_modules/.bin/brika', 'verify'], pluginDir);
  if (verify.code !== 0 || !verify.output.includes('Verification passed')) {
    fail(`brika verify failed:\n${verify.output}`);
  }

  // 6. The hub-driving verbs are bundled too. Point at an unused port so no hub
  //    is reachable: `install` must exercise the bundled loopback client and
  //    fall back with the clear message (not crash on a missing dependency).
  console.log('• running brika install with no hub (exercises the bundled hub client)');
  const noHub = await run(['bun', 'node_modules/.bin/brika', 'install', '.'], pluginDir, {
    BRIKA_HOST: '127.0.0.1',
    BRIKA_PORT: '59999',
  });
  if (noHub.code !== 1 || !noHub.output.includes('needs a running Brika hub')) {
    fail(`brika install no-hub fallback misbehaved:\n${noHub.output}`);
  }

  console.log('\n✓ smoke: packed @brika/sdk ships a working, self-contained `brika` bin\n');
} finally {
  await rm(work, { recursive: true, force: true });
}
