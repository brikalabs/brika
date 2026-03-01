import { useEffect, useState } from 'react';
import type { DurationInput } from '@/lib/use-locale';
import { useLocale } from '@/lib/use-locale';

type StartedAtInput = string | number | Date | null | undefined;

/**
 * Normalize any supported input to a millisecond timestamp, or null.
 */
function toTimestamp(value: StartedAtInput): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'number') {
    return value;
  }
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Build a duration object with only the two largest non-zero units for readability.
 */
function toDuration(totalSeconds: number): DurationInput {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return {
      days,
      hours,
    };
  }
  if (hours > 0) {
    return {
      hours,
      minutes,
    };
  }
  if (minutes > 0) {
    return {
      minutes,
      seconds,
    };
  }
  return {
    seconds,
  };
}

/**
 * Hook that returns a live uptime string that updates every second.
 */
export function useUptime(startedAt: StartedAtInput): string | null {
  const { formatDuration } = useLocale();
  const ts = toTimestamp(startedAt);

  const [uptime, setUptime] = useState<string | null>(() => {
    if (ts === null) {
      return null;
    }
    return formatDuration(toDuration(Math.floor((Date.now() - ts) / 1000)), {
      style: 'narrow',
    });
  });

  useEffect(() => {
    if (ts === null) {
      setUptime(null);
      return;
    }

    const update = () =>
      setUptime(
        formatDuration(toDuration(Math.floor((Date.now() - ts) / 1000)), {
          style: 'narrow',
        })
      );

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [ts, formatDuration]);

  return uptime;
}

interface UptimeProps {
  startedAt: StartedAtInput;
  className?: string;
}

/**
 * Component that displays a live uptime that updates every second.
 */
export function Uptime({ startedAt, className }: Readonly<UptimeProps>) {
  const uptime = useUptime(startedAt);

  if (!uptime) {
    return <span className={className}>-</span>;
  }

  return <span className={className}>{uptime}</span>;
}
