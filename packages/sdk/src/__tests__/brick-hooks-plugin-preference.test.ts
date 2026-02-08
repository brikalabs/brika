import { describe, expect, mock, test, beforeEach } from 'bun:test';

// Shared mutable preferences object that the mock reads from
let prefs: Record<string, unknown> = {};

// Mock getContext — usePluginPreference calls getContext().getPreferences()
mock.module('../context', () => ({
  getContext: () => ({
    getPreferences: () => prefs,
  }),
}));

// Import AFTER mock.module so the mock is active
const { usePluginPreference } = await import('../brick-hooks/use-plugin-preference');

describe('usePluginPreference', () => {
  beforeEach(() => {
    prefs = {};
  });

  test('returns the preference value when key exists', () => {
    prefs = { theme: 'dark', lang: 'en' };
    const result = usePluginPreference('theme', 'light');
    expect(result).toBe('dark');
  });

  test('returns defaultValue when key is missing', () => {
    prefs = {};
    const result = usePluginPreference('missing', 'fallback');
    expect(result).toBe('fallback');
  });

  test('returns defaultValue when preference value is undefined', () => {
    prefs = { key: undefined };
    const result = usePluginPreference('key', 'default');
    expect(result).toBe('default');
  });

  test('returns preference value even when it is falsy (0, false, empty string)', () => {
    prefs = { count: 0, enabled: false, name: '' };

    expect(usePluginPreference('count', 99)).toBe(0);
    expect(usePluginPreference('enabled', true)).toBe(false);
    expect(usePluginPreference('name', 'default')).toBe('');
  });

  test('returns null preference value instead of default', () => {
    prefs = { value: null };
    const result = usePluginPreference('value', 'default');
    expect(result).toBeNull();
  });
});
