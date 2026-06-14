/**
 * Packed-tarball smoke test for the published @brika/sdk.
 *
 * Proves the BUNDLED @brika/sdk gives a plugin a working, self-contained
 * toolchain when the plugin depends on ONLY @brika/sdk. It reproduces the exact
 * npm publish artifact: build the dist bundle (private closure inlined) plus the
 * `brika` bin, apply the publish manifest transform (exports src -> dist, strip
 * the workspace-only `./internal/*` subpaths) reusing scripts/release-libs.ts so
 * the test can never drift from the real publish, pack JUST @brika/sdk (NO
 * closure tarballs -- they're inlined into dist/pkg), install it into a throwaway
 * fixture plugin, and run `brika build`/`verify`/`install` from the plugin's
 * node_modules.
 *
 * If the bundle leaked a private @brika/* import, or `files` failed to ship
 * dist/pkg or dist/bin, or the bin were not self-contained, the install or the
 * `brika build` here fails: exactly the regressions this guards.
 *
 * Run: `bun run smoke:bin` (also wired into CI).
 */

import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bundleExports, stripInternalExports } from '../../scripts/release-libs';

const sdkDir = import.meta.dir;
const manifestPath = join(sdkDir, 'package.json');

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

const sdkVersion: string = (await Bun.file(manifestPath).json()).version;

// 1. Build the publish artifacts: the dist bundle (private closure inlined) and
//    the self-contained `brika` bin.
console.log('• building dist bundle + bin');
if (
  (await run(['bun', 'run', 'build:dist'], sdkDir, { NODE_OPTIONS: '--max-old-space-size=8192' }))
    .code !== 0
) {
  fail('build:dist failed');
}
if ((await run(['bun', 'run', 'build:bin'], sdkDir)).code !== 0) {
  fail('build:bin failed');
}

const work = await mkdtemp(join(tmpdir(), 'brika-smoke-'));
try {
  const tarDir = join(work, 'tarballs');
  await mkdir(tarDir, { recursive: true });

  // 2. Pack @brika/sdk in PUBLISH form: repoint exports src -> dist (so consumers
  //    get the inlined bundle, not raw `.ts`) and strip the workspace-only
  //    `./internal/*` subpaths, exactly as scripts/release-libs.ts does at
  //    publish. NO closure tarballs: the closure is inlined into dist/pkg, so a
  //    plugin installs ONLY @brika/sdk.
  console.log('• packing @brika/sdk (publish form, closure inlined)');
  const original = await Bun.file(manifestPath).text();
  const stripped = stripInternalExports(original) ?? original;
  const publishText = bundleExports(stripped) ?? stripped;
  let sdkTarball: string;
  try {
    await Bun.write(manifestPath, publishText);
    sdkTarball = await pack(sdkDir, tarDir);
  } finally {
    await Bun.write(manifestPath, original);
  }

  // 3. A throwaway fixture plugin that depends on ONLY @brika/sdk. No `overrides`:
  //    the runtime closure is inlined into the bundle, so nothing else resolves
  //    from the registry, which is precisely what a published install looks like.
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
      },
      null,
      2
    )}\n`
  );

  // 4. Install the tarball (only @brika/sdk + its real external deps; the private
  //    closure and the SDK's devDependencies are NOT present).
  console.log('• installing the tarball');
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
