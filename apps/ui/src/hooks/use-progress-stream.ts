import { useCallback, useEffect, useRef, useState } from 'react';
import type { OperationProgress } from '@/features/plugins/registry-api';

type ProgressPhase = OperationProgress['phase'];

interface UseProgressStreamOptions {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

interface UseProgressStreamReturn {
  isProcessing: boolean;
  progress: OperationProgress | null;
  logs: string[];
  error: string | null;
  success: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  reset: () => void;
  handleProgress: (p: OperationProgress) => void;
  start: () => void;
  stop: (error?: string) => void;
  complete: () => void;
}

export function useProgressStream(options: UseProgressStreamOptions = {}): UseProgressStreamReturn {
  const { onSuccess, onError } = options;

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<OperationProgress | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll logs
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [
    logs,
  ]);

  const reset = useCallback(() => {
    setIsProcessing(false);
    setProgress(null);
    setLogs([]);
    setError(null);
    setSuccess(false);
  }, []);

  const start = useCallback(() => {
    setIsProcessing(true);
    setError(null);
    setSuccess(false);
    setLogs([]);
  }, []);

  const stop = useCallback(
    (errorMessage?: string) => {
      setIsProcessing(false);
      if (errorMessage) {
        setError(errorMessage);
        onError?.(errorMessage);
      }
    },
    [
      onError,
    ]
  );

  const complete = useCallback(() => {
    setIsProcessing(false);
    setSuccess(true);
    onSuccess?.();
  }, [
    onSuccess,
  ]);

  const handleProgress = useCallback(
    (p: OperationProgress) => {
      setProgress(p);
      if (p.message) {
        setLogs((prev) => [
          ...prev,
          p.message,
        ]);
      }

      if (p.phase === 'error') {
        stop(p.error || 'Operation failed');
      } else if (p.phase === 'complete') {
        complete();
      }
    },
    [
      stop,
      complete,
    ]
  );

  return {
    isProcessing,
    progress,
    logs,
    error,
    success,
    scrollRef,
    reset,
    handleProgress,
    start,
    stop,
    complete,
  };
}

const PROGRESS_VALUES: Record<ProgressPhase, number> = {
  resolving: 20,
  downloading: 50,
  linking: 80,
  complete: 100,
  error: 0,
};

export function getProgressValue(phase: ProgressPhase | undefined): number {
  if (!phase) {
    return 0;
  }
  return PROGRESS_VALUES[phase] ?? 0;
}
