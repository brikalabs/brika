/**
 * Tests for the Routes context module.
 *
 * The route handling logic now lives in the prelude. These tests verify
 * that the SDK module correctly delegates to the bridge.
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { setupRoutes } from '../../context/routes';
import { createTestHarness } from './_test-utils';

const h = createTestHarness();

describe('setupRoutes', () => {
  let methods: ReturnType<typeof setupRoutes>['methods'];

  beforeEach(() => {
    h.reset();
    const result = setupRoutes(h.core);
    methods = result.methods;
  });

  test('registerRoute delegates to bridge with correct args', () => {
    const handler = mock(async () => ({ status: 200 }));
    methods.registerRoute('GET', '/api/status', handler);

    expect(h.bridge.registerRoute).toHaveBeenCalledWith('GET', '/api/status', handler);
  });

  test('multiple routes can be registered', () => {
    methods.registerRoute('GET', '/api/items', () => ({ status: 200 }));
    methods.registerRoute('POST', '/api/items', () => ({ status: 201 }));
    methods.registerRoute('DELETE', '/api/items/:id', () => ({ status: 204 }));

    expect(h.bridge.registerRoute).toHaveBeenCalledTimes(3);
  });
});
