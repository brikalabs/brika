/**
 * I18n Module
 *
 * Provides a `t()` function that returns I18nRef marker objects.
 * The actual translation is resolved on the frontend by the UI text renderer
 * using i18next — the plugin process only declares which keys it needs.
 *
 * Self-registers with the context module system.
 */

import type { I18nRef } from '@brika/ui-kit';
import { i18nRef } from '@brika/ui-kit';
import { type ContextCore, registerContextModule } from './register';

// ─── Setup ────────────────────────────────────────────────────────────────────

export function setupI18n(core: ContextCore) {
  const ns = `plugin:${core.manifest.name}`;

  return {
    methods: {
      /**
       * Create an I18nRef for frontend translation resolution.
       *
       * Returns a marker object that the UI text renderer resolves via i18next.
       * Works as both `<Text content={t('key')} />` and as a JSX child `{t('key')}`.
       *
       * @example
       * ```tsx
       * const { t } = useTranslation();
       * <Text content={t('conditions.clearSky')} />
       * <Text content={t('ui.dayForecast', { count: 7 })} />
       * ```
       */
      t(key: string, params?: Record<string, string | number>): I18nRef {
        return i18nRef(ns, key, params);
      },
    },

    stop() {
      // Nothing to clean up
    },
  };
}

registerContextModule('i18n', setupI18n);
