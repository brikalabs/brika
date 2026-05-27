import { useMutation } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useWaitForHub } from '@/hooks/use-wait-for-hub';
import { fetcher } from '@/lib/query';

export type ControlState = 'idle' | 'restarting' | 'confirmStop' | 'stopped';

function useRestartHub() {
  return useMutation({
    mutationFn: () =>
      fetcher<{
        ok: boolean;
      }>('/api/system/restart', {
        method: 'POST',
      }),
  });
}

function useStopHub() {
  return useMutation({
    mutationFn: () =>
      fetcher<{
        ok: boolean;
      }>('/api/system/stop', {
        method: 'POST',
      }),
  });
}

export function useHubControl() {
  const [state, setState] = useState<ControlState>('idle');
  // Same callback on both paths: the user wants the "restarting…"
  // indicator to clear when the hub is back, whether the poll
  // succeeded or hit its 60s timeout. Without an explicit
  // `onReconnect` the poller would invalidate queries silently and
  // the indicator would hang until the timeout fired.
  const hubPoller = useWaitForHub(() => setState('idle'), { onReconnect: () => setState('idle') });

  const restartMutation = useRestartHub();
  const stopMutation = useStopHub();

  const handleRestart = useCallback(() => {
    setState('restarting');
    restartMutation.mutate(undefined, {
      onSuccess: () => hubPoller.start(),
      onError: () => setState('idle'),
    });
  }, [restartMutation, hubPoller]);

  const handleStop = useCallback(() => {
    stopMutation.mutate(undefined, {
      onSuccess: () => setState('stopped'),
      onError: () => setState('idle'),
    });
  }, [stopMutation]);

  return {
    state,
    setState,
    busy: restartMutation.isPending || stopMutation.isPending,
    handleRestart,
    handleStop,
  };
}
