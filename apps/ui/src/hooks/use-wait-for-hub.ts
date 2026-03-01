import { useCallback, useEffect, useRef } from 'react';

const POLL_INTERVAL = 500;
const POLL_TIMEOUT = 60_000;

export function useWaitForHub(onTimeout?: () => void) {
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => {
      clearInterval(pollRef.current);
      clearTimeout(timeoutRef.current);
    };
  }, []);

  const start = useCallback(() => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          const data = (await res.json()) as {
            ready?: boolean;
          };
          if (data.ready) {
            clearInterval(pollRef.current);
            clearTimeout(timeoutRef.current);
            globalThis.location.reload();
          }
        }
      } catch {
        // hub not yet up, keep polling
      }
    }, POLL_INTERVAL);

    timeoutRef.current = setTimeout(() => {
      clearInterval(pollRef.current);
      onTimeout?.();
    }, POLL_TIMEOUT);
  }, [onTimeout]);

  const stop = useCallback(() => {
    clearInterval(pollRef.current);
    clearTimeout(timeoutRef.current);
  }, []);

  return {
    start,
    stop,
  };
}
