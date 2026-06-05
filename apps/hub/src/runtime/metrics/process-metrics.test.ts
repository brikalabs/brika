/**
 * Tests for Process Metrics
 */

import { describe, expect, test } from 'bun:test';
import { getProcessMetrics } from '@/runtime/metrics/process-metrics';

describe('getProcessMetrics', () => {
  test('returns metrics for current process', async () => {
    const metrics = await getProcessMetrics(process.pid);

    expect(metrics).not.toBeNull();
    if (metrics) {
      expect(typeof metrics.cpu).toBe('number');
      expect(metrics.cpu).toBeGreaterThanOrEqual(0);
      expect(typeof metrics.memory).toBe('number');
      expect(metrics.memory).toBeGreaterThan(0);
      expect(typeof metrics.ts).toBe('number');
      expect(metrics.ts).toBeLessThanOrEqual(Date.now());
    }
  });

  test('returns null for non-existent process', async () => {
    const metrics = await getProcessMetrics(999999999);

    expect(metrics).toBeNull();
  });

  test('returns null for invalid pid', async () => {
    const metrics = await getProcessMetrics(-1);

    expect(metrics).toBeNull();
  });
});
