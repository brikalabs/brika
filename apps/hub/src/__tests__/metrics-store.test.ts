/**
 * Tests for MetricsStore - plugin process metrics storage
 */

import 'reflect-metadata';
import { beforeEach, describe, expect, test } from 'bun:test';
import { get, useTestBed } from '@brika/di/testing';
import { MetricsStore } from '@/runtime/metrics/metrics-store';

useTestBed({
  autoStub: false,
});

describe('MetricsStore', () => {
  let store: MetricsStore;

  beforeEach(() => {
    store = get(MetricsStore);
  });

  test('records metrics for a plugin', () => {
    const sample = {
      ts: Date.now(),
      cpu: 10,
      memory: 1000,
    };

    store.record('@test/plugin', sample);

    const samples = store.get('@test/plugin');
    expect(samples).toHaveLength(1);
    expect(samples[0]).toEqual(sample);
  });

  test('stores multiple samples for same plugin', () => {
    const samples = [
      {
        ts: 1000,
        cpu: 10,
        memory: 1000,
      },
      {
        ts: 2000,
        cpu: 20,
        memory: 2000,
      },
      {
        ts: 3000,
        cpu: 15,
        memory: 1500,
      },
    ];

    for (const s of samples) {
      store.record('@test/plugin', s);
    }

    const stored = store.get('@test/plugin');
    expect(stored).toHaveLength(3);
    expect(stored).toEqual(samples);
  });

  test('keeps samples for different plugins separate', () => {
    store.record('plugin-a', {
      ts: 1000,
      cpu: 10,
      memory: 1000,
    });
    store.record('plugin-b', {
      ts: 2000,
      cpu: 20,
      memory: 2000,
    });

    expect(store.get('plugin-a')).toHaveLength(1);
    expect(store.get('plugin-b')).toHaveLength(1);
    expect(store.get('plugin-a')[0].cpu).toBe(10);
    expect(store.get('plugin-b')[0].cpu).toBe(20);
  });

  test('returns empty array for unknown plugin', () => {
    expect(store.get('unknown')).toEqual([]);
  });

  test('clears metrics for specific plugin', () => {
    store.record('plugin-a', {
      ts: 1000,
      cpu: 10,
      memory: 1000,
    });
    store.record('plugin-b', {
      ts: 2000,
      cpu: 20,
      memory: 2000,
    });

    store.clear('plugin-a');

    expect(store.get('plugin-a')).toEqual([]);
    expect(store.get('plugin-b')).toHaveLength(1);
  });

  test('clears all metrics', () => {
    store.record('plugin-a', {
      ts: 1000,
      cpu: 10,
      memory: 1000,
    });
    store.record('plugin-b', {
      ts: 2000,
      cpu: 20,
      memory: 2000,
    });

    store.clearAll();

    expect(store.get('plugin-a')).toEqual([]);
    expect(store.get('plugin-b')).toEqual([]);
  });

  test('limits samples per plugin (ring buffer behavior)', () => {
    // The store has a maxSamples of 60, but we can test the behavior
    for (let i = 0; i < 65; i++) {
      store.record('@test/plugin', {
        ts: i * 1000,
        cpu: i,
        memory: i * 100,
      });
    }

    const samples = store.get('@test/plugin');
    // Should be limited to maxSamples (60)
    expect(samples).toHaveLength(60);
    // First sample should be from index 5 (65 - 60)
    expect(samples[0].cpu).toBe(5);
  });
});
