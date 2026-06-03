/**
 * Tests for analytics HTTP routes
 */

import 'reflect-metadata';
import { describe, expect, mock, test } from 'bun:test';
import { Analytics, EventStore } from '@brika/analytics';
import { Scope } from '@brika/auth';
import { stub, useTestBed } from '@brika/di/testing';
import type { Middleware } from '@brika/router';
import { TestApp } from '@brika/router/testing';
import { analyticsRoutes } from '@/runtime/http/routes/analytics';

// Stand-in for the auth middleware: the analytics group runs under
// requireAuth() in production, so the capture handler can rely on a session.
function sessionMiddleware(scopes: Scope[] = []): Middleware {
  return async (c, next) => {
    c.set('session', {
      id: 'sess',
      userId: 'user-42',
      userEmail: 'u@example.com',
      userName: 'U',
      userRole: 'admin',
      scopes,
    });
    await next();
  };
}

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
    timeSeries: ReturnType<typeof mock>;
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
      timeSeries: mock().mockReturnValue([]),
      getPluginNames: mock().mockReturnValue([]),
    };
    stub(Analytics, mockAnalytics);
    stub(EventStore, mockEventStore);
    app = TestApp.create(analyticsRoutes, [sessionMiddleware()]);
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
      { source: 'ui', distinctId: 'sess-1', userId: 'user-42' }
    );
  });

  test('POST /api/analytics/capture rejects an empty name', async () => {
    const res = await app.post('/api/analytics/capture', { name: '' });
    expect(res.status).toBe(400);
  });

  test('POST /api/analytics/capture rejects props exceeding the size cap', async () => {
    // 16 KiB is the cap; 32 KiB of plain string content trivially exceeds it
    // once JSON-serialized.
    const huge = { blob: 'x'.repeat(32_768) };
    const res = await app.post('/api/analytics/capture', { name: 'big', props: huge });
    expect(res.status).toBe(400);
    expect(mockAnalytics.capture).not.toHaveBeenCalled();
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

  test('GET /api/analytics/recent returns the in-memory ring buffer', async () => {
    mockAnalytics.recent.mockReturnValue([
      { ts: 1, name: 'x', source: 'hub' },
      { ts: 2, name: 'y', source: 'ui' },
    ]);

    const res = await app.get<{ events: Array<{ name: string }> }>('/api/analytics/recent');

    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(2);
    expect(res.body.events[0]?.name).toBe('x');
  });

  test('GET /api/analytics/names returns top names', async () => {
    mockEventStore.topNames.mockReturnValue([{ name: 'a.used', count: 3 }]);

    const res = await app.get<{ names: Array<{ name: string; count: number }> }>(
      '/api/analytics/names'
    );

    expect(res.status).toBe(200);
    expect(res.body.names[0]).toEqual({ name: 'a.used', count: 3 });
  });

  test('GET /api/analytics/timeseries forwards bucketMs and returns buckets', async () => {
    mockEventStore.timeSeries.mockReturnValue([
      { bucket: 0, count: 2 },
      { bucket: 3_600_000, count: 1 },
    ]);

    const res = await app.get<{
      bucketMs: number;
      buckets: Array<{ bucket: number; count: number }>;
    }>('/api/analytics/timeseries?bucketMs=3600000&name=a&startTs=0');

    expect(res.status).toBe(200);
    expect(res.body.bucketMs).toBe(3_600_000);
    expect(res.body.buckets).toHaveLength(2);
    // The handler should pass bucketMs through and the rest of the query as filters.
    const [bucketMs, filters] = mockEventStore.timeSeries.mock.calls[0] ?? [];
    expect(bucketMs).toBe(3_600_000);
    expect(filters).toMatchObject({ startTs: 0 });
    expect(filters).not.toHaveProperty('bucketMs');
  });

  test('GET /api/analytics/stats returns totals and forwarding status', async () => {
    mockEventStore.count.mockReturnValue(7);

    const res = await app.get<{ total: number; remoteForwarding: boolean }>('/api/analytics/stats');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(7);
    expect(typeof res.body.remoteForwarding).toBe('boolean');
  });

  test('DELETE /api/analytics requires admin scope', async () => {
    // A logged-in user without ADMIN_ALL should be refused; the store must not
    // be touched. Otherwise any authed user could wipe captured usage.
    const res = await app.delete('/api/analytics');
    expect(res.status).toBe(403);
    expect(mockEventStore.clear).not.toHaveBeenCalled();
  });

  test('DELETE /api/analytics clears events when caller is admin', async () => {
    // Rebuild the app with an admin-scoped session middleware.
    app = TestApp.create(analyticsRoutes, [sessionMiddleware([Scope.ADMIN_ALL])]);
    mockEventStore.clear.mockReturnValue(4);

    const res = await app.delete<{ ok: boolean; deleted: number }>('/api/analytics');

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(4);
  });
});

describe('analytics routes without a session', () => {
  let app: ReturnType<typeof TestApp.create>;
  let mockAnalytics: {
    capture: ReturnType<typeof mock>;
    recent: ReturnType<typeof mock>;
  };

  useTestBed(() => {
    mockAnalytics = {
      capture: mock(),
      recent: mock().mockReturnValue([]),
    };
    stub(Analytics, mockAnalytics);
    stub(EventStore, {
      query: mock().mockReturnValue({ events: [], nextCursor: null }),
    });
    // No session middleware here — pin that the route itself refuses unauthed
    // capture (in production the requireAuth() group handles this, but a
    // regression should still surface from the handler's requireSession call).
    app = TestApp.create(analyticsRoutes);
  });

  test('POST /api/analytics/capture returns 401 without a session', async () => {
    const res = await app.post('/api/analytics/capture', { name: 'x' });
    expect(res.status).toBe(401);
    expect(mockAnalytics.capture).not.toHaveBeenCalled();
  });
});
