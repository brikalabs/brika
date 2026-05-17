/**
 * Pure formatting helpers for the `brika update` command, split out so
 * tests can assert the rendered lines without spawning the CLI.
 *
 * Returns plain strings — the command writes them with
 * `process.stdout.write`. ANSI escapes are baked in via `picocolors`, so
 * tests should strip them before asserting (see `update.helpers.test.ts`).
 */

import pc from 'picocolors';
import type { UpdateChannelId, UpdateInfoDto } from '../shared/cli/api/updates';

export const VALID_CHANNELS: ReadonlyArray<UpdateChannelId> = ['stable', 'canary'];

export function isChannel(value: string): value is UpdateChannelId {
  return (VALID_CHANNELS as ReadonlyArray<string>).includes(value);
}

export function formatStatus(info: UpdateInfoDto): string {
  const cur = pc.bold(`v${info.currentVersion}`);
  const lat = pc.bold(`v${info.latestVersion}`);
  const channel = pc.dim(`(${info.channel})`);
  let line: string;
  if (info.updateAvailable) {
    line = `${pc.green('update available')} ${cur} → ${lat} ${channel}`;
  } else if (info.devBuild) {
    line = `${pc.yellow('dev build')} ${cur} ${channel}`;
  } else {
    line = `${pc.green('up to date')} ${cur} ${channel}`;
  }
  return `${line}\n`;
}
