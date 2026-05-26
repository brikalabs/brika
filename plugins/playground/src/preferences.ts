/**
 * Preferences showcase.
 *
 * Exercises every preference type the system supports (see package.json
 * `preferences[]`) and demonstrates how to react to changes at runtime
 * via `onInit` and `onPreferencesChange`.
 */

import { getPreferences, log, onInit, onPreferencesChange } from '@brika/sdk';

export type PlaygroundPreferences = {
  apiKey: string;
  serverUrl: string;
  maxRetries: number;
  debugMode: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
};

function summarise(prefs: PlaygroundPreferences) {
  return {
    serverUrl: prefs.serverUrl,
    maxRetries: prefs.maxRetries,
    debugMode: prefs.debugMode,
    logLevel: prefs.logLevel,
    hasApiKey: !!prefs.apiKey,
  };
}

onInit(() => {
  log.info('Playground initialised', summarise(getPreferences<PlaygroundPreferences>()));
});

onPreferencesChange<PlaygroundPreferences>((prefs) => {
  log.info('Playground preferences updated', summarise(prefs));
});
