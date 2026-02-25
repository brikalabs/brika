import { useLocale } from '@/lib/use-locale';

export function useLastCheckedLabel(timestamp: number | undefined) {
  const { t, formatRelativeTime } = useLocale();

  if (!timestamp) return t('common:updates.neverChecked');

  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60)
    return t('common:updates.lastChecked', { time: t('common:time.now').toLowerCase() });

  const minutes = Math.round(seconds / 60);
  if (minutes < 60)
    return t('common:updates.lastChecked', { time: formatRelativeTime(-minutes, 'minute') });

  const hours = Math.round(minutes / 60);
  if (hours < 24)
    return t('common:updates.lastChecked', { time: formatRelativeTime(-hours, 'hour') });

  const days = Math.round(hours / 24);
  return t('common:updates.lastChecked', { time: formatRelativeTime(-days, 'day') });
}
