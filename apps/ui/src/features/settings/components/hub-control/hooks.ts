import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetcher } from '@/lib/query';

const HEALTH_POLL_INTERVAL = 500;
const HEALTH_TIMEOUT = 60_000;

export type ControlState = 'idle' | 'restarting' | 'confirmStop' | 'stopped';

function useRestartHub() {
  return useMutation({
    mutationFn: () => fetcher<{ ok: boolean }>('/api/system/restart', { method: 'POST' }),
  });
}

function useStopHub() {
  return useMutation({
    mutationFn: () => fetcher<{ ok: boolean }>('/api/system/stop', { method: 'POST' }),
  });
}

export function useHubControl() {
  const [state, setState] = useState<ControlState>('idle');
  const pollIntervalRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const healthTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const restartMutation = useRestartHub();
  const stopMutation = useStopHub();

  useEffect(() => {
    return () => {
      clearInterval(pollIntervalRef.current);
      clearTimeout(healthTimeoutRef.current);
    };
  }, []);

  const waitForHub = useCallback(() => {
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          const data = (await res.json()) as { ready?: boolean };
          if (data.ready) {
            clearInterval(pollIntervalRef.current);
            clearTimeout(healthTimeoutRef.current);
            globalThis.location.reload();
          }
        }
      } catch {
        // hub not yet up, keep polling
      }
    }, HEALTH_POLL_INTERVAL);

    healthTimeoutRef.current = setTimeout(() => {
      clearInterval(pollIntervalRef.current);
      setState('idle');
    }, HEALTH_TIMEOUT);
  }, []);

  const handleRestart = useCallback(() => {
    setState('restarting');
    restartMutation.mutate(undefined, {
      onSuccess: () => waitForHub(),
      onError: () => setState('idle'),
    });
  }, [restartMutation, waitForHub]);

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
