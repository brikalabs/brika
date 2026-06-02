/**
 * Tests for analytics HTTP routes
 */

import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import { stub, useTestBed } from '@brika/di/testing';
import { TestApp } from '@brika/router/testing';
import { Analytics } from '@/runtime/analytics/analytics';
import { EventStore } from '@/runtime/analytics/event-store';
import { analyticsRoutes } from '@/runtime/http/routes/analytics';

describe('analytics routes', () => {
  let app: ReturnType<typeof TestApp.create>;
  let mockAnalytics: {
    capture: ReturnType<typeof mock>;
    recent: ReturnType<typeof mock>;
  };
  let mockEventStore: {
    query: ReturnType<typeof mock>;
    clear: ReturnType<typeof mock>;
    count: ReturnType<typeof mock>;
    topNames: ReturnType<typeof mock>;
    getPluginNames: ReturnType<typeof mock>;
  };

  useTestBed(() => {
    mockAnalytics = {
      capture: mock(),
      recent: mock().mockReturnValue([]),
    };
    mockEventStore = {
      query: mock().mockReturnValue({ events: [], nextCursor: null }),
      clear: mock().mockReturnValue(0),
      count: mock().mockReturnValue(0),
      topNames: mock().mockReturnValue([]),
      getPluginNames: mock().mockReturnValue([]),
    };
    stub(Analytics, mockAnalytics);
    stub(EventStore, mockEventStore);
    app = TestApp.create(analyticsRoutes);
  });

  test('POST /api/analytics/capture records a UI event', async () => {
    const res = await app.post<{ ok: boolean }>('/api/analytics/capture', {
      name: 'board.created',
      props: { columns: 12 },
      distinctId: 'sess-1',
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBeTrue();
    expect(mockAnalytics.capture).toHaveBeenCalledWith(
      'board.created',
      { columns: 12 },
      { source: 'ui', distinctId: 'sess-1' }
    );
  });

  test('POST /api/analytics/capture rejects an empty name', async () => {
    const res = await app.post('/api/analytics/capture', { name: '' });
    expect(res.status).toBe(400);
  });

  test('GET /api/analytics queries stored events', async () => {
    mockEventStore.query.mockReturnValue({
      events: [{ id: 1, ts: 1000, name: 'a.used', source: 'ui' }],
      nextCursor: null,
    });

    const res = await app.get('/api/analytics?name=a.used&limit=10');

    expect(res.status).toBe(200);
    expect(mockEventStore.query).toHaveBeenCalled();
  });

  test('GET /api/analytics/names returns top names', async () => {
    mockEventStore.topNames.mockReturnValue([{ name: 'a.used', count: 3 }]);

    const res = await app.get<{ names: Array<{ name: string; count: number }> }>(
      '/api/analytics/names'
    );

    expect(res.status).toBe(200);
    expect(res.body.names[0]).toEqual({ name: 'a.used', count: 3 });
  });

  test('GET /api/analytics/stats returns totals and forwarding status', async () => {
    mockEventStore.count.mockReturnValue(7);

    const res = await app.get<{ total: number; remoteForwarding: boolean }>('/api/analytics/stats');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(7);
    expect(typeof res.body.remoteForwarding).toBe('boolean');
  });

  test('DELETE /api/analytics clears events', async () => {
    mockEventStore.clear.mockReturnValue(4);

    const res = await app.delete<{ ok: boolean; deleted: number }>('/api/analytics');

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(4);
  });
});
