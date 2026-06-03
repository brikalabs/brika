import { useCallback, useEffect, useState } from 'react';
import {
  applyUpdate,
  fetchUpdateChannel,
  fetchUpdateInfo,
  setUpdateChannel,
  type UpdateChannelId,
  type UpdateInfoDto,
  type UpdateProgress,
} from '../../shared/cli/api/updates';
import { useCli } from '../../shared/hooks/useCli';
import { CHANNELS } from './utils';

export interface UseUpdates {
  readonly info: UpdateInfoDto | null;
  readonly channel: UpdateChannelId | null;
  readonly checking: boolean;
  readonly applying: boolean;
  readonly progress: UpdateProgress | null;
  readonly error: string | null;
  readonly check: () => void;
  readonly cycleChannel: () => void;
  readonly startApply: () => void;
}

export function useUpdates(): UseUpdates {
  const cli = useCli();
  const [info, setInfo] = useState<UpdateInfoDto | null>(null);
  const [channel, setChannel] = useState<UpdateChannelId | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [applying, setApplying] = useState(false);

  const connected = cli.hub.state === 'running';

  const runCheck = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      const [next, ch] = await Promise.all([fetchUpdateInfo(), fetchUpdateChannel()]);
      setInfo(next);
      setChannel(ch);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  }, []);

  // Initial load when the hub is reachable.
  useEffect(() => {
    if (!connected) {
      return;
    }
    runCheck().catch(() => undefined);
  }, [connected, runCheck]);

  const runCycleChannel = useCallback(async () => {
    if (channel === null) {
      return;
    }
    const idx = CHANNELS.indexOf(channel);
    const next = CHANNELS[(idx + 1) % CHANNELS.length] ?? CHANNELS[0];
    if (!next) {
      return;
    }
    setError(null);
    try {
      await setUpdateChannel(next);
      setChannel(next);
      // Re-check against the new channel so latestVersion reflects it.
      runCheck().catch(() => undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [channel, runCheck]);

  const runStartApply = useCallback(async () => {
    if (applying) {
      return;
    }
    setApplying(true);
    setProgress({ phase: 'checking', message: 'starting…' });
    setError(null);
    try {
      for await (const event of applyUpdate()) {
        setProgress(event);
        if (event.phase === 'error') {
          setError(event.error ?? event.message ?? 'update failed');
          break;
        }
        if (event.phase === 'restarting' || event.phase === 'complete') {
          break;
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  }, [applying]);

  const check = useCallback(() => {
    runCheck().catch(() => undefined);
  }, [runCheck]);

  const cycleChannel = useCallback(() => {
    runCycleChannel().catch(() => undefined);
  }, [runCycleChannel]);

  const startApply = useCallback(() => {
    runStartApply().catch(() => undefined);
  }, [runStartApply]);

  return {
    info,
    channel,
    checking,
    applying,
    progress,
    error,
    check,
    cycleChannel,
    startApply,
  };
}
