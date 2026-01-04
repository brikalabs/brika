import { useEffect, useState } from 'react';

// @ts-expect-error Intl.DurationFormat not yet in TypeScript lib
const durationFormat = new Intl.DurationFormat(undefined, {
  style: 'narrow',
});

/**
 * Format seconds into a human-readable uptime string using Intl.DurationFormat
 */
function formatUptime(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  // Build duration object with only non-zero largest units for readability
  if (days > 0) {
    return durationFormat.format({ days, hours });
  }
  if (hours > 0) {
    return durationFormat.format({ hours, minutes });
  }
  if (minutes > 0) {
    return durationFormat.format({ minutes, seconds });
  }
  return durationFormat.format({ seconds });
}

/**
 * Hook that returns a live uptime string that updates every second
 */
export function useUptime(startedAt: number | null): string | null {
  const [uptime, setUptime] = useState<string | null>(() => {
    if (!startedAt) return null;
    return formatUptime(Math.floor((Date.now() - startedAt) / 1000));
  });

  useEffect(() => {
    if (!startedAt) {
      setUptime(null);
      return;
    }

    // Update immediately
    setUptime(formatUptime(Math.floor((Date.now() - startedAt) / 1000)));

    // Then update every second
    const interval = setInterval(() => {
      setUptime(formatUptime(Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);

    return () => clearInterval(interval);
  }, [startedAt]);

  return uptime;
}

interface UptimeProps {
  startedAt: number | null;
  className?: string;
}

/**
 * Component that displays a live uptime that updates every second
 */
export function Uptime({ startedAt, className }: UptimeProps) {
  const uptime = useUptime(startedAt);

  if (!uptime) {
    return <span className={className}>-</span>;
  }

  return <span className={className}>{uptime}</span>;
}
