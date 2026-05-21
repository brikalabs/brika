/// <reference types="vite/client" />

import type { TranslationsBundle } from '@brika/i18n/react';
import type { HMR_EVENT, HMR_REQUEST, HMR_TRANSLATIONS, HMR_USAGE } from './hmr-events';
import type { KeyUsageMap } from './scan-usage';
import type { ValidationResult } from './types';

/**
 * Type the four HMR channels @brika/i18n-dev publishes so every
 * `import.meta.hot.on(<name>, cb)` and `server.hot.send(<name>, data)` call
 * gets a checked payload — both server-side (Vite plugin) and client-side
 * (overlay + auto-injected runtime bridge).
 *
 * Event-map keys are bound to the runtime constants via `typeof`, so a
 * rename in `./hmr-events.ts` fails the typecheck here. Payloads mirror
 * the producers in `./vite.ts`. Any future event the plugin emits should
 * be added here before being sent so the typecheck catches drift.
 */
declare module 'vite/client' {
  interface CustomEventMap {
    [HMR_EVENT]: ValidationResult;
    [HMR_REQUEST]: Record<string, never>;
    [HMR_TRANSLATIONS]: TranslationsBundle;
    [HMR_USAGE]: KeyUsageMap;
  }
}
