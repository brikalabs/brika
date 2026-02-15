/**
 * @brika/sdk/testing
 *
 * Test utilities for plugin developers.
 * Provides mocks for SDK hooks and context without requiring a real hub connection.
 */

import type { I18nRef } from '@brika/ui-kit';
import { i18nRef } from '@brika/ui-kit';

/**
 * Create a mock translation function that returns I18nRef markers
 * without requiring a real plugin context.
 *
 * @example
 * ```ts
 * import { createMockTranslation } from '@brika/sdk/testing';
 *
 * const { t } = createMockTranslation('plugin:my-plugin');
 * const ref = t('stats.humidity');
 * expect(ref).toEqual({ __i18n: true, ns: 'plugin:my-plugin', key: 'stats.humidity' });
 * ```
 */
export function createMockTranslation(ns = 'plugin:test-plugin') {
  return {
    t: (key: string, params?: Record<string, string | number>): I18nRef =>
      i18nRef(ns, key, params),
  };
}
