import { describe, expect, test } from 'bun:test';
import {
  ATTRIBUTE_BY_KEY,
  ATTRIBUTES,
  attributePriority,
  formatAttribute,
  SUMMARY_RULES,
  summarizeState,
  WATCHABLE_ATTRIBUTE_KEYS,
} from './attributes';

/**
 * English stand-in for the UI's `t`: the pure functions only ever see a
 * translate callback, so the tests map the keys they exercise and fall back
 * to the key itself (which also proves unknown keys pass through untouched).
 */
const EN: Record<string, string> = {
  'device.values.on': 'On',
  'device.values.off': 'Off',
  'device.values.locked': 'Locked',
  'device.values.unlocked': 'Unlocked',
  'device.values.occupied': 'Occupied',
  'device.values.clear': 'Clear',
  'device.values.closed': 'Closed',
  'device.values.open': 'Open',
  'device.press.double': 'Double press',
  'device.vacuum.running': 'Running',
  'device.vacuum.docked': 'Docked',
  'device.online': 'Online',
  'device.offline': 'Offline',
};

const t = (key: string): string => EN[key] ?? key;

describe('attribute registry', () => {
  test('keys are unique', () => {
    const keys = ATTRIBUTES.map((meta) => meta.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('watchable keys match the historical When Device Changes vocabulary', () => {
    expect(WATCHABLE_ATTRIBUTE_KEYS).toEqual([
      'on',
      'brightness',
      'hue',
      'saturation',
      'colorTempMireds',
      'colorMode',
      'locked',
      'lockState',
      'coverPosition',
      'coverOperational',
      'temperature',
      'humidity',
      'occupied',
      'contact',
      'illuminance',
      'battery',
      'buttonPosition',
      'lastPress',
      'lastButton',
      'fanMode',
      'fanSpeed',
      'vacuumState',
      'systemMode',
      'systemModeName',
    ]);
  });

  test('board-internal keys are hidden', () => {
    for (const key of ['buttonPosition', 'buttons', 'colorMode', 'lockState']) {
      expect(ATTRIBUTE_BY_KEY[key]?.hidden).toBe(true);
    }
  });

  test('every summary rule key exists in the registry', () => {
    for (const keys of Object.values(SUMMARY_RULES)) {
      for (const key of keys) {
        expect(ATTRIBUTE_BY_KEY[key]).toBeDefined();
      }
    }
  });
});

describe('formatAttribute', () => {
  test('formats known attributes with units', () => {
    expect(formatAttribute('on', true, t)).toBe('On');
    expect(formatAttribute('on', false, t)).toBe('Off');
    expect(formatAttribute('brightness', 72, t)).toBe('72%');
    expect(formatAttribute('temperature', 21.5, t)).toBe('21.5°C');
    expect(formatAttribute('illuminance', 120, t)).toBe('120 lx');
    expect(formatAttribute('locked', true, t)).toBe('Locked');
    expect(formatAttribute('occupied', false, t)).toBe('Clear');
    expect(formatAttribute('contact', true, t)).toBe('Closed');
    expect(formatAttribute('lastPress', 'double', t)).toBe('Double press');
    expect(formatAttribute('vacuumState', 66, t)).toBe('Docked');
  });

  test('falls back to String() for unknown keys', () => {
    expect(formatAttribute('mystery', 42, t)).toBe('42');
  });
});

describe('summarizeState', () => {
  test('lights and controllable switches prefer power state', () => {
    expect(summarizeState({ on: true, brightness: 50 }, 'light', ['toggle'], true, t)).toBe('On');
    expect(summarizeState({ on: false }, 'switch', ['on', 'off', 'toggle'], true, t)).toBe('Off');
  });

  test('battery remotes show the last press with its button, then battery', () => {
    const state = { lastPress: 'double', lastButton: 2, battery: 80 };
    expect(summarizeState(state, 'switch', [], true, t)).toBe('B2 double');
    expect(summarizeState({ battery: 80 }, 'switch', [], true, t)).toBe('80%');
  });

  test('a remote press without a button number shows the gesture alone', () => {
    expect(summarizeState({ lastPress: 'short' }, 'switch', [], true, t)).toBe('short');
  });

  test('vacuum prefers the operational state', () => {
    expect(summarizeState({ vacuumState: 1, battery: 50 }, 'vacuum', [], true, t)).toBe('Running');
  });

  test('locks, covers and thermostats summarize their lead attribute', () => {
    expect(summarizeState({ locked: false }, 'lock', ['lock'], true, t)).toBe('Unlocked');
    expect(summarizeState({ coverPosition: 40 }, 'cover', [], true, t)).toBe('40%');
    expect(summarizeState({ temperature: 21.5 }, 'thermostat', [], true, t)).toBe('21.5°C');
  });

  test('null attributes are skipped, falling through the rule list', () => {
    expect(summarizeState({ temperature: null, humidity: 55 }, 'sensor', [], true, t)).toBe('55%');
  });

  test('falls back to the connection state when nothing matches', () => {
    expect(summarizeState({}, 'bridge', [], true, t)).toBe('Online');
    expect(summarizeState({}, 'unknown', [], false, t)).toBe('Offline');
    expect(summarizeState({ vacuumState: null }, 'vacuum', [], true, t)).toBe('Online');
  });
});

describe('attributePriority', () => {
  test('prioritized readings sort before unprioritized ones', () => {
    expect(attributePriority('temperature')).toBeLessThan(attributePriority('hue'));
    expect(attributePriority('temperature')).toBeLessThan(attributePriority('battery'));
  });
});
