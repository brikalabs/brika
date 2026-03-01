/**
 * Tests for SDK preferences, lifecycle, bricks, routes, and location APIs
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { BrickComponent, BrickTypeSpec } from '@brika/ui-kit';
import { Text } from '@brika/ui-kit';
import type { DeviceLocation } from '../api/location';

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
const { defineBrick } = await import('../api/bricks');
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

const testSpec: BrickTypeSpec = {
  id: 'test',
  name: 'Test',
  families: ['sm'],
};
const testComponent: BrickComponent = () =>
  Text({
    content: 'test',
  });

describe('bricks API', () => {
  beforeEach(() => {
    mockRegisterBrickType.mockClear();
  });

  test('defineBrick returns compiled brick type', () => {
    const result = defineBrick(testSpec, testComponent);
    expect(result.spec).toBe(testSpec);
    expect(result.component).toBe(testComponent);
  });

  test('defineBrick tries to register with context', () => {
    defineBrick(testSpec, testComponent);
    expect(mockRegisterBrickType).toHaveBeenCalledTimes(1);
  });

  test('defineBrick handles context not available', () => {
    mockRegisterBrickType.mockImplementationOnce(() => {
      throw new Error('No context');
    });
    const result = defineBrick(testSpec, testComponent);
    expect(result.spec).toBe(testSpec);
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
      timezone: 'Europe/Zurich',
    };
    mockGetLocation.mockResolvedValueOnce(location);
    const result = await getDeviceLocation();
    expect(result).toEqual(location);
  });
});
