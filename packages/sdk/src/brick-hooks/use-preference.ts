import { getState } from './state';

const warned = new Set<string>();

/**
 * Read the full per-instance config object.
 */
export function usePreference<T extends Record<string, unknown>>(): T;
/**
 * Read a single per-instance preference with a local setter.
 * Reads directly from config — picks up external changes (e.g. ConfigSheet save) without remount.
 * The setter updates the config value and triggers a re-render immediately.
 */
export function usePreference<T>(
  name: string,
  defaultValue: T
): [
  T,
  (value: T | ((prev: T) => T)) => void,
];
export function usePreference<T>(name?: string, defaultValue?: T) {
  const state = getState();
  const { config, configKeys } = state;

  // No-args: return full config object
  if (name === undefined) {
    return config as T;
  }

  // Warn once if the key isn't declared in the brick's config schema
  if (configKeys && !configKeys.has(name) && !warned.has(name)) {
    warned.add(name);
    console.warn(
      `[usePreference] "${name}" is not declared in this brick's config schema. Available keys: ${
        [
          ...configKeys,
        ].join(', ') || '(none)'
      }`
    );
  }

  // Read current value from config
  const current = (config[name] === undefined ? defaultValue : config[name]) as T;

  // Setter: write to config and schedule re-render
  const setter = (value: T | ((prev: T) => T)) => {
    const prev = (config[name] === undefined ? defaultValue : config[name]) as T;
    const next = typeof value === 'function' ? (value as (prev: T) => T)(prev) : value;
    if (!Object.is(prev, next)) {
      config[name] = next;
      state.scheduleRender();
    }
  };

  return [
    current,
    setter,
  ];
}
