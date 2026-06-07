/**
 * `brika dev` — one command from a plugin checkout to a running dashboard.
 *
 * Run from a plugin directory: it generates the manifest (`brika build`), makes
 * sure the hub is up (starting it detached if needed), then installs the plugin
 * as a local `file:` dependency so the hub loads it and hot-reloads on source
 * edits. Re-run after a manifest-affecting change (new block/brick/spark) to
 * regenerate and reinstall.
 */

import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { defineCommand } from '@brika/cli';
import pc from 'picocolors';
import { CliError } from '../shared/cli/errors';
import { hubFetch, hubUrl } from '../shared/cli/hub-client';
import { spawnHubDetached } from '../shared/cli/hub-spawn-detached';
import { waitForHub } from '../shared/cli/hub-ui';
import { checkPid } from '../shared/cli/pid';
import { runBuild } from './build';

/** Read the plugin's package name, or fail with guidance if this isn't a plugin dir. */
export async function readPluginName(dir: string): Promise<string> {
  let raw: string;
  try {
    raw = await readFile(join(dir, 'package.json'), 'utf8');
  } catch {
    throw new CliError(`no package.json in ${dir} — run \`brika dev\` from a plugin directory`);
  }
  const pkg: { name?: string } = JSON.parse(raw);
  if (!pkg.name) {
    throw new CliError('package.json has no "name"');
  }
  return pkg.name;
}

/** Ensure the hub is up: start it detached and wait for readiness when it isn't. */
async function ensureHub(): Promise<void> {
  if ((await checkPid()).state === 'running') {
    return;
  }
  process.stdout.write(`${pc.dim('  starting hub…')}\n`);
  await spawnHubDetached();
  if (!(await waitForHub())) {
    throw new CliError("hub didn't become ready in time");
  }
}

/** POST the local install and surface the registry's SSE progress, line by line. */
async function installLocal(name: string, dir: string): Promise<void> {
  const res = await hubFetch('/api/registry/install', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ package: name, version: `file:${dir}` }),
  });
  if (!res.ok || !res.body) {
    throw new CliError(`install request failed: ${res.status} ${await res.text()}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let failure: string | undefined;
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data:')) {
        continue;
      }
      const json = line.slice(5).trim();
      if (!json) {
        continue;
      }
      let progress: { phase?: string; message?: string; error?: string };
      try {
        progress = JSON.parse(json);
      } catch {
        continue;
      }
      if (progress.message) {
        process.stdout.write(`  ${pc.dim(progress.message)}\n`);
      }
      if (progress.phase === 'error') {
        failure = progress.error ?? progress.message ?? 'unknown error';
      }
    }
  }
  if (failure) {
    throw new CliError(`install failed: ${failure}`);
  }
}

export default defineCommand({
  name: 'dev',
  description: 'Build the current plugin, start the hub if needed, and install it for live dev',
  details:
    'Run from a plugin directory. Generates the manifest, ensures the hub is running, and ' +
    'installs the plugin as a local file: dependency so the hub loads it and hot-reloads on edits.',
  options: {
    dir: { type: 'string', description: 'Plugin directory (default: current directory)' },
  },
  examples: ['brika dev', 'brika dev --dir plugins/timer'],
  async handler({ values }) {
    const dir = resolve(values.dir ?? process.cwd());
    const name = await readPluginName(dir);

    process.stdout.write(pc.bold(`\n  Developing ${pc.cyan(name)}\n\n`));

    if (!(await runBuild(dir, false))) {
      process.exitCode = 1;
      return;
    }

    await ensureHub();
    await installLocal(name, dir);

    process.stdout.write(
      `\n  ${pc.green('✓')} ${pc.cyan(name)} installed — open ${pc.underline(hubUrl())}\n  ${pc.dim('Edit source to hot-reload; re-run `brika dev` after a manifest change.')}\n\n`
    );
  },
});
