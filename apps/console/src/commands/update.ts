/**
 * `brika update` — check for a new release and apply it.
 *
 * Talks to the running hub's `/api/system/update` endpoint so the
 * same updater path that the web UI drives runs from the terminal —
 * no second copy of the check/apply logic.
 *
 * Behaviour:
 *   - default: check, then prompt (`y/N`) before applying
 *   - `--check`:   check only, no prompt, no apply
 *   - `--yes`/`-y`: apply without prompting (CI/headless)
 *   - `--force`:   reinstall the current version
 *   - `--channel`: persist the channel before checking (mirrors the
 *     stable/canary switch in Settings → System → Updates)
 *
 * Requires a running hub (we never spawn one inline here).
 */

import { defineCommand } from '@brika/cli';
import * as p from '@brika/cli/prompts';
import pc from 'picocolors';
import { applyUpdate, fetchUpdateInfo, setUpdateChannel } from '../shared/cli/api/updates';
import { CliError } from '../shared/cli/errors';
import { requireRunningHub } from '../shared/cli/hub-client';
import { formatStatus, isChannel, VALID_CHANNELS } from './update.helpers';

async function streamApply(force: boolean): Promise<void> {
  const spinner = p.spinner();
  spinner.start('Applying update');
  let lastPhase = '';
  try {
    for await (const event of applyUpdate(force)) {
      if (event.phase !== lastPhase) {
        lastPhase = event.phase;
        spinner.message(event.message ?? event.phase);
      }
      if (event.phase === 'error') {
        spinner.error(event.error ?? event.message ?? 'Update failed');
        throw new CliError('Update failed');
      }
      if (event.phase === 'restarting' || event.phase === 'complete') {
        spinner.stop(pc.green('Update applied — hub is restarting'));
        return;
      }
    }
    // Stream ended without a terminal phase — treat as success but warn
    spinner.stop(pc.yellow('Update stream closed before completion'));
  } catch (err) {
    if (err instanceof CliError) {
      throw err;
    }
    spinner.error(err instanceof Error ? err.message : String(err));
    throw new CliError(err instanceof Error ? err.message : String(err));
  }
}

export default defineCommand({
  name: 'update',
  aliases: ['upgrade'],
  description: 'Check for a new Brika release and apply it',
  details:
    'Connects to the running hub and uses the same updater path as the web UI. ' +
    'The hub performs an in-place binary swap and restarts itself when the apply completes.',
  options: {
    check: {
      type: 'boolean',
      description: 'Check only — print availability and exit without prompting',
    },
    yes: {
      type: 'boolean',
      short: 'y',
      description: 'Skip the confirmation prompt and apply immediately if an update is available',
    },
    force: {
      type: 'boolean',
      description: 'Reinstall the current version even when already up to date',
    },
    channel: {
      type: 'string',
      description: 'Switch update channel before checking (stable or canary)',
    },
  },
  examples: [
    'brika update',
    'brika update --check',
    'brika update --yes',
    'brika update --channel canary',
    'brika update --force',
  ],
  async handler({ values }) {
    await requireRunningHub();

    if (typeof values.channel === 'string') {
      if (!isChannel(values.channel)) {
        throw new CliError(
          `Unknown channel '${values.channel}' — expected one of: ${VALID_CHANNELS.join(', ')}`
        );
      }
      await setUpdateChannel(values.channel);
      process.stdout.write(`${pc.dim('channel:')} ${values.channel}\n`);
    }

    const info = await fetchUpdateInfo();
    process.stdout.write(formatStatus(info));

    if (values.check) {
      return;
    }

    const force = values.force === true;
    if (!info.updateAvailable && !force) {
      process.stdout.write(
        `${pc.dim('Nothing to apply — use')} ${pc.cyan('--force')} ${pc.dim('to reinstall the current version.')}\n`
      );
      return;
    }

    if (!values.yes) {
      const label = force ? `Reinstall v${info.currentVersion}?` : `Apply v${info.latestVersion}?`;
      await p.confirmOrAbort({ message: label, initialValue: !force });
    }

    await streamApply(force);
  },
});
