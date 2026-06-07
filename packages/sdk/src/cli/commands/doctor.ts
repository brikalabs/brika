/**
 * `brika doctor` for the lean SDK bin: who am I (this plugin CLI), where is my
 * data dir, and which hub do I target. A leaner sibling of the full app's doctor
 * (no hub runtime here), built from the shared exec-context resolver so a plugin
 * developer can see why an install/dev would hit the wrong hub before the 401.
 */

import { defineCommand } from '@brika/cli';
import pc from 'picocolors';
import { isCompiledFrom, peekInstanceId, resolveDataDir } from '../../exec-context';
import { hubInstanceId, hubOrigin, pingHub } from '../hub';

export default defineCommand({
  name: 'doctor',
  description: 'Report this CLI: its data dir and the hub it targets',
  details:
    'Prints the resolved data dir (and which rule chose it), the target hub origin + liveness, ' +
    'and whether that hub matches your data dir (a mismatch is why install/dev would 401). ' +
    'Use --json for scripts.',
  options: {
    json: { type: 'boolean', description: 'Machine-readable JSON output' },
  },
  examples: ['brika doctor', 'brika doctor --json'],
  async handler({ values }) {
    const dataDir = resolveDataDir({
      env: process.env,
      isCompiled: isCompiledFrom(import.meta.path),
      execPath: process.execPath,
      cwd: process.cwd(),
    });
    const origin = hubOrigin();
    const reachable = await pingHub();
    const hubId = reachable ? await hubInstanceId() : null;
    const localId = peekInstanceId(dataDir.path);
    const identityMatches = hubId !== null && localId !== null ? hubId === localId : null;

    if (values.json) {
      process.stdout.write(
        `${JSON.stringify({
          distribution: 'lean-bin',
          execPath: process.execPath,
          dataDir: dataDir.path,
          dataDirSource: dataDir.source,
          instanceId: localId,
          hub: { origin, reachable, instanceId: hubId, identityMatches },
        })}\n`
      );
      return;
    }

    const row = (label: string, value: string) => `  ${pc.dim(label.padEnd(13))} ${value}\n`;
    let out = `\n${pc.bold('brika doctor')} ${pc.dim('(plugin CLI)')}\n\n`;
    out += row('distribution', 'lean-bin (@brika/sdk)');
    out += row('binary', process.execPath);
    const sourceTag = pc.dim(`(${dataDir.source})`);
    out += row('data dir', `${dataDir.path} ${sourceTag}`);
    out += row('instance', localId ?? pc.dim('(none yet)'));
    out += row(
      'hub',
      `${pc.underline(origin)} ${reachable ? pc.green('running') : pc.dim('not reachable')}`
    );
    if (reachable) {
      if (identityMatches === true) {
        out += row('hub instance', `${hubId} ${pc.green('✓ matches your data dir')}`);
      } else if (identityMatches === false) {
        out += row('hub instance', `${hubId} ${pc.red('✗ DIFFERENT hub than your data dir')}`);
        out += `\n  ${pc.yellow('warning')} install/dev against this hub will fail to authenticate (401).\n`;
        out += `  ${pc.dim('Set BRIKA_HOST / BRIKA_PORT and BRIKA_HOME to the hub you mean.')}\n`;
      } else {
        out += row('hub instance', pc.dim('(no local instance.id to compare)'));
      }
    }
    process.stdout.write(out);
  },
});
