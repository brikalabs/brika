/**
 * `brika update`: check for a new release and apply it, in-process.
 *
 * Runs the updater directly in the CLI process (no running hub required).
 * The check hits GitHub; the apply is dispatched through the same
 * per-runtime strategy the hub uses (`resolveUpdateStrategy`), so a
 * container / system-package / dev install is refused with guidance
 * instead of clobbering a binary it doesn't own. The standalone apply
 * performs an in-place swap guarded by a cross-process `.update.lock` so
 * it can't race a hub-driven apply. The channel + pin are read from the
 * hub's `state.db` (read-only); the CLI never writes that DB, the hub
 * owns it.
 *
 * Behaviour:
 *   - default:      check, then prompt (`y/N`) before applying
 *   - `--check`:    check only, no prompt, no apply
 *   - `--yes`/`-y`: apply without prompting (CI/headless)
 *   - `--force`:    reinstall the current version
 *   - `--channel`:  override the channel for THIS run only (not persisted;
 *     change the saved channel from the hub UI / Settings > Updates)
 *
 * A running hub keeps serving the old binary (the swapped inode stays
 * mapped) until it restarts, so on success we nudge the user to restart it.
 */

import { defineCommand } from '@brika/cli';
import * as p from '@brika/cli/prompts';
import { brikaContext } from '@brika/hub/brika-context';
import { UpdateLock, UpdateLockHeldError } from '@brika/hub/update-lock';
import { readUpdatePrefs } from '@brika/hub/update-prefs';
import {
  resolveUpdateStrategy,
  type UpdateChannelId,
  UpdateRefusedError,
  type UpdateStrategy,
} from '@brika/hub/update-strategy';
import { checkForUpdate } from '@brika/hub/updater';
import pc from 'picocolors';
import { CliError } from '../shared/cli/errors';
import { checkPid } from '../shared/cli/pid';
import { formatStatus, isChannel, VALID_CHANNELS } from './update.helpers';

interface ApplyOptions {
  readonly force: boolean;
  readonly channel: UpdateChannelId;
  readonly pinnedVersion: string | null;
}

/**
 * Surface a refusing strategy's guidance as a clean CLI error. The
 * container / system-package / dev strategies reject `apply()` with an
 * {@link UpdateRefusedError} carrying actionable text; we never reach
 * the lock or the binary swap. Returns `never`: `canApply() === false`
 * guarantees `apply()` rejects.
 */
async function refuseUpdate(strategy: UpdateStrategy): Promise<never> {
  try {
    await strategy.apply({});
  } catch (err) {
    if (err instanceof UpdateRefusedError) {
      throw new CliError(err.guidance);
    }
    throw err;
  }
  throw new CliError('Update is not supported in this environment.');
}

/**
 * Acquire the cross-process update lock and apply via the (apply-capable)
 * strategy. Surfaces a friendly error instead of racing the binary swap
 * when a hub or another CLI invocation is mid-apply. Returns the new
 * version on success.
 */
async function applyInProcess(strategy: UpdateStrategy, opts: ApplyOptions): Promise<string> {
  const lock = new UpdateLock(brikaContext.brikaDir);
  try {
    lock.acquire();
  } catch (err) {
    if (err instanceof UpdateLockHeldError) {
      const heldBy = err.heldBy;
      throw new CliError(
        heldBy
          ? `Another update is in progress (pid ${heldBy.pid}, started ${heldBy.startedAt}). Stop the hub or wait for it to finish before retrying.`
          : 'Another update is in progress. Stop the hub or wait before retrying.'
      );
    }
    throw err;
  }

  const spinner = p.spinner();
  spinner.start('Applying update');
  try {
    const result = await strategy.apply({
      force: opts.force,
      channel: opts.channel,
      pinnedVersion: opts.pinnedVersion,
      onProgress(phase, detail) {
        spinner.message(`${phase}: ${detail}`);
      },
    });
    spinner.stop(pc.green(`Updated v${result.previousVersion} to v${result.newVersion}`));
    return result.newVersion;
  } catch (err) {
    spinner.error(err instanceof Error ? err.message : String(err));
    throw new CliError(err instanceof Error ? err.message : String(err));
  } finally {
    lock.release();
  }
}

/** Tell the user to restart a running hub so it picks up the new binary. */
async function nudgeRunningHub(newVersion: string): Promise<void> {
  const status = await checkPid();
  if (status.state !== 'running') {
    return;
  }
  process.stdout.write(
    `${pc.yellow('Note:')} the hub is still running the previous version. Restart it ` +
      `(${pc.cyan('brika stop')} then ${pc.cyan('brika start')}) to load v${newVersion}.\n`
  );
}

export default defineCommand({
  name: 'update',
  aliases: ['upgrade'],
  description: 'Check for a new Brika release and apply it',
  details:
    'Runs the updater locally (no running hub required). On a standalone install it ' +
    'performs an in-place binary swap guarded by a cross-process lock; container, ' +
    'system-package, and dev installs are refused with guidance. The saved update ' +
    'channel is read from the hub state (read-only); use --channel to override it for one run.',
  options: {
    check: {
      type: 'boolean',
      description: 'Check only: print availability and exit without prompting',
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
      description: 'Override the update channel for this run (stable, beta, canary, pinned)',
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
    const prefs = readUpdatePrefs();

    let channel: UpdateChannelId = prefs.channel;
    if (typeof values.channel === 'string') {
      if (!isChannel(values.channel)) {
        throw new CliError(
          `Unknown channel '${values.channel}', expected one of: ${VALID_CHANNELS.join(', ')}`
        );
      }
      channel = values.channel;
      process.stdout.write(`${pc.dim('channel:')} ${channel} ${pc.dim('(this run only)')}\n`);
    }

    // The check is a read-only network call and is safe in every runtime
    // mode, so it goes straight to the updater (which, unlike
    // `strategy.check`, honours a pinned version).
    const info = await checkForUpdate(channel, { pinnedVersion: prefs.pinnedVersion });
    process.stdout.write(formatStatus({ ...info, lastCheckedAt: null }));

    if (values.check) {
      return;
    }

    const force = values.force === true;
    if (!info.updateAvailable && !force) {
      process.stdout.write(
        `${pc.dim('Nothing to apply. Use')} ${pc.cyan('--force')} ${pc.dim('to reinstall the current version.')}\n`
      );
      return;
    }

    const strategy = resolveUpdateStrategy();
    // Refuse (with guidance) before prompting, so container/dev/system-
    // package installs get a clear message instead of a pointless y/N.
    if (!strategy.canApply()) {
      await refuseUpdate(strategy);
    }

    if (!values.yes) {
      const label = force ? `Reinstall v${info.currentVersion}?` : `Apply v${info.latestVersion}?`;
      await p.confirmOrAbort({ message: label, initialValue: !force });
    }

    const newVersion = await applyInProcess(strategy, {
      force,
      channel,
      pinnedVersion: prefs.pinnedVersion,
    });
    await nudgeRunningHub(newVersion);
  },
});
