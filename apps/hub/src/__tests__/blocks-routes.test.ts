import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { useTestBed } from '@brika/di/testing';
import { TestApp } from '@brika/router/testing';
import { BlockRegistry } from '@/runtime/blocks';
import { blocksRoutes } from '@/runtime/http/routes/blocks';

const di = useTestBed();

describe('blocks routes', () => {
  let app: ReturnType<typeof TestApp.create>;

  beforeEach(() => {
    di.stub(BlockRegistry, { list: () => [], listByCategory: () => ({}) });
    app = TestApp.create(blocksRoutes);
  });

  test('GET /api/blocks returns list', async () => {
    const res = await app.get('/api/blocks');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBeTrue();
  });

  test('GET /api/blocks/categories returns categories', async () => {
    const res = await app.get('/api/blocks/categories');

    expect(res.status).toBe(200);
    expect(typeof res.body).toBe('object');
  });
});
