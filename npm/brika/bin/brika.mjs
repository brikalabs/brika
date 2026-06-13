#!/usr/bin/env node
/**
 * brika: npm launcher shim.
 *
 * The real `brika` is a Bun-compiled, self-contained binary shipped per platform
 * as an optionalDependency (`@brika/cli-<platform>-<arch>`). npm installs only the
 * package matching the host's os/cpu; this shim resolves that binary and execs it,
 * forwarding argv, stdio, and the exit code.
 *
 * `BRIKA_INSTALL=npm` is exported so the binary knows it was installed via npm:
 * it then stores data in the per-user dir (~/.brika or %LOCALAPPDATA%\brika)
 * instead of next to the binary in node_modules, and routes `brika update` to npm.
 */

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const pkg = `@brika/cli-${process.platform}-${process.arch}`;
const binName = process.platform === 'win32' ? 'brika.exe' : 'brika';

let binPath;
try {
  binPath = require.resolve(`${pkg}/bin/${binName}`);
} catch {
  process.stderr.write(
    `brika: no prebuilt binary for ${process.platform}-${process.arch}.\n` +
      `  Expected the optional dependency "${pkg}" to be installed.\n` +
      '  Supported targets: linux (x64, arm64), darwin (x64, arm64), win32 (x64).\n' +
      '  If your platform is supported, reinstall without --no-optional / --omit=optional.\n'
  );
  process.exit(1);
}

const result = spawnSync(binPath, process.argv.slice(2), {
  stdio: 'inherit',
  env: { ...process.env, BRIKA_INSTALL: 'npm' },
});

if (result.error) {
  process.stderr.write(`brika: failed to launch the binary: ${result.error.message}\n`);
  process.exit(1);
}

// Mirror the child's exit code; a signal-terminated child has a null status.
process.exit(result.status ?? 1);
