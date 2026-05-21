/**
 * Host-side wrapper around `@brika/i18n/react` that bakes brika's `plugin:`
 * namespace convention into `tp()`.
 *
 * The generic `@brika/i18n` package treats `tp(namespace, key, default?)` as
 * a pass-through — the namespace is whatever you pass. Brika stores plugin
 * translations under `plugin:<pkg-name>` (see `PLUGIN_NS_PREFIX` in
 * `apps/hub/src/runtime/i18n/i18n-types.ts`). Callers say
 * `tp('@brika/plugin-weather', 'stats.feelsLike')` and expect the lookup to
 * land in namespace `plugin:@brika/plugin-weather`. This wrapper prepends the
 * convention so existing call sites keep working.
 */

import { type LocaleUtils as RawLocaleUtils, useLocale as useLocaleRaw } from '@brika/i18n/react';
import { useMemo } from 'react';

export type {
  DurationFormatOptions,
  DurationInput,
  I18nT,
  I18nTp,
  LocaleUtils,
} from '@brika/i18n/react';

const PLUGIN_NS_PREFIX = 'plugin:';

export function useLocale(): RawLocaleUtils {
  const raw = useLocaleRaw();
  return useMemo<RawLocaleUtils>(
    () => ({
      ...raw,
      tp: (pluginId: string, key: string, defaultValue?: string, __cs?: string) =>
        raw.tp(`${PLUGIN_NS_PREFIX}${pluginId}`, key, defaultValue, __cs),
    }),
    [raw]
  );
}
