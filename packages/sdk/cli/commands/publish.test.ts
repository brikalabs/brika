import { describe, expect, test } from 'bun:test';
import { buildPublishArgs, resolveTag } from './publish';

describe('resolveTag', () => {
  test('a stable version routes to latest', () => {
    expect(resolveTag('1.2.3')).toBe('latest');
  });

  test('a prerelease version routes to next', () => {
    expect(resolveTag('0.5.0-rc.1')).toBe('next');
  });

  test('an explicit tag overrides the derived one', () => {
    expect(resolveTag('1.2.3', 'beta')).toBe('beta');
    expect(resolveTag('0.5.0-rc.1', 'beta')).toBe('beta');
  });

  test('an empty explicit tag falls back to the derived one', () => {
    expect(resolveTag('1.2.3', '')).toBe('latest');
  });
});

describe('buildPublishArgs', () => {
  test('always publishes public with --ignore-scripts', () => {
    expect(buildPublishArgs({ tag: 'latest', dryRun: false, provenance: false })).toEqual([
      'npm',
      'publish',
      '--access',
      'public',
      '--tag',
      'latest',
      '--ignore-scripts',
    ]);
  });

  test('appends --provenance when requested', () => {
    expect(buildPublishArgs({ tag: 'latest', dryRun: false, provenance: true })).toContain(
      '--provenance'
    );
  });

  test('appends --dry-run when requested', () => {
    expect(buildPublishArgs({ tag: 'next', dryRun: true, provenance: false })).toContain(
      '--dry-run'
    );
  });

  test('carries the resolved dist-tag through', () => {
    expect(buildPublishArgs({ tag: 'next', dryRun: false, provenance: false })).toEqual([
      'npm',
      'publish',
      '--access',
      'public',
      '--tag',
      'next',
      '--ignore-scripts',
    ]);
  });
});
