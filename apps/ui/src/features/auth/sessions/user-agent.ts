/**
 * Session-data helpers: User-Agent parsing + relative-time formatting.
 *
 * Pure functions, no React. Imported by SessionRow and
 * SessionDetailDialog.
 */

export interface SessionInfo {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: number;
  lastSeenAt: number;
  current: boolean;
}

export interface ParsedAgent {
  browser: string;
  os: string;
  isMobile: boolean;
}

export function parseUserAgent(ua: string | null): ParsedAgent {
  if (!ua) {
    return { browser: 'Unknown', os: 'Unknown', isMobile: false };
  }

  const isMobile = /Mobile|Android|iPhone|iPad/i.test(ua);

  let browser = 'Unknown';
  if (/Edg\//i.test(ua)) {
    browser = 'Edge';
  } else if (/OPR\//i.test(ua)) {
    browser = 'Opera';
  } else if (/Chrome\//i.test(ua)) {
    browser = 'Chrome';
  } else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) {
    browser = 'Safari';
  } else if (/Firefox\//i.test(ua)) {
    browser = 'Firefox';
  }

  let os = 'Unknown';
  if (/Windows/i.test(ua)) {
    os = 'Windows';
  } else if (/Mac OS X|macOS/i.test(ua)) {
    os = 'macOS';
  } else if (/Android/i.test(ua)) {
    os = 'Android';
  } else if (/iPhone|iPad/i.test(ua)) {
    os = 'iOS';
  } else if (/Linux/i.test(ua)) {
    os = 'Linux';
  }

  return { browser, os, isMobile };
}

/** "Just now" / "2 minutes ago" / "3 hours ago" / "1 day ago". */
export function formatTimeAgo(
  timestamp: number,
  formatRelativeTime: (value: number, unit: Intl.RelativeTimeFormatUnit) => string,
  nowLabel: string
): string {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) {
    return nowLabel;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return formatRelativeTime(-minutes, 'minute');
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return formatRelativeTime(-hours, 'hour');
  }
  const days = Math.round(hours / 24);
  return formatRelativeTime(-days, 'day');
}
