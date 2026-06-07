/**
 * Shared hub-install helpers for `brika dev` and `brika install`: ensure the hub
 * is up, and drive the registry's install endpoint, streaming its SSE progress.
 */

import pc from 'picocolors';
import { CliError } from './errors';
import { hubFetch } from './hub-client';
import { spawnHubDetached } from './hub-spawn-detached';
import { waitForHub } from './hub-ui';
import { checkPid } from './pid';

/** Ensure the hub is up: start it detached and wait for readiness when it isn't. */
export async function ensureHub(): Promise<void> {
  if ((await checkPid()).state === 'running') {
    return;
  }
  process.stdout.write(`${pc.dim('  starting hub…')}\n`);
  await spawnHubDetached();
  if (!(await waitForHub())) {
    throw new CliError("hub didn't become ready in time");
  }
}

/** One registry SSE `data:` line → its progress object, or null to skip. */
function parseProgressLine(
  line: string
): { phase?: string; message?: string; error?: string } | null {
  if (!line.startsWith('data:')) {
    return null;
  }
  const json = line.slice(5).trim();
  if (!json) {
    return null;
  }
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Read the registry SSE stream, echo progress, and return the failure (if any). */
async function drainInstallStream(body: ReadableStream<Uint8Array>): Promise<string | undefined> {
  const reader = body.getReader();
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
      const progress = parseProgressLine(line);
      if (!progress) {
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
  return failure;
}

/** POST a registry install and surface its SSE progress, line by line. */
export async function installViaRegistry(pkg: string, version?: string): Promise<void> {
  const res = await hubFetch('/api/registry/install', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(version ? { package: pkg, version } : { package: pkg }),
  });
  if (!res.ok || !res.body) {
    throw new CliError(`install request failed: ${res.status} ${await res.text()}`);
  }

  const failure = await drainInstallStream(res.body);
  if (failure) {
    throw new CliError(`install failed: ${failure}`);
  }
}
