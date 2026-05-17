#!/usr/bin/env bun
/**
 * Local docker-build helper.
 *
 * The production `Dockerfile` expects a prebuilt `brika` binary and
 * `ui/` bundle in its build context — the CI pipeline stages those
 * from the `binaries:` matrix artifacts. For local builds, this script
 * runs `bun run compile`, copies the resulting artifacts into a temp
 * directory alongside the Dockerfile, and invokes `docker build`.
 *
 *   bun run docker:build                       # single-arch (host), tag `brika:dev`
 *   bun run docker:build -- --tag brika:foo    # custom tag
 *   bun run docker:build -- --platform linux/amd64,linux/arm64  # multi-arch (slow, needs buildx + qemu)
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = Bun.argv.slice(2);
let tag = 'brika:dev';
let platform = '';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--tag') {
    tag = args[++i] ?? tag;
  } else if (args[i] === '--platform') {
    platform = args[++i] ?? '';
  }
}

const repo = process.cwd();

async function run(cmd: string[], cwd = repo): Promise<void> {
  const proc = Bun.spawn(cmd, { cwd, stdout: 'inherit', stderr: 'inherit' });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`${cmd.join(' ')} exited ${code}`);
  }
}

console.log('▸ compiling brika binary + UI bundle…');
await run(['bun', 'run', 'compile']);

const ctx = mkdtempSync(join(tmpdir(), 'brika-docker-ctx-'));
try {
  console.log(`▸ staging context at ${ctx}`);
  await run(['cp', join(repo, 'apps/console/dist/brika'), join(ctx, 'brika')]);
  await run(['cp', '-R', join(repo, 'apps/ui/dist'), join(ctx, 'ui')]);
  await run(['cp', join(repo, 'Dockerfile'), join(ctx, 'Dockerfile')]);

  const buildCmd = ['docker', 'build', '-t', tag];
  if (platform) {
    buildCmd.push('--platform', platform);
  }
  buildCmd.push(ctx);

  console.log(`▸ docker build → ${tag}${platform ? ` (${platform})` : ''}`);
  await run(buildCmd);
  console.log(`✓ image ready: ${tag}`);
} finally {
  rmSync(ctx, { recursive: true, force: true });
}
