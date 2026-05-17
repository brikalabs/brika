/** Self-update check / channel / apply — backs the Updates section. */

import { hubFetch } from '../hub-client';
import { streamSseEvents } from '../sse';

export type UpdateChannelId = 'stable' | 'canary';

export interface UpdateInfoDto {
  readonly currentVersion: string;
  readonly latestVersion: string;
  readonly updateAvailable: boolean;
  /** True when current version is ahead of the latest release (dev build). */
  readonly devBuild: boolean;
  /**
   * True when the local hub is on a pre-release tag and `channel` is
   * `stable` (so the channel reports a lower version). Surfaces a clearer
   * "switch back to canary" hint instead of treating it as a dev build.
   */
  readonly channelMismatch: boolean;
  readonly releaseUrl: string;
  readonly releaseNotes: string;
  readonly publishedAt: string;
  readonly releaseCommit: string;
  readonly currentCommit: string;
  readonly assetName: string | null;
  readonly assetSize: number | null;
  readonly channel: UpdateChannelId;
  /** ISO timestamp the hub last successfully checked. `null` when never. */
  readonly lastCheckedAt: string | null;
}

export async function fetchUpdateInfo(): Promise<UpdateInfoDto> {
  const res = await hubFetch('/api/system/update');
  if (!res.ok) {
    throw new Error(`update check failed: ${res.status}`);
  }
  return (await res.json()) as UpdateInfoDto;
}

export async function fetchUpdateChannel(): Promise<UpdateChannelId> {
  const res = await hubFetch('/api/settings/update-channel');
  if (!res.ok) {
    throw new Error(`channel fetch failed: ${res.status}`);
  }
  const body = (await res.json()) as { channel: UpdateChannelId };
  return body.channel;
}

export async function setUpdateChannel(channel: UpdateChannelId): Promise<void> {
  const res = await hubFetch('/api/settings/update-channel', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ channel }),
  });
  if (!res.ok) {
    throw new Error(`set channel failed: ${res.status} ${await res.text()}`);
  }
}

export interface UpdateProgress {
  readonly phase:
    | 'checking'
    | 'downloading'
    | 'verifying'
    | 'extracting'
    | 'installing'
    | 'restarting'
    | 'complete'
    | 'error';
  readonly message?: string;
  readonly error?: string;
}

/** Apply via `/api/system/update/apply`. Yields progress events until
 *  the server emits `phase: 'restarting'` / `complete` / `error`. */
export async function* applyUpdate(force?: boolean): AsyncGenerator<UpdateProgress> {
  const query = force ? '?force=true' : '';
  const res = await hubFetch(`/api/system/update/apply${query}`, { method: 'POST' });
  if (!res.ok) {
    throw new Error(`apply failed to start: ${res.status} ${await res.text()}`);
  }
  for await (const event of streamSseEvents<UpdateProgress>(res)) {
    yield event;
    if (event.phase === 'complete' || event.phase === 'error' || event.phase === 'restarting') {
      return;
    }
  }
}
