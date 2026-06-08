/**
 * `brika doctor`: who am I, where is my data, and which hub am I targeting.
 *
 * Answers the questions that get confusing with more than one Brika around (a
 * mortar dev hub vs an installed one): the execution mode (dev vs compiled vs
 * system-package), the resolved data dir AND which rule chose it, the target
 * hub origin + liveness, and whether that hub's identity matches the local data
 * dir, so a data-dir/hub mismatch is reported BEFORE it turns into a 401.
 */

import { defineCommand } from '@brika/cli';
import { detectRuntimeMode } from '@brika/hub/runtime-mode';
import { isCompiledFrom, peekInstanceId, resolveDataDir } from '@brika/sdk/exec-context';
import pc from 'picocolors';
import { z } from 'zod';
import { hubUrl } from '../shared/cli/hub-client';
import { pingHub } from '../shared/cli/pid';

const HealthSchema = z.object({ instanceId: z.string().optional() });

/** Read the live hub's advertised instanceId from /api/health, or null. */
async function fetchHubInstanceId(origin: string): Promise<string | null> {
  try {
    const res = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(1000) });
    if (!res.ok) {
      return null;
    }
    const parsed = HealthSchema.safeParse(await res.json());
    return parsed.success ? (parsed.data.instanceId ?? null) : null;
  } catch {
    return null;
  }
}

export default defineCommand({
  name: 'doctor',
  description: 'Report execution mode, data dir, and the hub this CLI targets',
  details:
    'Prints who/where/which-hub: distribution, dev-vs-compiled, runtime mode, the resolved ' +
    'data dir and the rule that chose it, and the target hub origin + liveness + identity. ' +
    'Flags a data-dir/hub mismatch (the cause of a 401) up front. Use --json for scripts.',
  options: {
    json: { type: 'boolean', description: 'Machine-readable JSON output' },
  },
  examples: ['brika doctor', 'brika doctor --json'],
  async handler({ values }) {
    const compiled = isCompiledFrom(import.meta.path);
    const dataDir = resolveDataDir({
      env: process.env,
      isCompiled: compiled,
      execPath: process.execPath,
      cwd: process.cwd(),
    });
    const runtimeMode = detectRuntimeMode();
    const canSelfUpdate = runtimeMode === 'standalone' || runtimeMode === 'supervised';
    const origin = hubUrl();
    const reachable = await pingHub();
    const hubInstanceId = reachable ? await fetchHubInstanceId(origin) : null;
    const localInstanceId = peekInstanceId(dataDir.path);
    const identityMatches =
      hubInstanceId !== null && localInstanceId !== null ? hubInstanceId === localInstanceId : null;

    if (values.json) {
      process.stdout.write(
        `${JSON.stringify({
          distribution: 'full-app',
          compiled,
          runtimeMode,
          canSelfUpdate,
          execPath: process.execPath,
          dataDir: dataDir.path,
          dataDirSource: dataDir.source,
          instanceId: localInstanceId,
          hub: { origin, reachable, instanceId: hubInstanceId, identityMatches },
        })}\n`
      );
      return;
    }

    const row = (label: string, value: string) => `  ${pc.dim(label.padEnd(13))} ${value}\n`;
    let out = `\n${pc.bold('brika doctor')}\n\n`;
    out += row('distribution', 'full-app');
    out += row('mode', `${runtimeMode}${compiled ? ' (compiled)' : ' (source)'}`);
    out += row('self-update', canSelfUpdate ? pc.green('yes') : pc.dim('no'));
    out += row('binary', process.execPath);
    const sourceTag = pc.dim(`(${dataDir.source})`);
    out += row('data dir', `${dataDir.path} ${sourceTag}`);
    out += row('instance', localInstanceId ?? pc.dim('(none yet)'));
    out += row(
      'hub',
      `${pc.underline(origin)} ${reachable ? pc.green('running') : pc.dim('not reachable')}`
    );
    if (reachable) {
      if (identityMatches === true) {
        out += row('hub instance', `${hubInstanceId} ${pc.green('✓ matches your data dir')}`);
      } else if (identityMatches === false) {
        out += row(
          'hub instance',
          `${hubInstanceId} ${pc.red('✗ DIFFERENT hub than your data dir')}`
        );
        out += `\n  ${pc.yellow('warning')} install/dev against this hub will fail to authenticate (401).\n`;
        out += `  ${pc.dim('Set BRIKA_HOST / BRIKA_PORT and BRIKA_HOME to the hub you mean.')}\n`;
      } else {
        out += row('hub instance', pc.dim('(no local instance.id to compare)'));
      }
    }
    process.stdout.write(out);
  },
});
