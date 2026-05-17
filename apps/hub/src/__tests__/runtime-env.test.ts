/**
 * Covers the runtime detection used by the updater to decide between
 * in-place self-update (binary) and "pull a new image" guidance (docker).
 */

import { describe, expect, test } from 'bun:test';
import { detectRuntime } from '@/runtime/runtime-env';

describe('detectRuntime', () => {
  test('respects BRIKA_RUNTIME=docker', () => {
    expect(detectRuntime({ BRIKA_RUNTIME: 'docker' }, () => false)).toBe('docker');
  });

  test('respects BRIKA_RUNTIME=binary even when /.dockerenv exists', () => {
    expect(detectRuntime({ BRIKA_RUNTIME: 'binary' }, () => true)).toBe('binary');
  });

  test('is case-insensitive and trims whitespace on the override', () => {
    expect(detectRuntime({ BRIKA_RUNTIME: '  DOCKER  ' }, () => false)).toBe('docker');
  });

  test('falls back to /.dockerenv probe when override is missing', () => {
    expect(detectRuntime({}, () => true)).toBe('docker');
    expect(detectRuntime({}, () => false)).toBe('binary');
  });

  test('ignores unknown override values and uses the probe', () => {
    expect(detectRuntime({ BRIKA_RUNTIME: 'k8s' }, () => true)).toBe('docker');
    expect(detectRuntime({ BRIKA_RUNTIME: 'k8s' }, () => false)).toBe('binary');
  });
});
