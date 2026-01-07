import { getPreferences, log, onInit, onPreferencesChange } from '@brika/sdk';

type MyPreferences = {
  apiKey: string;
  serverUrl: string;
  maxRetries: number;
  debugMode: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
};

onInit(() => {
  const prefs = getPreferences<MyPreferences>();
  log('info', 'Plugin initialized with preferences', {
    serverUrl: prefs.serverUrl,
    maxRetries: prefs.maxRetries,
    debugMode: prefs.debugMode,
    logLevel: prefs.logLevel,
    hasApiKey: !!prefs.apiKey,
  });
});

onPreferencesChange<MyPreferences>((prefs) => {
  log('info', 'Preferences updated!', {
    serverUrl: prefs.serverUrl,
    maxRetries: prefs.maxRetries,
    debugMode: prefs.debugMode,
    logLevel: prefs.logLevel,
  });
});
