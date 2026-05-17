import type { UpdateChannelId, UpdateInfoDto } from '../../shared/cli/api/updates';

export const CHANNELS: ReadonlyArray<UpdateChannelId> = ['stable', 'canary'];

export function subtitleFor(info: UpdateInfoDto | null): string {
  if (!info) {
    return 'loading…';
  }
  if (info.devBuild) {
    return 'dev build · ahead of latest release';
  }
  if (info.updateAvailable) {
    return `v${info.latestVersion} is available`;
  }
  return 'up to date';
}

export function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) {
    return iso;
  }
  const diffMs = Date.now() - t;
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) {
    return `${sec}s ago`;
  }
  const min = Math.round(sec / 60);
  if (min < 60) {
    return `${min}m ago`;
  }
  const hr = Math.round(min / 60);
  if (hr < 24) {
    return `${hr}h ago`;
  }
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}
