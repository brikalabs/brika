/** Format milliseconds as m:ss */
export function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/** Convert progress/duration to 0-100 percentage */
export function progressPercent(progress: number, duration: number): number {
  if (duration <= 0) return 0;
  return Math.round((progress / duration) * 100);
}
