/**
 * @brika/auth - Scope Route Tests (list scopes)
 */

import { describe, expect, test } from 'bun:test';
import { provide, useTestBed } from '@brika/di/testing';
import { TestApp } from '@brika/router/testing';
import { SCOPES_REGISTRY } from '../constants';
import { scopeRoutes } from '../server/routes/scopes';
import { ScopeService } from '../services/ScopeService';
import { Scope } from '../types';

describe('GET /scopes', () => {
  let app: ReturnType<typeof TestApp.create>;

  useTestBed(() => {
    // Use provide() instead of stub() to avoid deep-stub wrapping the SCOPES_REGISTRY object
    provide(ScopeService, {
      getRegistry: () => SCOPES_REGISTRY,
    });
    app = TestApp.create(scopeRoutes);
  });

  test('returns scopes registry and categories', async () => {
    const res = await app.get('/scopes');
    expect(res.status).toBe(200);

    const body = res.body as {
      scopes: Record<
        string,
        {
          description: string;
          category: string;
        }
      >;
      categories: string[];
    };

    expect(body.categories).toEqual([
      'admin',
      'workflow',
      'board',
      'plugin',
      'settings',
    ]);
    const adminScope = body.scopes[Scope.ADMIN_ALL];
    expect(adminScope).toBeDefined();
    if (!adminScope) {
      throw new Error('Expected admin scope to be defined');
    }
    expect(adminScope.description).toBe('Full administrative access');
    expect(adminScope.category).toBe('admin');
  });

  test('includes all defined scopes', async () => {
    const res = await app.get('/scopes');
    const body = res.body as {
      scopes: Record<string, unknown>;
    };

    for (const scope of Object.values(Scope)) {
      expect(body.scopes[scope]).toBeDefined();
    }
  });

  test('is publicly accessible (no session required)', async () => {
    const res = await app.get('/scopes');
    expect(res.status).toBe(200);
  });
});
