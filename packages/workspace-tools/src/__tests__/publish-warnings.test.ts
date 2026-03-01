import { describe, expect, test } from 'bun:test';
import type { PackageDetails } from '../package-details';
import { getPrivateWorkspaceDependencyWarnings } from '../publish-warnings';

describe('getPrivateWorkspaceDependencyWarnings', () => {
  test('returns empty array when no private workspace packages exist', () => {
    const details: PackageDetails = {
      dependencyNames: [
        '@brika/sdk',
        '@brika/ui',
      ],
    };
    const warnings = getPrivateWorkspaceDependencyWarnings(details, new Set());
    expect(warnings).toEqual([]);
  });

  test('returns empty array when dependencyNames is undefined', () => {
    const details: PackageDetails = {};
    const warnings = getPrivateWorkspaceDependencyWarnings(
      details,
      new Set([
        '@brika/private',
      ])
    );
    expect(warnings).toEqual([]);
  });

  test('returns empty array when dependencyNames is undefined and private set is empty', () => {
    const details: PackageDetails = {};
    const warnings = getPrivateWorkspaceDependencyWarnings(details, new Set());
    expect(warnings).toEqual([]);
  });

  test('warns for each private dependency match', () => {
    const details: PackageDetails = {
      dependencyNames: [
        '@brika/a',
        '@brika/b',
        '@brika/c',
      ],
    };
    const privateNames = new Set([
      '@brika/a',
      '@brika/c',
    ]);
    const warnings = getPrivateWorkspaceDependencyWarnings(details, privateNames);
    expect(warnings).toEqual([
      'depends on private workspace package "@brika/a"',
      'depends on private workspace package "@brika/c"',
    ]);
  });

  test('returns empty array when no dependencies match private set', () => {
    const details: PackageDetails = {
      dependencyNames: [
        '@brika/public-a',
        '@brika/public-b',
      ],
    };
    const privateNames = new Set([
      '@brika/private-x',
    ]);
    const warnings = getPrivateWorkspaceDependencyWarnings(details, privateNames);
    expect(warnings).toEqual([]);
  });

  test('handles single matching dependency', () => {
    const details: PackageDetails = {
      dependencyNames: [
        '@brika/private-dep',
      ],
    };
    const privateNames = new Set([
      '@brika/private-dep',
    ]);
    const warnings = getPrivateWorkspaceDependencyWarnings(details, privateNames);
    expect(warnings).toEqual([
      'depends on private workspace package "@brika/private-dep"',
    ]);
  });
});
