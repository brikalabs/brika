import { toast } from '@brika/clay';
import { useEffect } from 'react';
import { getStreamUrl } from '@/lib/query';
import { subscribeSharedEvents } from '@/lib/shared-event-source';
import { useLocale } from '@/lib/use-locale';
import { parsePluginCompileEvent } from './use-plugin-compile';

/**
 * App-wide safety net for build FAILURES. Progress and success are shown in
 * context by {@link CompileTrace} on the plugin card and detail page; only an
 * error warrants interrupting wherever the operator happens to be, so a failed
 * build raises a toast even when its plugin is off-screen.
 */
export function CompileNotifications() {
  const { t } = useLocale();

  useEffect(() => {
    return subscribeSharedEvents(getStreamUrl('/api/stream/events'), (ev) => {
      const event = parsePluginCompileEvent(ev.data);
      if (event?.phase === 'error') {
        toast.error(t('common:compile.failedName', { name: event.name }), {
          id: `compile:${event.uid}`,
          description: event.message,
        });
      }
    });
  }, [t]);

  return null;
}
