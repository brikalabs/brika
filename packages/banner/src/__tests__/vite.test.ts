import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { bannerPlugin } from '../vite';

const originalLog = console.log;
let captured: string[] = [];

beforeEach(() => {
  captured = [];
  console.log = (...parts: unknown[]) => {
    captured.push(parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' '));
  };
});

afterEach(() => {
  console.log = originalLog;
});

function callBuildStart(plugin: ReturnType<typeof bannerPlugin>): void {
  const hook = plugin.buildStart;
  if (typeof hook !== 'function') {
    throw new Error('buildStart hook missing from banner plugin');
  }
  // Vite normally invokes hooks with a `this` context; for this plugin we
  // don't depend on it, so a plain call is sufficient.
  Reflect.apply(hook, {}, []);
}

const sampleOptions = {
  title: 'TEST',
  subtitle: 'unit subtitle',
  metadata: { Version: '0.0.0-test' },
};

describe('bannerPlugin metadata', () => {
  test('exposes the expected name and pre-enforced ordering', () => {
    const plugin = bannerPlugin(sampleOptions);
    expect(plugin.name).toBe('brika-banner');
    expect(plugin.enforce).toBe('pre');
    expect(typeof plugin.buildStart).toBe('function');
  });
});

describe('bannerPlugin buildStart', () => {
  test('prints the banner on first invocation', () => {
    const plugin = bannerPlugin(sampleOptions);
    callBuildStart(plugin);
    expect(captured.length).toBe(1);
    expect(captured[0]).toContain('unit subtitle');
    expect(captured[0]).toContain('Version');
    expect(captured[0]).toContain('0.0.0-test');
  });

  test('dedupes across multiple buildStart calls within the same instance', () => {
    const plugin = bannerPlugin(sampleOptions);
    callBuildStart(plugin);
    callBuildStart(plugin);
    callBuildStart(plugin);
    expect(captured.length).toBe(1);
  });

  test('each plugin instance has its own shown flag', () => {
    const a = bannerPlugin(sampleOptions);
    const b = bannerPlugin({ ...sampleOptions, subtitle: 'instance b' });
    callBuildStart(a);
    callBuildStart(b);
    expect(captured.length).toBe(2);
    expect(captured[0]).toContain('unit subtitle');
    expect(captured[1]).toContain('instance b');
  });
});
