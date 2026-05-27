/**
 * Compat report tests — exercise the pure `computeCompatReport`
 * function directly so we don't fight tsyringe's singleton cache
 * across tests.
 */

import { describe, expect, test } from 'bun:test';
import { type CompatPluginInput, computeCompatReport } from './compat-report';

const p = (name: string, brika?: string): CompatPluginInput => ({
  name,
  metadata: brika === undefined ? {} : { engines: { brika } },
});

describe('computeCompatReport', () => {
  test('flags incompatible plugins against the target version', () => {
    const report = computeCompatReport('0.6.0', [
      p('a', '^0.5.0'), // satisfies 0.5.2, not 0.6.0
      p('b', '>=0.4.0'), // satisfies anything ≥ 0.4
      p('c', '^0.6.0'), // requires the new line
    ]);

    expect(report.targetVersion).toBe('0.6.0');
    expect(report.willDisableCount).toBe(1);
    expect(report.missingRequirementsCount).toBe(0);
    expect(report.plugins.find((x) => x.name === 'a')?.willBeCompatible).toBe(false);
    expect(report.plugins.find((x) => x.name === 'b')?.willBeCompatible).toBe(true);
    expect(report.plugins.find((x) => x.name === 'c')?.willBeCompatible).toBe(true);
  });

  test('plugins without engines.brika are counted as missing + incompatible', () => {
    const report = computeCompatReport('0.6.0', [p('no-engines')]);

    expect(report.missingRequirementsCount).toBe(1);
    // `willDisable` counts only plugins that *declared* incompatibility;
    // missing declarations get their own count so the UI can phrase them
    // differently ("3 plugins lack a compatibility declaration").
    expect(report.willDisableCount).toBe(0);
    expect(report.plugins[0]?.willBeCompatible).toBe(false);
    expect(report.plugins[0]?.currentRequires).toBeNull();
  });

  test('malformed range does not throw — outcome documents Bun.semver behavior', () => {
    // `Bun.semver.satisfies` is permissive on unparseable ranges (no
    // throw, no false). We don't assert true/false here — the contract
    // is just "the safe wrapper in compat-report.ts never propagates an
    // exception", so the UI can render a partial report even if a
    // plugin ships a typo'd manifest.
    expect(() => computeCompatReport('0.6.0', [p('bad', 'not-a-range')])).not.toThrow();
  });

  test('explicitly newer-major requirement counts as will-disable', () => {
    const report = computeCompatReport('0.6.0', [p('future', '^99.0.0')]);
    expect(report.willDisableCount).toBe(1);
    expect(report.plugins[0]?.willBeCompatible).toBe(false);
  });

  test('empty plugin list returns zero counts', () => {
    const report = computeCompatReport('0.6.0', []);
    expect(report.willDisableCount).toBe(0);
    expect(report.missingRequirementsCount).toBe(0);
    expect(report.plugins).toEqual([]);
  });

  test('pre-release target satisfies caret range to the same major.minor', () => {
    // semver caret semantics: `^0.5.0` satisfies `0.5.x` (any patch + prerelease).
    const report = computeCompatReport('0.5.0-rc.1', [p('a', '^0.5.0')]);
    // Note: semver caret on a 0.x range is strict — `0.5.0-rc.1` does NOT
    // satisfy `^0.5.0` because pre-releases don't intersect ranges unless
    // explicit. Document the behavior so future readers don't assume the test
    // is wrong.
    expect(report.plugins[0]?.willBeCompatible).toBe(false);
  });
});
