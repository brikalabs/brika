/**
 * Tests for SDK preferences, lifecycle, bricks, routes, and location APIs
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { z } from 'zod';
import type { DeviceLocation } from '../api/location';
import { InvalidInputError } from '../errors';

const mockGetPreferences = mock(() => ({
  apiKey: 'test-key',
}));
const mockOnPreferencesChange = mock(() => () => {});
const mockUpdatePreference = mock(() => {});
const mockDefinePreferenceOptions = mock(() => {});
const mockOnInit = mock((_fn: () => void) => () => {});
const mockOnStop = mock((_fn: () => void) => () => {});
const mockOnUninstall = mock((_fn: () => void) => () => {});
const mockRegisterBrickType = mock(() => {});
const mockRegisterRoute = mock(() => {});
const mockGetLocation = mock((): Promise<DeviceLocation | null> => Promise.resolve(null));

mock.module('../context', () => ({
  getContext: () => ({
    getPreferences: mockGetPreferences,
    onPreferencesChange: mockOnPreferencesChange,
    updatePreference: mockUpdatePreference,
    definePreferenceOptions: mockDefinePreferenceOptions,
    onInit: mockOnInit,
    onStop: mockOnStop,
    onUninstall: mockOnUninstall,
    registerBrickType: mockRegisterBrickType,
    registerRoute: mockRegisterRoute,
    getLocation: mockGetLocation,
  }),
}));

const { getPreferences, onPreferencesChange, setPreference, definePreferenceOptions } =
  await import('../api/preferences');
const { onInit, onStop, onUninstall } = await import('../api/lifecycle');
const { defineRoute } = await import('../api/routes');
const { getDeviceLocation } = await import('../api/location');

describe('preferences API', () => {
  beforeEach(() => {
    mockGetPreferences.mockClear();
    mockOnPreferencesChange.mockClear();
    mockUpdatePreference.mockClear();
    mockDefinePreferenceOptions.mockClear();
  });

  test('getPreferences delegates to context', () => {
    const prefs = getPreferences();
    expect(prefs).toEqual({
      apiKey: 'test-key',
    });
    expect(mockGetPreferences).toHaveBeenCalledTimes(1);
  });

  test('getPreferences without schema returns Record<string, unknown> (backward compat)', () => {
    const prefs = getPreferences();
    // Backward-compat: shape is the raw record from the context.
    expect(prefs).toEqual({
      apiKey: 'test-key',
    });
  });

  test('getPreferences with a matching schema returns the typed value', () => {
    const schema = z.object({
      apiKey: z.string(),
    });
    const prefs = getPreferences(schema);
    expect(prefs.apiKey).toBe('test-key');
  });

  test('getPreferences with a mismatched schema throws InvalidInputError with path + message', () => {
    const schema = z.object({
      apiKey: z.number(), // raw is a string -> should fail
    });
    let captured: unknown;
    try {
      getPreferences(schema);
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(InvalidInputError);
    const err = captured as InvalidInputError;
    expect(err.field).toBe('preferences');
    // Message includes the failing path and the field-name prefix from InvalidInputError.
    expect(err.message).toContain('preferences');
    expect(err.message).toContain('apiKey');
  });

  test('onPreferencesChange delegates to context and returns unsubscribe', () => {
    const handler = () => {};
    const unsub = onPreferencesChange(handler);
    expect(mockOnPreferencesChange).toHaveBeenCalledTimes(1);
    expect(typeof unsub).toBe('function');
  });

  test('setPreference delegates to context', () => {
    setPreference('theme', 'dark');
    expect(mockUpdatePreference).toHaveBeenCalledWith('theme', 'dark');
  });

  test('definePreferenceOptions delegates to context', () => {
    const provider = () => [
      {
        value: 'a',
        label: 'A',
      },
    ];
    definePreferenceOptions('device', provider);
    expect(mockDefinePreferenceOptions).toHaveBeenCalledWith('device', provider);
  });
});

describe('lifecycle API', () => {
  beforeEach(() => {
    mockOnInit.mockClear();
    mockOnStop.mockClear();
    mockOnUninstall.mockClear();
  });

  test('onInit delegates to context and returns unsubscribe', () => {
    const fn = () => {};
    const unsub = onInit(fn);
    expect(mockOnInit).toHaveBeenCalledWith(fn);
    expect(typeof unsub).toBe('function');
  });

  test('onStop delegates to context and returns unsubscribe', () => {
    const fn = () => {};
    const unsub = onStop(fn);
    expect(mockOnStop).toHaveBeenCalledWith(fn);
    expect(typeof unsub).toBe('function');
  });

  test('onUninstall delegates to context and returns unsubscribe', () => {
    const fn = () => {};
    const unsub = onUninstall(fn);
    expect(mockOnUninstall).toHaveBeenCalledWith(fn);
    expect(typeof unsub).toBe('function');
  });
});

describe('routes API', () => {
  beforeEach(() => {
    mockRegisterRoute.mockClear();
  });

  test('defineRoute normalizes path with leading slash', () => {
    const handler = () => ({
      status: 200 as const,
    });
    defineRoute('GET', '/status', handler);
    expect(mockRegisterRoute).toHaveBeenCalledWith('GET', '/status', handler);
  });

  test('defineRoute adds leading slash if missing', () => {
    const handler = () => ({
      status: 200 as const,
    });
    defineRoute('POST', 'data', handler);
    expect(mockRegisterRoute).toHaveBeenCalledWith('POST', '/data', handler);
  });
});

describe('location API', () => {
  beforeEach(() => {
    mockGetLocation.mockClear();
  });

  test('getDeviceLocation returns null when no location configured', async () => {
    const result = await getDeviceLocation();
    expect(result).toBeNull();
  });

  test('getDeviceLocation returns location from context', async () => {
    const location: DeviceLocation = {
      latitude: 46.52,
      longitude: 6.63,
      street: '1 Rue du Port',
      city: 'Lausanne',
      state: 'Vaud',
      postalCode: '1000',
      country: 'Switzerland',
      countryCode: 'CH',
      formattedAddress: '1 Rue du Port, 1000 Lausanne, Switzerland',
    };
    mockGetLocation.mockResolvedValueOnce(location);
    const result = await getDeviceLocation();
    expect(result).toEqual(location);
  });
});
