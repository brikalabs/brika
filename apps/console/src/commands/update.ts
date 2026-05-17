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
 * When the hub reports `runtime: 'docker'`, the in-place updater is
 * disabled — we print the `docker pull` guidance and exit cleanly.
 *
 * Requires a running hub (we never spawn one inline here).
 */

import { defineCommand } from '@brika/cli';
import * as p from '@brika/cli/prompts';
import pc from 'picocolors';
import {
  applyUpdate,
  fetchUpdateInfo,
  setUpdateChannel,
  type UpdateChannelId,
  type UpdateInfoDto,
} from '../shared/cli/api/updates';
import { CliError } from '../shared/cli/errors';
import { requireRunningHub } from '../shared/cli/hub-client';

const VALID_CHANNELS: ReadonlyArray<UpdateChannelId> = ['stable', 'canary'];

function isChannel(value: string): value is UpdateChannelId {
  return (VALID_CHANNELS as ReadonlyArray<string>).includes(value);
}

function printStatus(info: UpdateInfoDto): void {
  const cur = pc.bold(`v${info.currentVersion}`);
  const lat = pc.bold(`v${info.latestVersion}`);
  const channel = pc.dim(`(${info.channel})`);
  if (info.runtime === 'docker') {
    process.stdout.write(`${pc.cyan('runtime')} docker ${pc.dim('(in-place update disabled)')}\n`);
  }
  if (info.updateAvailable) {
    process.stdout.write(`${pc.green('update available')} ${cur} → ${lat} ${channel}\n`);
  } else if (info.devBuild) {
    process.stdout.write(`${pc.yellow('dev build')} ${cur} ${channel}\n`);
  } else {
    process.stdout.write(`${pc.green('up to date')} ${cur} ${channel}\n`);
  }
}

function printDockerGuidance(info: UpdateInfoDto): void {
  process.stdout.write('\n');
  process.stdout.write(`${pc.cyan('To upgrade this container:')}\n`);
  process.stdout.write(`  ${pc.dim('$')} docker pull ghcr.io/brikalabs/brika:latest\n`);
  process.stdout.write(
    `  ${pc.dim('$')} docker compose up -d ${pc.dim('# or: docker restart <container>')}\n`
  );
  if (info.releaseUrl) {
    process.stdout.write(`\n${pc.dim('Release notes:')} ${info.releaseUrl}\n`);
  }
}

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
    'Inside Docker the in-place update is disabled — the command prints the `docker pull` flow instead.',
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
    printStatus(info);

    if (values.check) {
      return;
    }

    if (info.runtime === 'docker') {
      printDockerGuidance(info);
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
